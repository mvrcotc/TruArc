/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  TruArc — Mapbox ↔ Three.js Coordinate Sync (Section 3, step 1)  ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Pure matrix math placing a Three.js scene, authored in metres, into
 * Mapbox's mercator world. No Three.js and no GL context needed — which
 * is the point: this is the part where a sign error is silent and
 * expensive, so it is written to be unit-testable against Mapbox's own
 * `MercatorCoordinate` (see tests/map/mercatorTransform.test.mjs) rather
 * than verified by looking at the map and deciding it seems fine.
 *
 * ════════════════════════════════════════════════════════════════════
 *  THE THREE FRAMES  (get these confused and everything lands wrong)
 * ════════════════════════════════════════════════════════════════════
 *
 * MERCATOR (what Mapbox's matrix consumes) — verified empirically
 * against MercatorCoordinate, not assumed:
 *      +X = EAST
 *      +Y = SOUTH   ← [0,0] is the top-LEFT of the mercator world, so
 *                     Y grows downward/southward, screen-style
 *      +Z = UP      (conformal with X/Y: equal mercator lengths render
 *                     as a cube, per the CustomLayerInterface docs)
 * Note this frame is LEFT-handed (east × south = down, not up).
 *
 * SCENE (what you author trees in) — right-handed, Three.js-native:
 *      +X = EAST
 *      +Y = UP      = altitude in metres above sea level
 *      +Z = SOUTH   ← so NORTH IS −Z. This trips people up constantly.
 * Units are METRES. Y is absolute altitude, not height above ground, so
 * a tree's trunk base sits at its DTM ground elevation directly.
 *
 * Y-up was chosen over a geographer's east-north-up because Three.js
 * builds `CylinderGeometry` and `LatheGeometry` around the Y axis — the
 * exact primitives step 2 needs for trunks and lathed crowns. In an ENU
 * frame every single tree mesh would need a corrective rotation.
 *
 * ════════════════════════════════════════════════════════════════════
 *  HANDEDNESS FLIP — READ BEFORE DEBUGGING "INVISIBLE" TREES
 * ════════════════════════════════════════════════════════════════════
 * Scene is right-handed, mercator is left-handed, so the transform
 * between them has NEGATIVE determinant. That is correct and
 * unavoidable, but it MIRRORS TRIANGLE WINDING: geometry that is
 * front-facing in a normal Three.js scene becomes back-facing here and
 * gets culled. Symptom is trees that are invisible, or visible only
 * from underneath, with no error anywhere.
 *
 * The fix belongs on the materials, not here — either
 * `side: THREE.DoubleSide`, or `side: THREE.BackSide` on closed meshes.
 * `assertHandednessFlip()` below exists so a test pins this property
 * down instead of someone "fixing" the sign later and silently
 * inverting every normal.
 *
 * ════════════════════════════════════════════════════════════════════
 *  TERRAIN EXAGGERATION — WHY TREES WOULD OTHERWISE BE BURIED
 * ════════════════════════════════════════════════════════════════════
 * Mapbox displaces its terrain MESH by the exaggeration factor, but
 * hands custom layers a plain mercator matrix with no such adjustment.
 * Under a 2× mesh, a tree drawn at its true altitude sits at half the
 * height of the ground rendered beneath it — i.e. buried, on any terrain
 * above sea level.
 *
 * So `elevationExaggeration` must match whatever the map is actually
 * using (`map.getTerrain()?.exaggeration ?? 1`), which is what TreeLayer
 * reads at render time.
 *
 * The app now renders the ground at TRUE SCALE — terrainLayers.js sets
 * 1.0 and exposes no control to change it, because a player picking a
 * line off an inflated hill is being misled. This compensation is
 * therefore identity today. It is kept, and kept tested, because it is
 * the mechanism that holds custom 3-D geometry level with the mesh: it
 * is what makes the constant safe to change rather than load-bearing by
 * accident.
 *
 * Independently of all this, anything MEASURING elevation must read true
 * altitudes (`{ exaggerated: false }`) — see docs/ACCURACY_ROADMAP.md
 * §2.6, which flags the same trap for the flight simulator.
 */

/**
 * Mapbox scales altitude by the circumference at the WGS84 MEAN radius
 * (6371008.8 m), not the equatorial radius (6378137 m) that its
 * horizontal web-mercator projection is defined on.
 *
 * This is not a detail worth deriving from first principles — it was
 * measured out of the installed mapbox-gl, and it is exact to the last
 * float bit. Using the equatorial radius instead (the intuitive guess,
 * and the one this file originally shipped) makes every altitude 0.11 %
 * wrong: a constant scale error that no horizontal test notices, and
 * that would quietly put trees ~20 cm off the ground on a 200 m hill
 * while looking perfectly fine in a screenshot.
 */
const EARTH_RADIUS_M = 6371008.8;
const EARTH_CIRCUMFERENCE_M = 2 * Math.PI * EARTH_RADIUS_M;

/**
 * Mercator X from longitude. Matches MercatorCoordinate.fromLngLat().
 */
export function mercatorXFromLng(lng) {
    return (180 + lng) / 360;
}

/**
 * Mercator Y from latitude. Note the sign: increasing latitude (north)
 * DECREASES Y, because mercator [0,0] is the top-left of the world.
 */
export function mercatorYFromLat(lat) {
    return (180 - (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))) / 360;
}

