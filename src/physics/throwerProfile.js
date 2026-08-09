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
 * The app's out-of-the-box throw, in the UI's own shape
 * (`{power, aimAngle, releaseAngle, noseAngle}`). Single source of truth
 * for BOTH App.jsx's initial state and ThrowPanel's "Reset to default"
 * button — if those two ever disagreed, Reset would silently move the
 * player somewhere other than where they started.
 */
export const DEFAULT_THROW_SETTINGS = Object.freeze({
    power: 80,
    aimAngle: 0,
    releaseAngle: 0,
    noseAngle: 2,
});

/**
 * UI wind (`{speed, direction}`) → the engine's wind
 * (`{speedMps, directionDeg}`).
 *
 * ── THIS EXISTS BECAUSE THE RENAME WAS SILENTLY LOST ─────────────────
 * `sixDof.windVector()` reads `speedMps`/`directionDeg`. The app's wind
 * object has always been `{speed, direction}` and was passed straight
 * through, so `wind?.speedMps ?? 0` evaluated to 0 on every 6-DOF
 * throw: **the wind sliders did nothing whenever the 6-DOF engine was
 * active**, which is the default. The legacy engine reads `wind.speed`
 * directly and was unaffected, and the ground-truth suite's adapter
 * targets the legacy engine — so nothing in the test suite ever
 * exercised the broken path. Converting here, at the one boundary, is
 * what makes the fix un-repeatable rather than patching call sites.
 *
 * Values are unchanged, only renamed: the two engines' direction
 * conventions were verified identical over d ∈ {0,45,90,135,180,270}
 * (legacy `(-s·sin d, -s·cos d)` in output frame equals sixDof's
 * `[-s·cos d, s·sin d, 0]` mapped through `toOutputFrame`), so this is
 * a pure rename and cannot rotate the wind.
 *
 * @param {{speed?: number, direction?: number}} uiWind
 * @returns {{speedMps: number, directionDeg: number}}
 */
export function buildWindSpec(uiWind) {
    return {
        speedMps: uiWind?.speed ?? 0,
        directionDeg: uiWind?.direction ?? 0,
    };
}

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
