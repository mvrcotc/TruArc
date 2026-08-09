/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  TruArc — Collision & Line Planning (Section 4)                  ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Checks a simulated trajectory against real obstacles: the voxel
 * occupancy grid (`voxelGridFormat.js`, authoritative — it encodes real
 * canopy gaps no per-tree primitive can represent) for hit/no-hit, and
 * the per-tree inventory (`{course}_trees.json`, schema.py's
 * TreeRecord) as simple vertical-cylinder capsules for attributing
 * *which* tree a hit belongs to and for a continuous clearance-margin
 * reading (the voxel grid is a boolean field — it can say "occupied" or
 * not, but not "how close").
 *
 * ── COLLISION SPACE ──────────────────────────────────────────────────
 * All math here happens in "collision space": (x, y) = the voxel grid's
 * own local metres via `voxelGridFormat.js`'s `worldToGridXY(lng, lat)`
 * (already corrected for UTM convergence — see that module), and z =
 * absolute altitude, unchanged. No z-transform is needed because
 * `origin_z`/`ground_elev_m`/tree `height_m` are already all defined as
 * absolute altitude elsewhere in this codebase (voxelgrid.py bins raw
 * point Z, not height-above-ground — see pipeline.py's build_voxel_grid
 * call) — see voxelGridFormat.js's header comment for the full argument.
 *
 * ── VOXEL TRAVERSAL: EXACT, NOT THE ROADMAP'S LITERAL "~0.5 m STEPS" ──
 * docs/ACCURACY_ROADMAP.md §4 step 1 says to sample the trajectory at
 * ~0.5 m steps against the voxel grid. This module does something
 * strictly better for the voxel check: Amanatides-Woo fast voxel
 * traversal (`traverseSegmentVoxels`), which walks EVERY cell a segment
 * passes through with no possibility of skipping a thin diagonal sliver
 * of an obstacle — a real risk with fixed-distance point sampling at
 * shallow grazing angles (a 0.5 m step can jump clean over a 1 m cell
 * near a corner). This is a deliberate improvement over the literal
 * spec, flagged here and in the commit message rather than silently
 * substituted. The ~0.5 m step sampling IS still used, as specified,
 * for the secondary tree-capsule clearance/attribution pass
 * (`resamplePolyline` + `attributeTreeAtHit`), where a continuous
 * distance reading is wanted anyway and exact swept-capsule intersection
 * would be substantial extra complexity for no accuracy the voxel grid
 * doesn't already provide for the hit/no-hit question.
 *
 * ── TIE-BREAKING AT CELL BOUNDARIES ──────────────────────────────────
 * When a ray's next crossing is tied across more than one axis (it
 * passes exactly through a grid edge or corner — e.g. an exact
 * 45°-diagonal shot), there are two defensible answers, and for
 * collision detection they are NOT equally safe:
 *
 *   - Advance ALL tied axes at once. The ray jumps straight to the
 *     diagonal cell, visiting ONLY the cells it passes through with
 *     positive measure: [(0,0), (1,1)]. Geometrically tight.
 *   - Advance ONE axis (standard Amanatides-Woo). The traversal also
 *     visits an off-diagonal cell: [(0,0), (1,0), (1,1)]. A superset.
 *
 * This module deliberately takes the SECOND, conservative option. The
 * tight version has a false-negative hole exactly at the tie: if the
 * two occupied cells are the off-diagonal pair (1,0) and (0,1) — two
 * obstacles touching at that corner — a ray through the corner passes
 * through neither in the tight traversal and reports NO HIT, even
 * though rays perturbed by ±1e-7 to either side both report one. That
 * discontinuity is exactly what the roadmap's "randomized trajectories
 * never pass through voxels marked occupied" criterion rules out, and
 * over-reporting a measure-zero graze is the right way to be wrong in
 * a hit detector. Ties are broken x > y > z for determinism.
 *
 * (Practical note: in absolute working-CRS metres — x ≈ 261191.44 —
 * exact ties essentially never arise from real trajectory data. This
 * choice is about which way the algorithm fails at the boundary, not
 * about a case that shows up every throw.)
 */

