/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  TruArc — Terrain Profile Sampling                               ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Web Workers cannot reach Mapbox's `queryTerrainElevation` — it depends
 * on the live GL context. So terrain is sampled once on the MAIN thread,
 * before a throw is dispatched to the physics worker, along the throw's
 * aim bearing, and handed over as a flat lookup table.
 *
 * SIMPLIFICATION: the table is indexed by FORWARD distance only —
 * lateral (left/right) elevation change is not modeled. The legacy
 * engine's per-step `getGroundElev(x, z)` callback took both axes, but
 * in practice a disc rarely drifts more than 60–80 ft laterally while a
 * course's along-line slope (the thing that actually determines carry
 * and landing) is sampled at full resolution. Revisit this if a course
 * with a severe cross-slope (e.g. a fairway hugging a hillside) turns
 * out to need it — it would mean sampling a 2-D grid instead of a line.
 */

/**
 * @param {mapboxgl.Map} map
 * @param {{lng, lat, elevation}} tee
 * @param {number} bearingDeg
 * @param {(x:number, z:number, origin, bearingDeg:number) => {lng,lat}} localToLngLat
 *        Passed in rather than imported to avoid a hard dependency on
 *        src/utils/flightPhysics.js from this module.
 * @returns {{stepM:number, elevations:Float32Array}} relative to tee elevation
 */
export function buildTerrainProfile(map, tee, bearingDeg, localToLngLat, { maxRangeM = 230, stepM = 4 } = {}) {
    const count = Math.ceil(maxRangeM / stepM) + 1;
    const elevations = new Float32Array(count);
    const teeElev = tee.elevation ?? 0;

    for (let i = 0; i < count; i++) {
        const z = i * stepM;
        const { lng, lat } = localToLngLat(0, z, tee, bearingDeg);
        let elev;
        try {
            elev = map.queryTerrainElevation?.([lng, lat]);
        } catch {
            elev = null;
        }
        elevations[i] = (elev ?? teeElev) - teeElev;
    }

    return { stepM, elevations };
}

/**
 * Elevation (relative to tee) at forward distance `zForward` meters,
 * linearly interpolated. Distances beyond the sampled range extend flat
 * from the last sample rather than extrapolating.
 */
export function lookupElevation(profile, zForward) {
    if (!profile) return 0;
    const { stepM, elevations } = profile;
    const idx = zForward / stepM;
    if (idx <= 0) return elevations[0];
    const i0 = Math.min(elevations.length - 1, Math.floor(idx));
    const i1 = Math.min(elevations.length - 1, i0 + 1);
    const frac = idx - i0;
    return elevations[i0] + (elevations[i1] - elevations[i0]) * frac;
}

/** Flat-ground profile, useful for tests and as a safe default. */
export function flatProfile() {
    return { stepM: 1, elevations: new Float32Array([0, 0]) };
}
