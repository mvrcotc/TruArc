/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  TruArc — Flight Simulation Worker                               ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Runs the flight simulation off the main thread so slider drags in
 * DiscSelector (which re-simulate on every change — see MapCanvas.jsx's
 * throwSettings effect) don't block rendering. Measured cost of a single
 * 6-DOF simulation at production dt is ~6-7 ms; comfortably fine for a
 * one-off click, but multiple in quick succession during a drag are
 * exactly the case a worker exists for.
 *
 * Message protocol (see flightEngine.js for the sender):
 *   in:  { requestId, engine: 'sixdof' | 'legacy', disc, params, wind,
 *          terrainProfile, origin, bearingDeg }
 *   out: { requestId, ok: true, result } | { requestId, ok: false, error }
 *
 * `terrainProfile` is a plain object holding a Float32Array — sent via
 * structured clone, NOT transferred. It is deliberately not marked
 * transferable because the same profile is reused across every throw
 * fired while a user drags a settings slider; transferring would neuter
 * the buffer after the first message.
 *
 * ── COLLISION DETECTION (Section 4) ──────────────────────────────────
 * A separate, out-of-band message type loads the course's voxel grid +
 * tree inventory ONCE (its ArrayBuffer is transferred, not cloned — see
 * flightEngine.js's loadCourseCollisionData), cached here in module
 * state for every subsequent throw request until the course changes.
 * `origin`/`bearingDeg` (present on every regular throw request once a
 * course is active — see flightEngine.js's buildMessage) are only used
 * to convert the LOCAL-frame trajectory into WGS84 for the collision
 * check; the physics itself never touches them. When a throw hits, the
 * flight result is truncated at contact (see collision.js's
 * truncateTrajectoryAtHit) so the returned trajectory doesn't fly the
 * disc through the obstacle it just hit.
 */

import { simulateFlight } from './sixDof.js';
import { discToCoefficients, ACTIVE_MAPPING, launchAngleDeg } from './discCoefficients.js';
import { simulateDiscFlight as simulateLegacy, trajectoryToWGS84 } from '../utils/flightPhysics.js';
import { lookupElevation } from './terrainProfile.js';
import { parseVoxelGridHeader, decodeVoxelGridBinary } from './voxelGridFormat.js';
import { analyzeCollision, truncateTrajectoryAtHit } from './collision.js';

// { header, decoded, trees } for the currently-loaded course, or null
// when no course/voxel data is active (collision detection is then
// silently skipped — a course without a processed voxel grid yet is an
// expected state, not an error; see MapCanvas.jsx's fetch handling).
let collisionData = null;
let holeData = null;

self.onmessage = (event) => {
    const data = event.data;

    if (data.type === 'loadCollisionData') {
        try {
            collisionData = {
                header: parseVoxelGridHeader(data.voxelHeader),
                decoded: decodeVoxelGridBinary(data.voxelBuffer),
                trees: data.trees || [],
            };
            holeData = data.hole || null;
            self.postMessage({ type: 'collisionDataLoaded', ok: true });
        } catch (err) {
            collisionData = null;
            holeData = null;
            self.postMessage({ type: 'collisionDataLoaded', ok: false, error: err?.message ?? String(err) });
        }
        return;
    }
    if (data.type === 'clearCollisionData') {
        collisionData = null;
        holeData = null;
        return;
    }

    const {
        requestId, engine, disc, params, wind, terrainProfile, origin, bearingDeg,
    } = data;
    const getGroundElev = (x, z) => lookupElevation(terrainProfile, z);

    try {
        let result;
        if (engine === 'legacy') {
            const raw = simulateLegacy(disc, params, wind, getGroundElev);
            // Legacy reports no flight time; its step constants are fixed
            // (dt = 0.01 s, sampled every 3rd step), so recover it exactly.
            result = { ...raw, flightTimeS: raw.landingIndex * 0.01 * 3 };
        } else {
            const coefficients = discToCoefficients(disc, ACTIVE_MAPPING);
            const throwSpec = { ...params, launchAngleDeg: params.launchAngleDeg ?? launchAngleDeg(ACTIVE_MAPPING) };
            result = simulateFlight(disc, throwSpec, wind, getGroundElev, { coefficients });
            // trace/diagnostics are debug-only and not structured-clone-cheap
            // to send back on every throw; strip unless explicitly requested.
            if (!params.includeTrace) delete result.trace;
        }

        if (collisionData && origin) {
            const wgs84Points = trajectoryToWGS84(result.points, origin, bearingDeg || 0);
            const obPolygons = holeData?.obPolygons || null;
            const collision = analyzeCollision(collisionData.header, collisionData.decoded, collisionData.trees, wgs84Points, obPolygons);
            result = { ...result, collision };
            if (collision.hit && collision.firstContact) {
                const truncated = truncateTrajectoryAtHit(result.points, collision.firstContact);
                result = { ...result, ...truncated };
            }
        }

        self.postMessage({ requestId, ok: true, result });
    } catch (err) {
        self.postMessage({ requestId, ok: false, error: err?.message ?? String(err) });
    }
};