import { isOccupied } from './voxelGridFormat.js';

const METERS_TO_FEET = 3.28084;

// ─── COORDINATE ADAPTERS ─────────────────────────────────────────────

/**
 * A trajectory point `{lng, lat, altitude}` (trajectoryToWGS84's output
 * shape) → collision space `{x, y, z}`.
 *
 * `worldToGridXY` returns coordinates 0-based FROM the grid's origin
 * (its own JSDoc: "local (x, y) metres from its origin"), but the grid
 * math below (`traverseSegmentVoxels`, mirroring `voxelGridFormat.js`'s
 * already-established `cellAt(x,y,z)` convention — see its test
 * `header.cellAt(header.originX + 2.5, ...)`) expects coordinates in the
 * SAME absolute working-CRS frame as `header.originX/Y/Z` themselves.
 * Collision space therefore adds the origin back, matching `cellAt`'s
 * contract rather than reinventing a third convention.
 */
export function toCollisionSpace(header, point) {
    const { x, y } = header.worldToGridXY(point.lng, point.lat);
    return { x: header.originX + x, y: header.originY + y, z: point.altitude };
}

/**
 * A Section 2 TreeRecord (schema.py; snake_case fields straight from
 * JSON, matching TreeLayer.js's convention) → a vertical-cylinder
 * capsule in collision space: centre (x, y), constant `radius`
 * (crown_radius_m — a real capsule/lathed-profile taper is available
 * per tree via `profile`, but a constant-radius cylinder is what the
 * roadmap's "capsules" option calls for and is a strictly conservative
 * bound (never narrower than the true crown at any height)), and an
 * absolute-altitude z-range [ground+crown_base, ground+height].
 */
export function toCapsule(header, tree, index) {
    const { x, y } = header.worldToGridXY(tree.lng, tree.lat);
    return {
        index,
        x: header.originX + x,
        y: header.originY + y,
        radius: tree.crown_radius_m,
        zMin: tree.ground_elev_m + tree.crown_base_m,
        zMax: tree.ground_elev_m + tree.height_m,
    };
}

export function buildTreeCapsules(header, trees) {
    return trees.map((t, i) => toCapsule(header, t, i));
}

// ─── AMANATIDES-WOO VOXEL TRAVERSAL ───────────────────────────────────

function clampIndex(i, n) {
    return Math.min(n - 1, Math.max(0, i));
}

function axisState(p0v, dv, originV, cellM, ixv) {
    if (dv > 0) {
        const boundary = originV + (ixv + 1) * cellM;
        return { step: 1, tMax: (boundary - p0v) / dv, tDelta: cellM / dv };
    }
    if (dv < 0) {
        const boundary = originV + ixv * cellM;
        return { step: -1, tMax: (boundary - p0v) / dv, tDelta: cellM / -dv };
    }
    return { step: 0, tMax: Infinity, tDelta: Infinity };
}

/**
 * Every grid cell the segment p0→p1 (collision-space metres) passes
 * through, in order, clipped to the grid's bounds. Returns
 * `[{ix, iy, iz, t}]` where `t` in [0,1] is the segment fraction at
 * which the ray ENTERS that cell (so callers can recover the exact
 * contact point via lerp(p0, p1, t)). Empty array if the segment never
 * touches the grid at all.
 */
