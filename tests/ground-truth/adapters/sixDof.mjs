/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  Ground-truth adapter — 6-DOF engine (Section 1)                ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Unlike the currentEngine adapter, this one is nearly a pass-through:
 * the 6-DOF engine speaks the ground-truth vocabulary natively (release
 * speed in m/s, spin in rpm, nose angle as true angle of attack), so
 * there is no formula-inversion hack. That simplification is itself one
 * of the deliverables of Section 1.
 */

import { simulateFlight, mphToMps } from '../../../src/physics/sixDof.js';
import { discToCoefficients, launchAngleDeg, ACTIVE_MAPPING } from '../../../src/physics/discCoefficients.js';
import { THROWER_TIERS } from '../flight-envelopes.mjs';

/**
 * @param {{disc, thrower, throw, wind?}} envelope
 * @param {{mapping?, dt?}} opts  calibration passes a candidate mapping here
 */
export function runEnvelope(envelope, opts = {}) {
    const tier = THROWER_TIERS[envelope.thrower];
    if (!tier) throw new Error(`Unknown thrower tier: "${envelope.thrower}"`);

    const mapping = opts.mapping ?? ACTIVE_MAPPING;
    const t = envelope.throw;
    const powerFrac = (t.powerPct ?? 100) / 100;

    const throwSpec = {
        releaseSpeedMps: mphToMps(tier.releaseSpeedMph) * powerFrac,
        // Spin scales with power: you cannot throw at 70% speed and keep
        // full snap. Holding spin constant would fake gyroscopic
        // stability at low power and break the meat-hook cases.
        spinRpm: tier.spinRpm * powerFrac,
        noseAngleDeg: t.noseAngleDeg ?? 0,
        hyzerDeg: t.releaseAngleDeg ?? 0,
        launchAngleDeg: launchAngleDeg(mapping),
        releaseHeightM: 1.4,
        hand: 'RH',
        style: 'BH',
    };

    const wind = {
        speedMps: envelope.wind?.speedMps ?? 0,
        directionDeg: envelope.wind?.directionDeg ?? 0,
    };

    return simulateFlight(envelope.disc, throwSpec, wind, () => 0, {
        coefficients: discToCoefficients(envelope.disc, mapping),
        dt: opts.dt ?? 0.002,
    });
}