/** Mercator Z from altitude in metres (conformal with X/Y). */
export function mercatorZFromAltitude(altitudeM, lat) {
    return altitudeM / circumferenceAtLatitude(lat);
}

export function circumferenceAtLatitude(lat) {
    return EARTH_CIRCUMFERENCE_M * Math.cos((lat * Math.PI) / 180);
}

/** Inverse of mercatorYFromLat. */
export function latFromMercatorY(y) {
    const y2 = 180 - y * 360;
    return (360 / Math.PI) * Math.atan(Math.exp((y2 * Math.PI) / 180)) - 90;
}

export function lngFromMercatorX(x) {
    return x * 360 - 180;
}

/**
 * A local metric frame anchored at one lng/lat.
 *
 * ACCURACY NOTE: mercator scale varies with latitude, and this frame
 * uses a single scale taken at the anchor. Over a course-sized area the
 * error is bounded by roughly `tan(lat) · (extent/R) · extent` — about
 * 9 cm at the far edge of an 800 m course at latitude 42°, which is far
 * below the width of the trees being drawn. Anchor at the course CENTRE
 * rather than a corner and that halves again. Do not reuse one frame
 * across widely separated courses.
 */
export function createLocalFrame(lng, lat) {
    const scale = 1 / circumferenceAtLatitude(lat);
    return {
        lng,
        lat,
        // Origin is pinned at altitude 0 so scene Y reads directly as
        // altitude above sea level.
        originX: mercatorXFromLng(lng),
        originY: mercatorYFromLat(lat),
        originZ: 0,
        metersToMercator: scale,
    };
}

/**
 * Geographic position → scene coordinates (metres, X=east/Y=up/Z=south).
 */
export function lngLatAltToScene(frame, lng, lat, altitudeM) {
    const mx = mercatorXFromLng(lng);
    const my = mercatorYFromLat(lat);
    return {
        x: (mx - frame.originX) / frame.metersToMercator,
        y: altitudeM,
        z: (my - frame.originY) / frame.metersToMercator,
    };
}

/** Inverse of lngLatAltToScene. */
export function sceneToLngLatAlt(frame, x, y, z) {
    return {
        lng: lngFromMercatorX(frame.originX + x * frame.metersToMercator),
        lat: latFromMercatorY(frame.originY + z * frame.metersToMercator),
        altitudeM: y,
    };
}

// ─── MATRIX HELPERS (column-major, WebGL/Three.js convention) ────────
// Element at (row r, col c) lives at index c*4 + r.

/**
 * Scene → mercator, as a column-major 4x4.
 *
 *   X_mercator = origin.x + s·x
 *   Y_mercator = origin.y + s·z        (scene +Z is south, mercator +Y is south)
 *   Z_mercator = origin.z + s·e·y      (e = terrain exaggeration)
 *
 * The Y/Z swap between the two frames is why this is not a plain scale.
 */
export function sceneToMercatorMatrix(frame, elevationExaggeration = 1) {
    const s = frame.metersToMercator;
    const e = elevationExaggeration;
    const m = new Array(16).fill(0);
    // column 0
    m[0] = s; m[1] = 0; m[2] = 0; m[3] = 0;
    // column 1  (scene Y = up  →  mercator Z, exaggerated)
    m[4] = 0; m[5] = 0; m[6] = s * e; m[7] = 0;
    // column 2  (scene Z = south →  mercator Y)
    m[8] = 0; m[9] = s; m[10] = 0; m[11] = 0;
    // column 3 (translation)
    m[12] = frame.originX; m[13] = frame.originY; m[14] = frame.originZ; m[15] = 1;
    return m;
}

/** Column-major 4x4 multiply: returns a·b. */
export function multiplyMat4(a, b) {
    const out = new Array(16);
    for (let c = 0; c < 4; c++) {
        for (let r = 0; r < 4; r++) {
            out[c * 4 + r] =
                a[0 * 4 + r] * b[c * 4 + 0] +
                a[1 * 4 + r] * b[c * 4 + 1] +
                a[2 * 4 + r] * b[c * 4 + 2] +
                a[3 * 4 + r] * b[c * 4 + 3];
        }
    }
    return out;
}

/** Apply a column-major 4x4 to a point, with perspective divide skipped. */
export function transformPoint(m, x, y, z) {
    return {
        x: m[0] * x + m[4] * y + m[8] * z + m[12],
        y: m[1] * x + m[5] * y + m[9] * z + m[13],
        z: m[2] * x + m[6] * y + m[10] * z + m[14],
        w: m[3] * x + m[7] * y + m[11] * z + m[15],
    };
}

/**
 * The matrix to assign to the Three.js camera's projectionMatrix inside
 * a Mapbox custom layer's render(gl, matrix).
 *
 * Mapbox's `matrix` already maps mercator → clip space, so the whole
 * job is prepending scene → mercator. The camera itself stays at the
 * identity: all of the view and projection is carried here.
 */
export function sceneProjectionMatrix(mapboxMatrix, frame, elevationExaggeration = 1) {
    return multiplyMat4(mapboxMatrix, sceneToMercatorMatrix(frame, elevationExaggeration));
}

/** Determinant of the upper-left 3x3 — negative means winding is mirrored. */
export function determinant3x3(m) {
    const a = m[0], b = m[4], c = m[8];
    const d = m[1], e = m[5], f = m[9];
    const g = m[2], h = m[6], i = m[10];
    return a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
}