export function traverseSegmentVoxels(header, p0, p1) {
    const {
        originX, originY, originZ, cellM, nx, ny, nz,
    } = header;

    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const dz = p1.z - p0.z;

    if (dx === 0 && dy === 0 && dz === 0) {
        const cell = cellIndicesFor(header, p0);
        return cell ? [{ ...cell, t: 0 }] : [];
    }

    const maxX = originX + nx * cellM;
    const maxY = originY + ny * cellM;
    const maxZ = originZ + nz * cellM;

    // Slab method: clip the segment's parametric range [0,1] to the
    // grid's AABB, so a segment that starts/ends outside the grid (the
    // common case — a tee shot's early flight is well above and outside
    // any wooded area) still walks only the portion that's actually
    // inside it.
    let tEnter = 0;
    let tExit = 1;
    const slabs = [
        [p0.x, dx, originX, maxX],
        [p0.y, dy, originY, maxY],
        [p0.z, dz, originZ, maxZ],
    ];
    for (const [p, d, lo, hi] of slabs) {
        if (Math.abs(d) < 1e-12) {
            if (p < lo || p > hi) return []; // parallel to this axis, outside the slab
            continue;
        }
        let t0 = (lo - p) / d;
        let t1 = (hi - p) / d;
        if (t0 > t1) [t0, t1] = [t1, t0];
        tEnter = Math.max(tEnter, t0);
        tExit = Math.min(tExit, t1);
        if (tEnter > tExit) return [];
    }
    if (tEnter > tExit) return [];

    const entryX = p0.x + dx * tEnter;
    const entryY = p0.y + dy * tEnter;
    const entryZ = p0.z + dz * tEnter;
    let ix = clampIndex(Math.floor((entryX - originX) / cellM), nx);
    let iy = clampIndex(Math.floor((entryY - originY) / cellM), ny);
    let iz = clampIndex(Math.floor((entryZ - originZ) / cellM), nz);

    const sx = axisState(p0.x, dx, originX, cellM, ix);
    const sy = axisState(p0.y, dy, originY, cellM, iy);
    const sz = axisState(p0.z, dz, originZ, cellM, iz);

    const TIE_EPS = 1e-9;
    const cells = [];
    let t = tEnter;
    const maxSteps = (nx + ny + nz + 4) * 2; // generous, strictly bounds any FP edge case
    for (let step = 0; step < maxSteps; step++) {
        cells.push({ ix, iy, iz, t });

        const minT = Math.min(sx.tMax, sy.tMax, sz.tMax);
        if (minT > tExit + TIE_EPS) break;

        // Advance exactly ONE axis — the conservative choice at ties.
        // See the module header comment: stepping every tied axis at
        // once would skip the off-diagonal cell and open a
        // false-negative hole precisely at the corner. A tied axis that
        // isn't taken this iteration keeps its (now equal-to-minT)
        // tMax and is taken on the very next one, so the traversal
        // still reaches the diagonal cell — it just visits the corner
        // neighbour on the way.
        let advanced = false;
        if (sx.step !== 0 && sx.tMax <= minT + TIE_EPS) {
            ix += sx.step;
            sx.tMax += sx.tDelta;
            advanced = true;
        } else if (sy.step !== 0 && sy.tMax <= minT + TIE_EPS) {
            iy += sy.step;
            sy.tMax += sy.tDelta;
            advanced = true;
        } else if (sz.step !== 0 && sz.tMax <= minT + TIE_EPS) {
            iz += sz.step;
            sz.tMax += sz.tDelta;
            advanced = true;
        }
        if (!advanced) break; // degenerate (all steps 0) — shouldn't happen given dx/dy/dz not all 0
        if (ix < 0 || ix >= nx || iy < 0 || iy >= ny || iz < 0 || iz >= nz) break;
        t = minT;
    }
    return cells;
}

function cellIndicesFor(header, p) {
    const ix = Math.floor((p.x - header.originX) / header.cellM);
    const iy = Math.floor((p.y - header.originY) / header.cellM);
    const iz = Math.floor((p.z - header.originZ) / header.cellM);
    if (ix < 0 || ix >= header.nx || iy < 0 || iy >= header.ny || iz < 0 || iz >= header.nz) return null;
    return { ix, iy, iz };
}

/**
 * Walks a full collision-space polyline (consecutive trajectory points)
 * and returns the first occupied voxel encountered, or null for a clean
 * flight. `{ segmentIndex, cell: [ix,iy,iz], t }` — `t` is the fraction
 * along `collisionPoints[segmentIndex] → collisionPoints[segmentIndex+1]`
 * at which contact occurs.
 */
