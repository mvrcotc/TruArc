/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  TruArc — Public Flight Simulation Entry Point                  ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Async replacement for the legacy synchronous
 * `simulateDiscFlight(disc, throwParams, wind, getGroundElev)`. The
 * signature had to change — a worker is inherently async — but the
 * INPUT shapes are unchanged from the caller's point of view (disc, the
 * existing UI throwParams `{power, aimAngle, releaseAngle, noseAngle}`,
 * wind) and the OUTPUT shape is unchanged too (`{points, landingIndex,
 * maxHeight, totalDistance}`, points in the same local {x=right,
 * y=up, z=forward} frame), so `trajectoryToWGS84` / `localToLngLat` in
 * flightPhysics.js keep working untouched.
 *
 * ── A DELIBERATE BEHAVIOR CHANGE from the legacy call site ──────────
 * The legacy MapCanvas.handleThrowClick applied the UI's Aim Angle
 * slider TWICE: once baked into the world `bearing` used for terrain
 * sampling and WGS84 rotation, and again passed as `throwParams.aimAngle`
 * into the physics engine itself (which used it to set the initial
 * local velocity direction). Net effect: dragging the Aim Angle slider
 * by 10° actually aimed the disc by roughly 20° in the sixdof-engine
 * case, since sixDof has no aim parameter at all — it always launches
 * along local +Z, so the aim slider now only affects `bearingDeg`
 * (applied once). Kept as-is for the 'legacy' A/B path since that
 * engine's own aim handling is unaffected and it's on its way out.
 *
 * ── TERRAIN ───────────────────────────────────────────────────────
 * Workers cannot call Mapbox. Callers build a `terrainProfile` on the
 * main thread first via `buildTerrainProfile()` in terrainProfile.js and
 * pass it in; this module does not touch Mapbox at all.
 */

import { buildThrowSpec, DEFAULT_THROWER } from './throwerProfile.js';
import { discToCoefficients, ACTIVE_MAPPING, launchAngleDeg } from './discCoefficients.js';
import { getEngineChoice } from './engineFlag.js';
import { lookupElevation } from './terrainProfile.js';

let worker = null;
let nextRequestId = 1;
const pending = new Map();

function getWorker() {
    if (worker) return worker;
    if (typeof Worker === 'undefined') return null; // SSR / non-browser test env
    try {
        worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
        worker.onmessage = (event) => {
            const { requestId, ok, result, error } = event.data;
            const p = pending.get(requestId);
            if (!p) return;
            pending.delete(requestId);
            if (ok) p.resolve(result);
            else p.reject(new Error(error));
        };
        worker.onerror = (event) => {
            // Something broke in the worker itself (not a per-request
            // failure, which arrives as ok:false above). Fail every
            // in-flight request and let the next call rebuild the worker.
            for (const p of pending.values()) p.reject(new Error(event.message || 'flight worker error'));
            pending.clear();
            worker = null;
        };
    } catch {
        worker = null; // e.g. bundler/environment doesn't support module workers
    }
    return worker;
}

/**
 * @param {Object} disc - { speed, glide, turn, fade }
 * @param {Object} throwParamsUI - existing UI shape: { power, aimAngle, releaseAngle, noseAngle }
 * @param {Object} wind - { speed, direction } (legacy naming, matches existing callers)
 * @param {Object} terrainProfile - from buildTerrainProfile(), or null for flat ground
 * @param {Object} [options] - { engine: 'sixdof' | 'legacy' } overrides the stored A/B flag
 * @returns {Promise<{points, landingIndex, maxHeight, totalDistance, flightTimeS}>}
 */
export async function simulateDiscFlightAsync(disc, throwParamsUI, wind, terrainProfile, options = {}) {
    const engine = options.engine ?? getEngineChoice();
    const requestId = nextRequestId++;
    const message = buildMessage(requestId, engine, disc, throwParamsUI, wind, terrainProfile);

    const w = getWorker();
    if (w) {
        return new Promise((resolve, reject) => {
            pending.set(requestId, { resolve, reject });
            w.postMessage(message);
        });
    }
    return runSameThread(message);
}

function buildMessage(requestId, engine, disc, throwParamsUI, wind, terrainProfile) {
    if (engine === 'legacy') {
        return {
            requestId,
            engine: 'legacy',
            disc,
            params: {
                power: throwParamsUI.power,
                aimAngle: throwParamsUI.aimAngle ?? 0,
                releaseAngle: throwParamsUI.releaseAngle,
                noseAngle: throwParamsUI.noseAngle,
            },
            wind,
            terrainProfile,
        };
    }
    const throwSpec = buildThrowSpec(DEFAULT_THROWER, disc, {
        powerPct: throwParamsUI.power,
        noseAngleDeg: throwParamsUI.noseAngle,
        hyzerDeg: throwParamsUI.releaseAngle,
        launchAngleDeg: launchAngleDeg(ACTIVE_MAPPING),
    });
    return { requestId, engine: 'sixdof', disc, params: throwSpec, wind, terrainProfile };
}

/** Fallback used when a Worker cannot be constructed. Mirrors worker.js exactly. */
async function runSameThread(message) {
    const getGroundElev = (x, z) => lookupElevation(message.terrainProfile, z);

    if (message.engine === 'legacy') {
        const { simulateDiscFlight } = await import('../utils/flightPhysics.js');
        const raw = simulateDiscFlight(message.disc, message.params, message.wind, getGroundElev);
        return { ...raw, flightTimeS: raw.landingIndex * 0.01 * 3 };
    }
    const { simulateFlight } = await import('./sixDof.js');
    return simulateFlight(message.disc, message.params, message.wind, getGroundElev, {
        coefficients: discToCoefficients(message.disc, ACTIVE_MAPPING),
    });
}
