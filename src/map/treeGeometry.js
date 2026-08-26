/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  TruArc — Tree Geometry Math (Section 3, step 2)                 ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Pure functions turning a Section 2 `TreeRecord` into the vertex data
 * TreeLayer.js feeds to THREE.LatheGeometry and merged billboard quads.
 * No THREE import here on purpose — this is the part that's actually
 * worth unit-testing (crown shape correctness), and it's testable
 * without a GL context. TreeLayer.js is the thin, largely-untestable
 * glue that hands these numbers to THREE and Mapbox.
 *
 * All heights below are in the SCENE frame's Y (metres, absolute
 * altitude) — see mercatorTransform.js. Callers translate the resulting
 * local geometry by the tree's ground elevation.
 */

/**
 * Lathe profile for a crown: an array of {y, radius} points, in
 * increasing y, suitable for THREE.LatheGeometry (revolves around Y).
 *
 * The 6 measured `profile` fractions (schema.py's TreeRecord) are radius
 * at 6 height BANDS from crown base to treetop, not 6 exact heights —
 * segmentation.py's extract_profile bins points into
 * `linspace(base, top, 7)`, so each value represents its band's
 * MIDPOINT, and that's the height this function places it at. The one
 * exception is the first point, pinned to the true crown base rather
 * than its band's midpoint: the base is a real boundary a trunk gets
 * attached to below, and profile[0] is measured on a band that already
 * starts right there, so the height reinterpretation costs negligible
 * accuracy.
 *
 * A final point at (treetop, radius=0) closes the lathe to a point
 * rather than leaving an unrealistic flat disk floating at the apex —
 * true even for measured profiles whose last slice isn't already ~0,
 * since LiDAR sampling near a single terminal leader is sparse and a
 * few outlier returns can leave profile[5] larger than the real tip.
 *
 * The crown's OWN base is left open (no bottom cap): a tree's underside
 * is not visible from any golf-course camera angle, a cap face is pure
 * cost, and a separate trunk mesh visually plugs the gap from below.
 */
export function crownLatheProfile(profile, crownRadiusM, crownBaseM, heightM) {
    if (profile.length < 2) throw new Error('crownLatheProfile: profile needs at least 2 slices');
    const n = profile.length;
    const span = heightM - crownBaseM;
    if (span <= 0) throw new Error(`crownLatheProfile: heightM (${heightM}) must exceed crownBaseM (${crownBaseM})`);
    const bandH = span / n;

    const points = [];
    for (let i = 0; i < n; i++) {
        const y = i === 0 ? crownBaseM : crownBaseM + (i + 0.5) * bandH;
        const radius = Math.max(0, profile[i] * crownRadiusM);
        points.push({ y, radius });
    }
    points.push({ y: heightM, radius: 0 });
    return points;
}

/**
 * Trunk radius, in metres. LiDAR does not reliably measure stem diameter
 * — pulses rarely reach a wooded trunk through the canopy above it, and
 * nothing in the TreeRecord schema carries a measured value — so this is
 * a plausible allometric heuristic (roughly DBH-to-height ratios for
 * temperate trees), NOT a measured attribute. It is cosmetic only: the
 * physics collision check in Section 4 reads the voxel occupancy grid,
 * never this geometry, so an inaccurate trunk radius costs visual
 * realism and nothing else.
 */
export function trunkRadiusM(heightM) {
    return clamp(heightM * 0.012, 0.08, 0.45);
}

export function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
}

/**
 * Base foliage color for a form, as a THREE.Color-compatible hex number.
 * A small deterministic per-tree hue/lightness jitter (seeded from the
 * tree's own position, so it's stable across rebuilds rather than
 * flickering) avoids the flat, repeated look of one solid color across
 * thousands of merged, unlit-looking crowns.
 */
export function formBaseColor(form) {
    return form === 'conifer' ? { h: 0.32, s: 0.55, l: 0.22 } : { h: 0.28, s: 0.55, l: 0.32 };
}

/** Deterministic pseudo-random in [0,1) from two floats — no Math.random(),
 * so rebuilding the scene from the same tree list looks identical. */
function hash2(a, b) {
    const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
    return s - Math.floor(s);
}

export function jitteredTreeColorHSL(form, seedX, seedZ) {
    const base = formBaseColor(form);
    const j1 = hash2(seedX, seedZ);
    const j2 = hash2(seedZ, seedX);
    return {
        h: base.h + (j1 - 0.5) * 0.03,
        s: clamp(base.s + (j2 - 0.5) * 0.15, 0.2, 0.8),
        l: clamp(base.l + (j1 - 0.5) * 0.1, 0.12, 0.45),
    };
}

/**
 * Vertices (local X/Y/Z, scene frame) and UVs for a "cross-billboard"
 * distance imposter: two vertical quads at 90° to each other, both
 * centred on the tree's vertical axis. This is the standard cheap
 * technique for distant-tree LOD — unlike a single camera-facing
 * billboard it needs no per-frame rotation update (which would force a
 * geometry rebuild every frame for a merged mesh), while still reading
 * as a plausible tree silhouette from most horizontal viewing angles.
 *
 * Returned as flat arrays ready for a BufferGeometry: 8 vertices (4 per
 * quad), 12 indices (2 triangles per quad), matching UVs spanning the
 * full billboard texture on each quad.
 */
export function billboardQuadGeometry(widthM, heightM, baseY) {
    const hw = widthM / 2;
    const positions = [
        // Quad 1: in the X-Y plane (facing north/south)
        -hw, baseY, 0, hw, baseY, 0, hw, baseY + heightM, 0, -hw, baseY + heightM, 0,
        // Quad 2: in the Z-Y plane (facing east/west)
        0, baseY, -hw, 0, baseY, hw, 0, baseY + heightM, hw, 0, baseY + heightM, -hw,
    ];
    const uvs = [0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1];
    const indices = [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7];
    return { positions, uvs, indices };
}

/**
 * LOD tier for one tree given its distance from the camera. A single
 * threshold rather than several tiers: the roadmap's target is a binary
 * full-geometry / billboard split ("billboard imposters beyond ~300m"),
 * and multiple tiers would multiply the number of merged meshes without
 * a corresponding gain — see TreeLayer.js for why the split is
 * recomputed on camera idle rather than every frame.
 */
export function lodTierForDistance(distanceM, nearFarThresholdM = 300) {
    return distanceM <= nearFarThresholdM ? 'near' : 'far';
}