export function findFirstVoxelHit(header, decoded, collisionPoints) {
    for (let i = 0; i < collisionPoints.length - 1; i++) {
        const cells = traverseSegmentVoxels(header, collisionPoints[i], collisionPoints[i + 1]);
        for (const cell of cells) {
            if (isOccupied(decoded, header, cell.ix, cell.iy, cell.iz)) {
                return { segmentIndex: i, cell: [cell.ix, cell.iy, cell.iz], t: cell.t };
            }
        }
    }
    return null;
}

// ─── TREE-CAPSULE CLEARANCE & ATTRIBUTION ─────────────────────────────

/**
 * Resample a collision-space polyline at fixed 3D arc-length intervals
 * (roadmap's literal "~0.5 m steps"), always keeping the first and last
 * original points exactly. Used for the clearance/near-miss pass, where
 * a dense, evenly-spaced sample is what's actually wanted (a continuous
 * "how close did we get" reading), unlike the voxel hit check above
 * which needs exact per-cell coverage, not sampling.
 */
export function resamplePolyline(points, stepM) {
    if (points.length < 2) return points.slice();
    const out = [points[0]];
    // `d` is the offset — relative to the CURRENT segment's start — at
    // which the next sample falls. It carries across segment boundaries
    // by subtracting segLen (not by re-adding stepM, which would double
    // count the distance already travelled past the previous segment's
    // end): after segment i, `d - segLen` IS the offset into segment i+1
    // where the next stepM-spaced sample lands, directly.
    let d = stepM;
    for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        const segLen = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
        if (segLen < 1e-9) continue;
        while (d < segLen) {
            const frac = d / segLen;
            out.push({
                x: a.x + (b.x - a.x) * frac,
                y: a.y + (b.y - a.y) * frac,
                z: a.z + (b.z - a.z) * frac,
            });
            d += stepM;
        }
        d -= segLen;
    }
    out.push(points[points.length - 1]);
    return out;
}

/**
 * Truncates a LOCAL-frame trajectory (the {x,y,z} points
 * simulateFlight()/simulateDiscFlight() produce, in the sim's own
 * tee-relative metres — NOT collision space) at a voxel-grid hit,
 * appending a short randomized "kick" drop instead of the disc
 * continuing to fly through the obstacle (roadmap §4 step 3: "a hit is
 * a hit for planning purposes", so the kick model is deliberately
 * simple — no bounce/deflection physics).
 *
 * `firstContact` is `analyzeCollision`'s output — its `pointIndex`/`t`
 * were computed against the WGS84-converted trajectory, but they apply
 * UNCHANGED to this local-frame `points` array too:
 * `trajectoryToWGS84` maps points 1:1 with no resampling, so segment
 * index and interpolation fraction are frame-independent.
 */
export function truncateTrajectoryAtHit(points, firstContact, options = {}) {
    const { dropM = 0.5, lateralJitterM = 0.3, rng = Math.random } = options;
    const { pointIndex, t } = firstContact;
    const a = points[pointIndex];
    const b = points[pointIndex + 1];
    const contact = {
        x: lerp(a.x, b.x, t),
        y: lerp(a.y, b.y, t),
        z: lerp(a.z, b.z, t),
    };
    const kicked = {
        x: contact.x + (rng() - 0.5) * 2 * lateralJitterM,
        y: Math.max(0, contact.y - dropM * (0.5 + rng() * 0.5)),
        z: contact.z + (rng() - 0.5) * 2 * lateralJitterM,
    };
    const truncated = [...points.slice(0, pointIndex + 1), contact, kicked];
    return {
        points: truncated,
        landingIndex: truncated.length - 1,
        maxHeight: truncated.reduce((m, p) => Math.max(m, p.y), truncated[0].y),
        totalDistance: Math.hypot(kicked.x, kicked.z),
    };
}

