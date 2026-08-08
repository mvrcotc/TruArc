/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  Ground-truth adapter — CURRENT (pre–Section 1) flight engine   ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Translates a flight-envelopes.mjs envelope (disc + thrower tier +
 * throw params + wind, all in real-world units) into a call to the
 * existing src/utils/flightPhysics.js simulator, whose API predates
 * this ground-truth suite.
 *
 * KNOWN LIMITATION this adapter works around: the current engine
 * derives release velocity from the disc's `speed` rating, not from a
 * thrower's actual release speed —
 *   speedToVelocity(speedRating, power) = (20 + speedRating*1.5) * power/100
 * — whereas every envelope here is anchored to a thrower tier's
 * release speed in mph (the number a launch monitor actually
 * measures). That mismatch is itself one of the things Section 1 (the
 * 6-DOF rebuild) must fix: a correct engine takes release speed
 * directly. Until then, this adapter inverts the current engine's own
 * formula to solve for whatever "power" value reproduces the target
 * release speed for the disc in question, so envelope comparisons stay
 * apples-to-apples across discs of different speed ratings.
 *
 * This file's only job is bridging old-engine-API to new-ground-truth-
 * API. It intentionally duplicates one small formula from flightPhysics
 * .js (which does not export it) rather than modifying that file as
 * part of this test-only change. Delete this whole adapter once
 * Section 1 replaces the engine with one that accepts release speed
 * directly — a new adapter (or none, if the new engine speaks this
 * vocabulary natively) takes its place.
 */

import { simulateDiscFlight } from '../../../src/utils/flightPhysics.js';
import { THROWER_TIERS } from '../flight-envelopes.mjs';

const MPH_TO_MPS = 0.44704;

/** Mirrors flightPhysics.js's private speedToVelocity(), inverted to solve for `power`. */
function solveEnginePowerForVelocity(disc, targetVelocityMps) {
    const maxV = 20 + disc.speed * 1.5;
    return (targetVelocityMps / maxV) * 100;
}

/**
 * Run one envelope (or inline comparative side) through the current engine.
 * @param {{disc, thrower: string, throw: object, wind?: object}} envelope
 * @returns {{points, landingIndex, maxHeight, totalDistance}} raw simulator result
 */
export function runEnvelope(envelope) {
    const tier = THROWER_TIERS[envelope.thrower];
    if (!tier) throw new Error(`Unknown thrower tier: "${envelope.thrower}"`);

    const t = envelope.throw;
    const targetVelocityMps = tier.releaseSpeedMph * MPH_TO_MPS * (t.powerPct / 100);
    const power = solveEnginePowerForVelocity(envelope.disc, targetVelocityMps);

    const throwParams = {
        power,
        aimAngle: t.aimDeg ?? 0,
        releaseAngle: t.releaseAngleDeg ?? 0,
        noseAngle: t.noseAngleDeg ?? 0,
    };
    const wind = {
        speed: envelope.wind?.speedMps ?? 0,
        direction: envelope.wind?.directionDeg ?? 0,
    };
    const flatGround = () => 0;

    const result = simulateDiscFlight(envelope.disc, throwParams, wind, flatGround);

    // The legacy engine reports no flight time, but its step constants
    // are fixed (dt = 0.01 s, one sample every 3rd step), so it can be
    // recovered exactly rather than guessed.
    return { ...result, flightTimeS: result.landingIndex * 0.01 * 3 };
}
