/**
 * Tests for src/physics/collision.js — Amanatides-Woo voxel traversal,
 * tree-capsule clearance/attribution, and the top-level orchestrator.
 *
 * The voxel-grid fixture (REAL_PACKED_B64 / REAL_HEADER_JSON) is the
 * SAME real Python-captured bytes used in voxelGridFormat.test.mjs (see
 * that file's header comment for the exact capture command) — reused
 * here rather than re-derived, so this file and that one are provably
 * testing against the identical ground truth.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
    traverseSegmentVoxels, findFirstVoxelHit, resamplePolyline,
    attributeTreeAtHit, buildTreeCapsules, toCollisionSpace, analyzeCollision,
    truncateTrajectoryAtHit, capsuleSurfaceDistance, findFirstOBCrossing,
} from '../../src/physics/collision.js';
import { parseVoxelGridHeader, decodeVoxelGridBinary } from '../../src/physics/voxelGridFormat.js';

const REAL_PACKED_B64 = 'VFZPWAE8AAAAgAAAAAIAABA=';
const REAL_HEADER_JSON = {
    origin: [261191.4393269105, 4684538.24189523, 137.0],
    cellM: 1.0,
    dims: [4, 3, 5],
    workingCrs: 'EPSG:32619',
    georeference: {
        originLng: -71.896,
        originLat: 42.276500000000006,
        xAxisBearingDeg: 88.04413890905988,
        yAxisBearingDeg: 358.0580445834481,
    },
};

function base64ToArrayBuffer(b64) {
    const binary = Buffer.from(b64, 'base64');
    return binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength);
}

// The exact mathematical inverse of parseVoxelGridHeader's worldToGridXY
// (world (east,north) = x*xAxisEN + y*yAxisEN), used only to construct
// WGS84 test points that land at known collision-space coordinates.
// worldToGridXY itself is independently verified against real Python
// output in voxelGridFormat.test.mjs; this helper's correctness is
// checked below via an explicit round-trip before it's relied on.
function gridXYToLngLat(headerJson, x, y) {
    const geo = headerJson.georeference;
    const metersPerDegLat = 111320;
    const metersPerDegLng = metersPerDegLat * Math.cos(geo.originLat * Math.PI / 180);
    const xBearingRad = geo.xAxisBearingDeg * Math.PI / 180;
    const yBearingRad = geo.yAxisBearingDeg * Math.PI / 180;
    const east = x * Math.sin(xBearingRad) + y * Math.sin(yBearingRad);
    const north = x * Math.cos(xBearingRad) + y * Math.cos(yBearingRad);
    return {
        lng: geo.originLng + east / metersPerDegLng,
        lat: geo.originLat + north / metersPerDegLat,
    };
}

describe('gridXYToLngLat test helper round-trips through the real worldToGridXY', () => {
    const header = parseVoxelGridHeader(REAL_HEADER_JSON);
    test('recovers arbitrary grid coordinates to within 1cm', () => {
        for (const [x, y] of [[2.5, 1.5], [0, 0], [3.9, 2.1], [1.234, 0.567]]) {
            const { lng, lat } = gridXYToLngLat(REAL_HEADER_JSON, x, y);
            const back = header.worldToGridXY(lng, lat);
            assert.ok(Math.abs(back.x - x) < 0.01, `x: got ${back.x}, expected ${x}`);
            assert.ok(Math.abs(back.y - y) < 0.01, `y: got ${back.y}, expected ${y}`);
        }
    });
});

// ─── traverseSegmentVoxels ───────────────────────────────────────────

describe('traverseSegmentVoxels', () => {
    test('straight axis-aligned line through several cells', () => {
        const header = {
            originX: 0, originY: 0, originZ: 0, cellM: 1, nx: 5, ny: 1, nz: 1,
        };
        const cells = traverseSegmentVoxels(header, { x: 0.5, y: 0.5, z: 0.5 }, { x: 4.5, y: 0.5, z: 0.5 });
        assert.deepEqual(cells.map((c) => c.ix), [0, 1, 2, 3, 4]);
        assert.ok(cells.every((c) => c.iy === 0 && c.iz === 0));
        // t should be monotonically increasing
        for (let i = 1; i < cells.length; i++) assert.ok(cells[i].t > cells[i - 1].t);
    });

    test('segment entirely outside the grid returns no cells', () => {
        const header = {
            originX: 0, originY: 0, originZ: 0, cellM: 1, nx: 2, ny: 2, nz: 2,
        };
        const cells = traverseSegmentVoxels(header, { x: 10, y: 10, z: 10 }, { x: 20, y: 20, z: 20 });
        assert.deepEqual(cells, []);
    });

    test('segment starting outside and passing through the grid is clipped correctly', () => {
        const header = {
            originX: 0, originY: 0, originZ: 0, cellM: 1, nx: 4, ny: 1, nz: 1,
        };
        // Straight line from x=-10 to x=10 at y=z=0.5 — should visit exactly cells 0..3.
        const cells = traverseSegmentVoxels(header, { x: -10, y: 0.5, z: 0.5 }, { x: 10, y: 0.5, z: 0.5 });
        assert.deepEqual(cells.map((c) => c.ix), [0, 1, 2, 3]);
    });

    test('zero-length segment inside the grid returns its single cell', () => {
        const header = {
            originX: 0, originY: 0, originZ: 0, cellM: 1, nx: 3, ny: 3, nz: 3,
        };
        const cells = traverseSegmentVoxels(header, { x: 1.5, y: 1.5, z: 1.5 }, { x: 1.5, y: 1.5, z: 1.5 });
        assert.deepEqual(cells, [{ ix: 1, iy: 1, iz: 1, t: 0 }]);
    });

    test('zero-length segment outside the grid returns nothing', () => {
        const header = {
            originX: 0, originY: 0, originZ: 0, cellM: 1, nx: 3, ny: 3, nz: 3,
        };
        const cells = traverseSegmentVoxels(header, { x: 99, y: 99, z: 99 }, { x: 99, y: 99, z: 99 });
        assert.deepEqual(cells, []);
    });

    test('a segment tangent to the grid boundary (grazes a single face) does not explode', () => {
        const header = {
            originX: 0, originY: 0, originZ: 0, cellM: 1, nx: 2, ny: 2, nz: 2,
        };
        // Travels exactly along y=0 (the grid's own edge), x from -1 to 3.
        const cells = traverseSegmentVoxels(header, { x: -1, y: 0, z: 0.5 }, { x: 3, y: 0, z: 0.5 });
        assert.ok(cells.every((c) => c.iy === 0));
        assert.ok(cells.length > 0 && cells.length <= 2);
    });

    describe('45-degree diagonal exactly through a shared cell corner (corner-leak regression)', () => {
        // 2x2x1 grid. A ray from (0,0) to (2,2) passes exactly through
        // (1,1) — the corner shared by all four cells. Traversal must be
        // CONSERVATIVE here: it has to visit an off-diagonal cell too,
        // or a pair of obstacles occupying (1,0) and (0,1) — touching
        // only at that corner — would be missed entirely by a ray
        // passing right between them, even though rays perturbed by
        // ±1e-7 to either side both register a hit. See collision.js's
        // header comment on tie-breaking.
        const header = {
            originX: 0, originY: 0, originZ: 0, cellM: 1, nx: 2, ny: 2, nz: 1,
        };

        test('forward diagonal visits an off-diagonal cell, not just the two diagonal ones', () => {
            const cells = traverseSegmentVoxels(header, { x: 0, y: 0, z: 0.5 }, { x: 2, y: 2, z: 0.5 });
            const visited = cells.map((c) => `${c.ix},${c.iy}`);
            assert.deepEqual(visited, ['0,0', '1,0', '1,1']);
        });

        test('reversed diagonal is likewise conservative', () => {
            const cells = traverseSegmentVoxels(header, { x: 2, y: 2, z: 0.5 }, { x: 0, y: 0, z: 0.5 });
            const visited = cells.map((c) => `${c.ix},${c.iy}`);
            assert.equal(visited[0], '1,1');
            assert.equal(visited[visited.length - 1], '0,0');
            assert.equal(visited.length, 3, `expected an off-diagonal cell in ${JSON.stringify(visited)}`);
        });

        test('the exact-corner ray is not a hole between its own perturbations', () => {
            // The real requirement, stated directly: whatever cells the
            // rays just off the corner touch, the exact-corner ray must
            // not touch strictly fewer of the off-diagonal pair than
            // BOTH of them do — otherwise there is a measure-zero line
            // through which a disc passes two obstacles untouched.
            const offDiagonal = (cells) => cells
                .map((c) => `${c.ix},${c.iy}`)
                .filter((k) => k === '1,0' || k === '0,1').length;

            const exact = traverseSegmentVoxels(header, { x: 0, y: 0, z: 0.5 }, { x: 2, y: 2, z: 0.5 });
            const nudgedUp = traverseSegmentVoxels(header, { x: 0, y: 1e-7, z: 0.5 }, { x: 2, y: 2 + 1e-7, z: 0.5 });
            const nudgedDown = traverseSegmentVoxels(header, { x: 0, y: -1e-7, z: 0.5 }, { x: 2, y: 2 - 1e-7, z: 0.5 });

            assert.ok(offDiagonal(nudgedUp) >= 1);
            assert.ok(offDiagonal(nudgedDown) >= 1);
            assert.ok(offDiagonal(exact) >= 1, 'exact-corner ray passed between two corner-touching obstacles');
        });
    });

    test('cell indices returned are always within grid bounds', () => {
        const header = {
            originX: 0, originY: 0, originZ: 0, cellM: 1, nx: 3, ny: 3, nz: 3,
        };
        const cells = traverseSegmentVoxels(header, { x: -5, y: -5, z: -5 }, { x: 5, y: 5, z: 5 });
        for (const c of cells) {
            assert.ok(c.ix >= 0 && c.ix < 3);
            assert.ok(c.iy >= 0 && c.iy < 3);
            assert.ok(c.iz >= 0 && c.iz < 3);
        }
        assert.ok(cells.length > 0);
    });
});

// ─── findFirstVoxelHit against the real fixture ──────────────────────

describe('findFirstVoxelHit against real Python-packed voxel bytes', () => {
    const header = parseVoxelGridHeader(REAL_HEADER_JSON);
    const decoded = decodeVoxelGridBinary(base64ToArrayBuffer(REAL_PACKED_B64));
    // findFirstVoxelHit takes COLLISION-SPACE points (absolute working-CRS
    // frame, matching header.originX/Y/Z — see collision.js's
    // toCollisionSpace comment), not grid-local 0-based coordinates, so
    // these hand-built test points add the origin explicitly rather than
    // going through toCollisionSpace/worldToGridXY.
    const ox = header.originX;
    const oy = header.originY;

    test('a vertical line through occupied cell (2,1,3) registers a hit at that cell', () => {
        // Occupied cells by construction (see voxelGridFormat.test.mjs):
        // (2,1,3), (0,0,0), (3,2,4). This line holds x,y fixed inside
        // cell column (2,1,*) and sweeps z from above to below the grid.
        const points = [
            { x: ox + 2.5, y: oy + 1.5, z: 150 },
            { x: ox + 2.5, y: oy + 1.5, z: 130 },
        ];
        const hitResult = findFirstVoxelHit(header, decoded, points);
        assert.ok(hitResult);
        assert.deepEqual(hitResult.cell, [2, 1, 3]);
    });

    test('a vertical line through an entirely unoccupied column registers no hit', () => {
        // Column (1,0,*) contains none of the 3 occupied cells.
        const points = [
            { x: ox + 1.5, y: oy + 0.5, z: 150 },
            { x: ox + 1.5, y: oy + 0.5, z: 130 },
        ];
        assert.equal(findFirstVoxelHit(header, decoded, points), null);
    });

    test('multi-segment polyline finds a hit on a later segment', () => {
        const points = [
            { x: ox + 1.5, y: oy + 0.5, z: 150 }, // clean column
            { x: ox + 1.5, y: oy + 0.5, z: 141.5 }, // still clean, still above/inside clean column
            { x: ox + 2.5, y: oy + 1.5, z: 141.5 }, // jump laterally into the occupied column
            { x: ox + 2.5, y: oy + 1.5, z: 130 }, // sweep down through the occupied cell
        ];
        const hitResult = findFirstVoxelHit(header, decoded, points);
        assert.ok(hitResult);
        assert.equal(hitResult.segmentIndex, 2);
        assert.deepEqual(hitResult.cell, [2, 1, 3]);
    });
});

// ─── resamplePolyline ─────────────────────────────────────────────────

describe('resamplePolyline', () => {
    test('evenly divides a straight segment at the requested step', () => {
        const points = [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }];
        const out = resamplePolyline(points, 2);
        assert.deepEqual(out.map((p) => p.x), [0, 2, 4, 6, 8, 10]);
    });

    test('always preserves the exact first and last points, even off-step', () => {
        const points = [{ x: 0, y: 0, z: 0 }, { x: 7, y: 0, z: 0 }];
        const out = resamplePolyline(points, 2);
        assert.deepEqual(out[0], points[0]);
        assert.deepEqual(out[out.length - 1], points[1]);
        assert.deepEqual(out.map((p) => p.x), [0, 2, 4, 6, 7]);
    });

    test('carries leftover distance correctly across a multi-segment polyline', () => {
        // Two 5m segments end to end (10m total) at step 4: expect samples
        // at absolute distances 0, 4, 8, 10(end) — the sample at absolute
        // distance 8 falls 3m into the second segment (which starts at
        // absolute distance 5), i.e. at x=8, not x=6.
        const points = [{ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }];
        const out = resamplePolyline(points, 4);
        assert.deepEqual(out.map((p) => p.x), [0, 4, 8, 10]);
    });

    test('skips zero-length (duplicate consecutive) segments without producing NaN', () => {
        const points = [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }];
        const out = resamplePolyline(points, 2);
        assert.ok(out.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)));
        assert.deepEqual(out.map((p) => p.x), [0, 2, 4, 6]);
    });

    test('fewer than 2 points is returned unchanged', () => {
        assert.deepEqual(resamplePolyline([], 1), []);
        const single = [{ x: 1, y: 2, z: 3 }];
        assert.deepEqual(resamplePolyline(single, 1), single);
    });
});

// ─── capsuleSurfaceDistance ────────────────────────────────────────────

describe('capsuleSurfaceDistance', () => {
    const cap = { index: 0, x: 0, y: 0, radius: 4, zMin: 105, zMax: 115 };

    test('purely lateral: distance from the side of the crown', () => {
        assert.ok(Math.abs(capsuleSurfaceDistance({ x: 10, y: 0, z: 110 }, cap) - 6) < 1e-9);
    });

    test('purely vertical: a line directly over the trunk measures to the canopy TOP', () => {
        // The case the old horizontal-only version reported as "no data".
        assert.ok(Math.abs(capsuleSurfaceDistance({ x: 0, y: 0, z: 115.5 }, cap) - 0.5) < 1e-9);
        assert.ok(Math.abs(capsuleSurfaceDistance({ x: 0, y: 0, z: 104 }, cap) - 1) < 1e-9);
    });

    test('diagonal: radial and vertical overshoots combine as a hypotenuse', () => {
        // 3m past the radius, 4m above the top -> 5m.
        const d = capsuleSurfaceDistance({ x: 7, y: 0, z: 119 }, cap);
        assert.ok(Math.abs(d - 5) < 1e-9, `got ${d}`);
    });

    test('inside the crown returns a negative distance (penetration)', () => {
        // Dead centre: 4m from the side wall, 5m from either cap -> -4.
        const d = capsuleSurfaceDistance({ x: 0, y: 0, z: 110 }, cap);
        assert.ok(Math.abs(d - -4) < 1e-9, `got ${d}`);
        // Just inside the top face -> nearest face is the top, -0.25.
        const d2 = capsuleSurfaceDistance({ x: 0, y: 0, z: 114.75 }, cap);
        assert.ok(Math.abs(d2 - -0.25) < 1e-9, `got ${d2}`);
    });

    test('exactly on the surface reads zero', () => {
        assert.ok(Math.abs(capsuleSurfaceDistance({ x: 4, y: 0, z: 110 }, cap)) < 1e-9);
        assert.ok(Math.abs(capsuleSurfaceDistance({ x: 0, y: 0, z: 115 }, cap)) < 1e-9);
    });
});

// ─── attributeTreeAtHit ────────────────────────────────────────────────

describe('attributeTreeAtHit', () => {
    const capsules = [
        { index: 0, x: 0, y: 0, radius: 1, zMin: 0, zMax: 5 },
        { index: 1, x: 5, y: 0, radius: 1, zMin: 0, zMax: 5 },
    ];

    test('a point at a capsule center is attributed to that capsule', () => {
        const result = attributeTreeAtHit({ x: 0, y: 0, z: 2 }, capsules);
        assert.equal(result.index, 0);
    });

    test('picks the capsule with greater penetration when both are z-in-range candidates', () => {
        // Point is 0.5m from capsule 0's axis (radius 1, penetration 0.5)
        // and equidistant-ish from capsule 1 but further, so 0 should win.
        const result = attributeTreeAtHit({ x: 0.5, y: 0, z: 2 }, capsules);
        assert.equal(result.index, 0);
    });

    test('returns null when nothing is within tolerance', () => {
        const result = attributeTreeAtHit({ x: 100, y: 100, z: 2 }, capsules);
        assert.equal(result, null);
    });

    test('returns null when z is far outside every capsule range', () => {
        const result = attributeTreeAtHit({ x: 0, y: 0, z: 999 }, capsules);
        assert.equal(result, null);
    });
});

// ─── toCollisionSpace / buildTreeCapsules ─────────────────────────────

describe('toCollisionSpace and buildTreeCapsules', () => {
    const header = parseVoxelGridHeader(REAL_HEADER_JSON);

    test('toCollisionSpace places the grid origin at (header.originX, header.originY) — the absolute frame traverseSegmentVoxels/cellAt expect, not 0-based local', () => {
        const p = toCollisionSpace(header, { lng: REAL_HEADER_JSON.georeference.originLng, lat: REAL_HEADER_JSON.georeference.originLat, altitude: 123.4 });
        assert.ok(Math.abs(p.x - header.originX) < 1e-6, `x=${p.x}, expected ~${header.originX}`);
        assert.ok(Math.abs(p.y - header.originY) < 1e-6, `y=${p.y}, expected ~${header.originY}`);
        assert.equal(p.z, 123.4);
    });

    test('buildTreeCapsules derives z-range from ground_elev_m + crown_base_m / height_m, and x/y in the same absolute frame as the origin', () => {
        const { lng, lat } = gridXYToLngLat(REAL_HEADER_JSON, 2.5, 1.5);
        const trees = [{
            lng, lat, ground_elev_m: 137, height_m: 4, crown_radius_m: 1.2, crown_base_m: 1,
        }];
        const [cap] = buildTreeCapsules(header, trees);
        assert.equal(cap.zMin, 138);
        assert.equal(cap.zMax, 141);
        assert.equal(cap.radius, 1.2);
        assert.ok(Math.abs(cap.x - (header.originX + 2.5)) < 0.01);
        assert.ok(Math.abs(cap.y - (header.originY + 1.5)) < 0.01);
    });
});

// ─── truncateTrajectoryAtHit ────────────────────────────────────────

describe('truncateTrajectoryAtHit', () => {
    const points = [
        { x: 0, y: 10, z: 0 },
        { x: 5, y: 8, z: 10 },
        { x: 10, y: 5, z: 20 },
        { x: 15, y: 0, z: 30 },
    ];

    test('truncates at the exact lerp of the contact segment, plus one kick point', () => {
        const firstContact = { pointIndex: 1, t: 0.5 };
        const rng = () => 0.5; // midpoint every call -> zero lateral jitter
        const result = truncateTrajectoryAtHit(points, firstContact, { rng });
        // kept: points[0], points[1] (both before/at the contact segment start), then the interpolated contact, then the kick.
        assert.equal(result.points.length, 4);
        assert.deepEqual(result.points[0], points[0]);
        assert.deepEqual(result.points[1], points[1]);
        const contact = result.points[2];
        assert.ok(Math.abs(contact.x - 7.5) < 1e-9);
        assert.ok(Math.abs(contact.y - 6.5) < 1e-9);
        assert.ok(Math.abs(contact.z - 15) < 1e-9);
    });

    test('the kick point drops below the contact point in y, with zero lateral jitter at rng=0.5', () => {
        const firstContact = { pointIndex: 0, t: 0 };
        const rng = () => 0.5;
        const result = truncateTrajectoryAtHit(points, firstContact, { rng, dropM: 1 });
        const [, contact, kick] = result.points;
        assert.ok(kick.y < contact.y);
        assert.ok(Math.abs(kick.x - contact.x) < 1e-9); // rng=0.5 -> (0.5-0.5)*2*jitter = 0
        assert.ok(Math.abs(kick.z - contact.z) < 1e-9);
    });

    test('lateral jitter is bounded by lateralJitterM in both directions', () => {
        const firstContact = { pointIndex: 0, t: 0 };
        for (const rng of [() => 0, () => 1]) {
            const result = truncateTrajectoryAtHit(points, firstContact, { rng, lateralJitterM: 0.3 });
            const [, contact, kick] = result.points;
            assert.ok(Math.abs(kick.x - contact.x) <= 0.3 + 1e-9);
            assert.ok(Math.abs(kick.z - contact.z) <= 0.3 + 1e-9);
        }
    });

    test('never drops the kick point below y=0', () => {
        const lowPoints = [{ x: 0, y: 0.2, z: 0 }, { x: 1, y: 0.1, z: 1 }];
        const result = truncateTrajectoryAtHit(lowPoints, { pointIndex: 0, t: 0.5 }, { rng: () => 1, dropM: 5 });
        const kick = result.points[result.points.length - 1];
        assert.ok(kick.y >= 0);
    });

    test('landingIndex, maxHeight, and totalDistance are recomputed from the truncated points', () => {
        const firstContact = { pointIndex: 2, t: 0 }; // contact = points[2] exactly (x=10,y=5,z=20)
        const rng = () => 0.5;
        const result = truncateTrajectoryAtHit(points, firstContact, { rng, dropM: 2 });
        assert.equal(result.landingIndex, result.points.length - 1);
        // maxHeight must come from the RETAINED points (10 here, from points[0]), not the full original array.
        assert.ok(Math.abs(result.maxHeight - 10) < 1e-9);
        const kick = result.points[result.points.length - 1];
        assert.ok(Math.abs(result.totalDistance - Math.hypot(kick.x, kick.z)) < 1e-9);
    });
});

// ─── analyzeCollision (top-level orchestrator) ────────────────────────

describe('analyzeCollision', () => {
    const header = parseVoxelGridHeader(REAL_HEADER_JSON);
    const decoded = decodeVoxelGridBinary(base64ToArrayBuffer(REAL_PACKED_B64));

    const treeAtHitSite = (() => {
        const { lng, lat } = gridXYToLngLat(REAL_HEADER_JSON, 2.5, 1.5);
        return {
            lng, lat, ground_elev_m: 137, height_m: 4, crown_radius_m: 1.0, crown_base_m: 1,
        };
    })();
    const farTree = (() => {
        const { lng, lat } = gridXYToLngLat(REAL_HEADER_JSON, 0.1, 2.9);
        return {
            lng, lat, ground_elev_m: 137, height_m: 4, crown_radius_m: 0.2, crown_base_m: 1,
        };
    })();
    const trees = [treeAtHitSite, farTree];

    test('a trajectory through the occupied column registers a hit, attributed to the overlapping tree', () => {
        const { lng, lat } = gridXYToLngLat(REAL_HEADER_JSON, 2.5, 1.5);
        const wgs84Points = [
            { lng, lat, altitude: 150 },
            { lng, lat, altitude: 130 },
        ];
        const result = analyzeCollision(header, decoded, trees, wgs84Points);
        assert.equal(result.hit, true);
        assert.equal(result.gapValidated, false);
        assert.ok(result.firstContact);
        // The ray enters cell (2,1,3) at its top face (z=141) descending
        // from above — the entry point is exactly on that boundary, not
        // strictly inside [140,141).
        assert.ok(result.firstContact.altitude >= 140 && result.firstContact.altitude <= 141 + 1e-9,
            `altitude=${result.firstContact.altitude}`);
        assert.equal(result.firstContact.treeIndex, 0); // treeAtHitSite
        assert.ok(Number.isFinite(result.firstContact.lng));
        assert.ok(Number.isFinite(result.firstContact.lat));
    });

    test('a trajectory down a clean column validates as a gap, with no first contact', () => {
        const { lng, lat } = gridXYToLngLat(REAL_HEADER_JSON, 1.5, 0.5);
        const wgs84Points = [
            { lng, lat, altitude: 150 },
            { lng, lat, altitude: 130 },
        ];
        const result = analyzeCollision(header, decoded, trees, wgs84Points);
        assert.equal(result.hit, false);
        assert.equal(result.gapValidated, true);
        assert.equal(result.firstContact, null);
    });

    test('clearance and near-misses reflect capsule distance, including passes that graze but do not hit', () => {
        // (1.5, 0.5) is ~1.41m from treeAtHitSite's axis at (2.5, 1.5);
        // capsule radius 1.0 → lateral gap ~0.41m while inside the
        // crown's height band, a near-miss but not a voxel hit (column
        // (1,0,*) is unoccupied per the fixture).
        const { lng, lat } = gridXYToLngLat(REAL_HEADER_JSON, 1.5, 0.5);
        const wgs84Points = [
            { lng, lat, altitude: 150 },
            { lng, lat, altitude: 130 },
        ];
        const result = analyzeCollision(header, decoded, trees, wgs84Points);
        assert.equal(result.hit, false);
        assert.ok(result.clearanceM !== null);
        assert.ok(Math.abs(result.clearanceM - 0.414) < 0.05, `clearanceM=${result.clearanceM}`);
        assert.ok(Math.abs(result.clearanceFt - result.clearanceM * 3.28084) < 1e-6);
        assert.ok(result.nearMisses.length >= 1);
        assert.equal(result.nearMisses[0].treeIndex, 0);
    });

    test('a line passing directly OVER a canopy reports its vertical clearance, not null', () => {
        // The regression the horizontal-only clearance version had: this
        // line is dead above treeAtHitSite's trunk and never enters the
        // crown's height band, so the old code reported "no data" for
        // exactly the line a player most needs measured.
        const { lng, lat } = gridXYToLngLat(REAL_HEADER_JSON, 2.5, 1.5);
        const treeTop = treeAtHitSite.ground_elev_m + treeAtHitSite.height_m; // 141
        const wgs84Points = [
            { lng, lat, altitude: treeTop + 0.5 },
            { lng, lat, altitude: treeTop + 0.5 },
        ];
        const result = analyzeCollision(header, decoded, [treeAtHitSite], wgs84Points);
        assert.ok(result.clearanceM !== null, 'over-canopy line reported no clearance data');
        assert.ok(Math.abs(result.clearanceM - 0.5) < 1e-6, `clearanceM=${result.clearanceM}`);
    });

    test('clearance is null only when nothing is within the search radius', () => {
        // A synthetic empty tree list must not crash and should report
        // clearanceM: null (nothing measured), not 0 or Infinity.
        const { lng, lat } = gridXYToLngLat(REAL_HEADER_JSON, 1.5, 0.5);
        const wgs84Points = [
            { lng, lat, altitude: 150 },
            { lng, lat, altitude: 130 },
        ];
        const result = analyzeCollision(header, decoded, [], wgs84Points);
        assert.equal(result.clearanceM, null);
        assert.equal(result.clearanceFt, null);
        assert.deepEqual(result.nearMisses, []);
    });

    test('the spatial index returns the same clearance an exhaustive scan would', () => {
        // Guards the binning: a capsule must not be missed because it
        // sits in a neighbouring bin. Builds a spread-out stand and
        // cross-checks against a brute-force minimum over every tree.
        const manyTrees = [];
        for (let gx = 0; gx < 4; gx++) {
            for (let gy = 0; gy < 3; gy++) {
                const { lng, lat } = gridXYToLngLat(REAL_HEADER_JSON, gx + 0.5, gy + 0.5);
                manyTrees.push({
                    lng, lat, ground_elev_m: 137, height_m: 4 + gx, crown_radius_m: 0.3 + gy * 0.1, crown_base_m: 1,
                });
            }
        }
        const { lng, lat } = gridXYToLngLat(REAL_HEADER_JSON, 1.7, 0.9);
        const wgs84Points = [
            { lng, lat, altitude: 150 },
            { lng, lat, altitude: 130 },
        ];
        const result = analyzeCollision(header, decoded, manyTrees, wgs84Points);

        const capsules = buildTreeCapsules(header, manyTrees);
        const sampled = resamplePolyline(wgs84Points.map((p) => toCollisionSpace(header, p)), 0.5);
        let brute = Infinity;
        for (const p of sampled) {
            for (const cap of capsules) brute = Math.min(brute, capsuleSurfaceDistance(p, cap));
        }
        assert.ok(Math.abs(result.clearanceM - brute) < 1e-9, `indexed=${result.clearanceM} brute=${brute}`);
    });
});

// ─── OB POLYGON CHECKING ────────────────────────────────────────────

describe('OB polygon crossing detection', () => {
    test('a trajectory that never enters an OB polygon returns null', () => {
        const obPolygons = [
            [
                { lng: -71.8, lat: 42.27 },
                { lng: -71.79, lat: 42.27 },
                { lng: -71.79, lat: 42.28 },
                { lng: -71.8, lat: 42.28 },
            ],
        ];
        const wgs84Points = [
            { lng: -72.0, lat: 42.29, altitude: 150 },
            { lng: -72.0, lat: 42.29, altitude: 130 },
        ];
        const result = findFirstOBCrossing(wgs84Points, obPolygons);
        assert.equal(result, null);
    });

    test('a trajectory starting outside and crossing into an OB polygon returns the crossing point', () => {
        const obPolygons = [
            [
                { lng: -71.90, lat: 42.27 },
                { lng: -71.88, lat: 42.27 },
                { lng: -71.88, lat: 42.29 },
                { lng: -71.90, lat: 42.29 },
            ],
        ];
        // Trajectory from west (outside) to east (outside, but passes through)
        const wgs84Points = [
            { lng: -71.91, lat: 42.28, altitude: 150 },
            { lng: -71.87, lat: 42.28, altitude: 130 },
        ];
        const result = findFirstOBCrossing(wgs84Points, obPolygons);
        assert.ok(result !== null, 'should detect OB crossing from west to east');
        assert.equal(result.obIndex, 0);
        assert.equal(result.pointIndex, 0);
        assert.ok(result.t > 0 && result.t < 1, `t=${result.t}`);
        assert.ok(Number.isFinite(result.lng));
        assert.ok(Number.isFinite(result.lat));
        assert.ok(Number.isFinite(result.altitude));
        // The crossing should be at the western boundary (lng ≈ -71.90)
        assert.ok(result.lng >= -71.901 && result.lng <= -71.899, `lng=${result.lng} should be near west boundary`);
    });

    test('a trajectory starting inside an OB polygon returns the crossing point as it exits', () => {
        const obPolygons = [
            [
                { lng: -71.90, lat: 42.27 },
                { lng: -71.88, lat: 42.27 },
                { lng: -71.88, lat: 42.29 },
                { lng: -71.90, lat: 42.29 },
            ],
        ];
        const wgs84Points = [
            { lng: -71.89, lat: 42.28, altitude: 150 },
            { lng: -71.87, lat: 42.28, altitude: 130 },
        ];
        const result = findFirstOBCrossing(wgs84Points, obPolygons);
        assert.ok(result !== null, 'should detect OB crossing');
        assert.equal(result.obIndex, 0);
    });

    test('analyzeCollision includes obCrossing in its result', () => {
        const obPolygons = [
            [
                { lng: -71.90, lat: 42.27 },
                { lng: -71.88, lat: 42.27 },
                { lng: -71.88, lat: 42.29 },
                { lng: -71.90, lat: 42.29 },
            ],
        ];
        const wgs84Points = [
            { lng: -71.91, lat: 42.28, altitude: 150 },
            { lng: -71.87, lat: 42.28, altitude: 130 },
        ];
        const header = parseVoxelGridHeader(REAL_HEADER_JSON);
        const decoded = decodeVoxelGridBinary(base64ToArrayBuffer(REAL_PACKED_B64));
        const result = analyzeCollision(header, decoded, [], wgs84Points, obPolygons);
        assert.ok(result.obCrossing !== null, 'should include obCrossing');
        assert.equal(result.obCrossing.obIndex, 0);
    });

    test('multiple OB polygons are checked and the first crossing is returned', () => {
        const obPolygons = [
            // First polygon further east
            [
                { lng: -71.80, lat: 42.27 },
                { lng: -71.78, lat: 42.27 },
                { lng: -71.78, lat: 42.29 },
                { lng: -71.80, lat: 42.29 },
            ],
            // Second polygon closer (west)
            [
                { lng: -71.90, lat: 42.27 },
                { lng: -71.88, lat: 42.27 },
                { lng: -71.88, lat: 42.29 },
                { lng: -71.90, lat: 42.29 },
            ],
        ];
        // Trajectory from far west to far east, crossing both
        const wgs84Points = [
            { lng: -71.95, lat: 42.28, altitude: 150 },
            { lng: -71.75, lat: 42.28, altitude: 130 },
        ];
        const result = findFirstOBCrossing(wgs84Points, obPolygons);
        assert.ok(result !== null, 'should detect first OB crossing');
        // Should cross the closer one (obIndex 1, at lng -71.90) first
        assert.equal(result.obIndex, 1);
    });

    test('no OB polygons returns null', () => {
        const wgs84Points = [
            { lng: -71.91, lat: 42.28, altitude: 150 },
            { lng: -71.87, lat: 42.28, altitude: 130 },
        ];
        const result = findFirstOBCrossing(wgs84Points, null);
        assert.equal(result, null);
    });

    test('empty OB polygon array returns null', () => {
        const wgs84Points = [
            { lng: -71.91, lat: 42.28, altitude: 150 },
            { lng: -71.87, lat: 42.28, altitude: 130 },
        ];
        const result = findFirstOBCrossing(wgs84Points, []);
        assert.equal(result, null);
    });
});