/**
 * Signed distance from a point to a capsule's SURFACE, in metres.
 * Negative inside. This is a true 3-D distance to a capped cylinder,
 * not the horizontal-only reading an earlier version used: a line
 * skimming 0.5 m directly over a canopy is 0.5 m of clearance, and
 * treating it as "outside the crown's height band, therefore no
 * clearance data" reported `null` for the single most decision-relevant
 * line in the app (thread it over the tree, or under?). Standard
 * point-to-capped-cylinder form: combine the radial and vertical
 * overshoots outside, take the smallest face margin inside.
 */
export function capsuleSurfaceDistance(point, cap) {
    const radial = Math.hypot(point.x - cap.x, point.y - cap.y) - cap.radius;
    const vertical = Math.max(cap.zMin - point.z, point.z - cap.zMax);
    if (radial <= 0 && vertical <= 0) return Math.max(radial, vertical); // inside: nearest face
    return Math.hypot(Math.max(0, radial), Math.max(0, vertical));
}

/**
 * Nearest tree capsule that plausibly explains a contact point (voxel
 * hit) — the capsule whose surface the point is deepest inside (or
 * least far outside) within `toleranceM`. Returns null, honestly, when
 * no tree explains the hit within tolerance — Section 2's canopy
 * segmentation does not have 100% recall, so an un-attributed voxel hit
 * is a real, expected outcome, not a bug to paper over.
 */
export function attributeTreeAtHit(point, capsules, toleranceM = 1.5) {
    let best = null;
    let bestDistance = Infinity;
    for (const cap of capsules) {
        const d = capsuleSurfaceDistance(point, cap);
        if (d > toleranceM) continue;
        if (d < bestDistance) {
            bestDistance = d;
            best = cap;
        }
    }
    return best;
}

// ─── OB POLYGON CHECKING ────────────────────────────────────────────────

/**
 * Point-in-polygon using ray casting. Casts a ray horizontally to the
 * right and counts boundary crossings — odd count means inside.
 */
function isPointInPolygon(point, polygon) {
    const { lng, lat } = point;
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].lng;
        const yi = polygon[i].lat;
        const xj = polygon[j].lng;
        const yj = polygon[j].lat;

        const intersect = ((yi > lat) !== (yj > lat))
            && (lng < ((xj - xi) * (lat - yi) / (yj - yi) + xi));
        if (intersect) inside = !inside;
    }
    return inside;
}

/**
 * Check if a line segment crosses a polygon edge (in 2D).
 * Returns { crosses: boolean, t: number } where t is the parameter
 * along the segment [0,1] where crossing occurs, or null if no crossing.
 */
function lineSegmentCrossesPolygonEdge(p0, p1, edge0, edge1) {
    const x0 = p0.lng, y0 = p0.lat;
    const x1 = p1.lng, y1 = p1.lat;
    const x2 = edge0.lng, y2 = edge0.lat;
    const x3 = edge1.lng, y3 = edge1.lat;

    const denom = (y3 - y2) * (x1 - x0) - (x3 - x2) * (y1 - y0);
    if (Math.abs(denom) < 1e-10) return null; // parallel

    const ua = ((x3 - x2) * (y0 - y2) - (y3 - y2) * (x0 - x2)) / denom;
    const ub = ((x1 - x0) * (y0 - y2) - (y1 - y0) * (x0 - x2)) / denom;

    if (ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1) {
        return { crosses: true, t: ua };
    }
    return null;
}

/**
 * Find the first point where a trajectory enters an OB polygon.
 * Returns { obIndex, point, pointIndex, t } where point is WGS84 coords,
 * pointIndex is the trajectory segment, and t is fraction along that segment.
 * Returns null if no OB crossing.
 */
