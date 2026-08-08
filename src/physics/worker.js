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
 *   in:  { requestId, engine: 'sixdof' | 'legacy', disc, params, wind, terrainProfile }
 *   out: { requestId, ok: true, result } | { requestId, ok: false, error }
 *
 * `terrainProfile` is a plain object holding a Float32Array — sent via
 * structured clone, NOT transferred. It is deliberately not marked
 * transferable because the same profile is reused across every throw
 * fired while a user drags a settings slider; transferring would neuter
 * the buffer after the first message.
 */

import { simulateFlight } from './sixDof.js';
import { discToCoefficients, ACTIVE_MAPPING, launchAngleDeg } from './discCoefficients.js';
import { simulateDiscFlight as simulateLegacy } from '../utils/flightPhysics.js';
import { lookupElevation } from './terrainProfile.js';

self.onmessage = (event) => {
    const { requestId, engine, disc, params, wind, terrainProfile } = event.data;
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
        self.postMessage({ requestId, ok: true, result });
    } catch (err) {
        self.postMessage({ requestId, ok: false, error: err?.message ?? String(err) });
    }
};
