/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  TruArc — Thrower → Throw-Spec Construction                     ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Bridges the UI's throw controls (power %, aim, hyzer, nose) to the
 * 6-DOF engine's throwSpec. This is production code and the single
 * source of truth for "how fast does a disc leave the hand" — the
 * ground-truth suite (tests/ground-truth/flight-envelopes.mjs) imports
 * `discReleaseFactor` from here rather than keeping its own copy, so the
 * calibration is always fitting the same formula the app actually runs.
 *
 * `DEFAULT_THROWER` intentionally matches the ground-truth "advanced"
 * tier (60 mph driver release) — production behavior at 100% power is
 * therefore exactly what tools/calibrate.mjs calibrated against. Section
 * 6 (thrower calibration) replaces this constant with a per-user profile
 * fitted from the player's own reported distances; nothing else in this
 * file should need to change when that lands.
 */

const MPH_TO_MPS = 0.44704;

/**
 * A putter is not released as fast as a driver — a wide-rimmed driver
 * gives far more leverage and grip than a bead-rimmed putter. Fitted
 * through typical pro release speeds (~70 mph driver, ~55 mph putter)
 * and capped at 1.0 since the thrower's quoted speed is by definition
 * their driver speed.
 */
export function discReleaseFactor(discSpeed) {
    return Math.min(1, 0.70 + 0.025 * discSpeed);
}

export const DEFAULT_THROWER = { driverMph: 60, driverSpinRpm: 1200 };

/**
 * @param {{driverMph, driverSpinRpm}} thrower
 * @param {{speed}} disc
 * @param {{powerPct, noseAngleDeg, hyzerDeg, launchAngleDeg, releaseHeightM, hand, style}} ui
 * @returns full throwSpec for sixDof.simulateFlight()
 */
export function buildThrowSpec(thrower, disc, ui) {
    const powerFrac = (ui.powerPct ?? 100) / 100;
    const factor = discReleaseFactor(disc.speed);
    return {
        releaseSpeedMps: thrower.driverMph * factor * powerFrac * MPH_TO_MPS,
        spinRpm: thrower.driverSpinRpm * powerFrac,
        noseAngleDeg: ui.noseAngleDeg ?? 0,
        hyzerDeg: ui.hyzerDeg ?? 0,
        launchAngleDeg: ui.launchAngleDeg ?? 0,
        releaseHeightM: ui.releaseHeightM ?? 1.4,
        hand: ui.hand ?? 'RH',
        style: ui.style ?? 'BH',
    };
}