export function findFirstOBCrossing(wgs84Points, obPolygons) {
    if (!obPolygons || obPolygons.length === 0) return null;

    let firstCrossing = null;
    let earliestT = Infinity;

    for (let i = 0; i < wgs84Points.length - 1; i++) {
        const p0 = wgs84Points[i];
        const p1 = wgs84Points[i + 1];

        for (let obIdx = 0; obIdx < obPolygons.length; obIdx++) {
            const polygon = obPolygons[obIdx];

            // Check if trajectory crosses any edge of the polygon
            let closestT = Infinity;
            for (let j = 0; j < polygon.length; j++) {
                const edge0 = polygon[j];
                const edge1 = polygon[(j + 1) % polygon.length];
                const crossing = lineSegmentCrossesPolygonEdge(p0, p1, edge0, edge1);
                if (crossing && crossing.t < closestT) {
                    closestT = crossing.t;
                }
            }

            if (closestT < Infinity) {
                // Track the earliest crossing across all segments and polygons
                if (i + closestT < earliestT) {
                    earliestT = i + closestT;
                    firstCrossing = {
                        obIndex: obIdx,
                        pointIndex: i,
                        t: closestT,
                        lng: p0.lng + (p1.lng - p0.lng) * closestT,
                        lat: p0.lat + (p1.lat - p0.lat) * closestT,
                        altitude: p0.altitude + (p1.altitude - p0.altitude) * closestT,
                    };
                }
            }
        }
    }
    return firstCrossing;
}

// ─── SPATIAL INDEX ───────────────────────────────────────────────────
//
// The clearance pass is inherently (trajectory samples × trees), and
// both factors are large on a real course: ~200 resampled points against
// a wooded footprint's tree inventory. Measured on this machine before
// indexing: 4 ms at 500 trees, 29 ms at 5 000, 104 ms at 20 000 — against
// a 6-DOF simulation that itself costs ~6-7 ms. Since MapCanvas
// re-simulates on every settings-slider frame, that turns a smooth drag
// into a visibly laggy one at real course scale even with the worker
// absorbing it off the main thread.
//
// A uniform bin grid over capsule centres fixes it: bins are
// CLEARANCE_SEARCH_RADIUS_M wide, so scanning a sample's own bin plus
// its 8 neighbours covers every capsule within that radius. Trees
// further away than the search radius are not merely unimportant — they
// are not reportable at all (clearance is capped, see below), so
// skipping them changes no answer this module claims to give.

/** Vegetation beyond this reports as "no vegetation nearby" (null), not
 *  as a large number: a 240 ft clearance reading is noise, not signal,
 *  and pretending to measure it would cost a full O(trees) scan. */
const CLEARANCE_SEARCH_RADIUS_M = 30;
const NEAR_MISS_M = 2;

function buildCapsuleIndex(capsules, searchRadiusM) {
    // Bins must be wide enough that a 3x3 scan reaches every capsule
    // whose SURFACE is within searchRadiusM — so the bin size has to
    // cover the search radius PLUS the widest crown, or a fat tree just
    // outside the neighbourhood could still have its edge inside it.
    let maxRadius = 0;
    for (const cap of capsules) if (cap.radius > maxRadius) maxRadius = cap.radius;
    const binSize = searchRadiusM + maxRadius;

    const bins = new Map();
    for (const cap of capsules) {
        const bx = Math.floor(cap.x / binSize);
        const by = Math.floor(cap.y / binSize);
        const key = `${bx},${by}`;
        const bucket = bins.get(key);
        if (bucket) bucket.push(cap);
        else bins.set(key, [cap]);
    }
    return { bins, binSize };
}

function* capsulesNear(index, x, y) {
    const bx = Math.floor(x / index.binSize);
    const by = Math.floor(y / index.binSize);
    for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
            const bucket = index.bins.get(`${bx + ox},${by + oy}`);
            if (bucket) yield* bucket;
        }
    }
}

// ─── TOP-LEVEL ORCHESTRATOR ────────────────────────────────────────────

function lerp(a, b, t) {
    return a + (b - a) * t;
}

/**
 * Full collision analysis for one simulated throw.
 *
 * @param {object} header - parseVoxelGridHeader() result.
 * @param {object} decoded - decodeVoxelGridBinary() result.
 * @param {Array} trees - TreeRecord[] (raw JSON, snake_case fields).
 * @param {Array} wgs84Points - trajectoryToWGS84() output, [{lng,lat,altitude}].
 * @param {Array} obPolygons - OB polygons [{lng,lat}[]], or null.
 * @returns {{
 *   hit: boolean,
 *   firstContact: {lng, lat, altitude, pointIndex, t, treeIndex: number|null} | null,
 *   clearanceM: number|null, clearanceFt: number|null,
 *   gapValidated: boolean,
 *   nearMisses: {treeIndex: number, distanceM: number, distanceFt: number}[],
 *   obCrossing: {obIndex: number, lng: number, lat: number, altitude: number, pointIndex: number, t: number} | null,
 * }}
 *
 * `clearanceM` is the minimum true 3-D distance from the flight line to
 * any crown SURFACE (so a line threading 0.5 m over a canopy reads
 * 0.5 m, not "no data"), or null when no vegetation comes within
 * CLEARANCE_SEARCH_RADIUS_M. It can be negative on a hit — the disc was
 * inside a crown volume.
 *
 * `obCrossing` records where the flight path first crosses the boundary
 * of an OB polygon, if at all.
 */
export function analyzeCollision(header, decoded, trees, wgs84Points, obPolygons = null) {
    const collisionPoints = wgs84Points.map((p) => toCollisionSpace(header, p));
    const capsules = buildTreeCapsules(header, trees);

    const voxelHit = findFirstVoxelHit(header, decoded, collisionPoints);

    const sampled = resamplePolyline(collisionPoints, 0.5);
    const index = buildCapsuleIndex(capsules, CLEARANCE_SEARCH_RADIUS_M);
    let clearanceM = Infinity;
    const nearMissByTree = new Map();
    for (const p of sampled) {
        for (const cap of capsulesNear(index, p.x, p.y)) {
            const d = capsuleSurfaceDistance(p, cap);
            if (d > CLEARANCE_SEARCH_RADIUS_M) continue;
            if (d < clearanceM) clearanceM = d;
            if (d < NEAR_MISS_M) {
                const prev = nearMissByTree.get(cap.index);
                if (prev === undefined || d < prev) nearMissByTree.set(cap.index, d);
            }
        }
    }

    let firstContact = null;
    if (voxelHit) {
        const { segmentIndex, t } = voxelHit;
        const contactCollision = {
            x: lerp(collisionPoints[segmentIndex].x, collisionPoints[segmentIndex + 1].x, t),
            y: lerp(collisionPoints[segmentIndex].y, collisionPoints[segmentIndex + 1].y, t),
            z: lerp(collisionPoints[segmentIndex].z, collisionPoints[segmentIndex + 1].z, t),
        };
        const attributed = attributeTreeAtHit(contactCollision, capsules);
        firstContact = {
            pointIndex: segmentIndex,
            t,
            lng: lerp(wgs84Points[segmentIndex].lng, wgs84Points[segmentIndex + 1].lng, t),
            lat: lerp(wgs84Points[segmentIndex].lat, wgs84Points[segmentIndex + 1].lat, t),
            altitude: contactCollision.z,
            treeIndex: attributed ? attributed.index : null,
        };
    }

    const obCrossing = findFirstOBCrossing(wgs84Points, obPolygons);

    const nearMisses = [...nearMissByTree.entries()]
        .map(([treeIndex, distanceM]) => ({ treeIndex, distanceM, distanceFt: distanceM * METERS_TO_FEET }))
        .sort((a, b) => a.distanceM - b.distanceM);

    const finiteClearanceM = clearanceM === Infinity ? null : clearanceM;

    return {
        hit: !!voxelHit,
        firstContact,
        clearanceM: finiteClearanceM,
        clearanceFt: finiteClearanceM === null ? null : finiteClearanceM * METERS_TO_FEET,
        // A throw "validates" a gap when it completes the simulated flight
        // without the voxel grid — the authoritative source — registering
        // any contact. Matches the roadmap's acceptance criterion: the
        // documented correct line on Maple Hill hole 2 should read
        // gapValidated=true, hit=false.
        gapValidated: !voxelHit,
        nearMisses,
        obCrossing,
    };
}
