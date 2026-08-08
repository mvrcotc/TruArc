/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  TruArc — Flight Numbers → Aerodynamic Coefficients             ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * THIS IS THE ONLY PLACE TUNING IS ALLOWED TO HAPPEN.
 *
 * sixDof.js contains physics — equations that are right or wrong, never
 * "tuned". This file contains the empirical bridge from the four numbers
 * printed on a disc (speed, glide, turn, fade) to the aerodynamic
 * coefficients that physics consumes. When flight behaviour is off, the
 * fix belongs here (or in the calibration that fits it), never in the
 * integrator. The old engine's failure mode was exactly this boundary
 * not existing: constants were edited inside the force computation until
 * one case looked right and three others silently broke.
 *
 * The numbers in calibratedMapping.json are FITTED, not hand-picked —
 * `node tools/calibrate.mjs` optimises them against the 35-case ground
 * truth suite. Do not hand-edit them; re-run the calibration.
 *
 * ── WHAT EACH FLIGHT NUMBER CONTROLS ────────────────────────────────
 *
 * SPEED (1–14) — rim sharpness / aerodynamic efficiency.
 *   Faster discs have LOWER parasitic drag (CD0) and LOWER zero-α lift
 *   (CL0). The low CL0 is what creates "speed demand": a speed-13 driver
 *   simply cannot make its own weight in lift at 40 mph, so it flies at
 *   a high angle of attack, sits above its trim angle for the whole
 *   flight, and hooks left. Nothing scripts the beginner meat-hook — it
 *   is a consequence of this one line.
 *
 * GLIDE (1–7) — lift-curve slope (CLa). More glide = more lift per
 *   degree of α = longer hang time at the same speed.
 *
 * TURN (−5…+1) and FADE (0–5) — together they define the pitching-moment
 *   line Cm(α) = Cma·(α − αTrim):
 *     • αTrim rises with understability (more negative turn). A disc
 *       turns while α < αTrim, so a high trim angle means it spends most
 *       of the flight turning.
 *     • Fade lowers αTrim (fades sooner) and raises Cma (fades harder).
 *   This is why turn and fade cannot be mapped independently: they are
 *   two readings of one curve.
 */

import FITTED from './calibratedMapping.json' with { type: 'json' };

const DEG = Math.PI / 180;

/**
 * Starting point for calibration and the fallback if the fitted file is
 * unavailable. Values are physically-motivated priors (drag polar and
 * lift slope in the range Hummel & Hubbard measured for flying discs,
 * scaled for the sleeker golf-disc profile), NOT tuned results.
 */
export const PRIOR_MAPPING = {
    // Drag: CD = CD0 + CDa·(α − alpha0)²
    CD0_base: 0.045,
    CD0_perSpeed: -0.0015,
    CDa: 2.0,
    alpha0Deg: -2.5,

    // Lift: CL = CL0 + CLa·α   (soft stall past alphaStall)
    CL0_base: 0.14,
    CL0_perSpeed: -0.005,
    CLa_base: 1.4,
    CLa_perGlide: 0.10,
    alphaStallDeg: 26,

    // Pitching moment: Cm = Cma·(α − alphaTrim)
    alphaTrim_base: 3.0,
    alphaTrim_perTurn: -1.6,   // multiplied by `turn` (negative) → raises trim
    alphaTrim_perFade: -0.8,
    Cma_base: 0.25,
    Cma_perFade: 0.08,

    // Damping and cross-coupling
    Clp: -0.040,   // roll damping
    Clr: -0.008,   // advancing-blade roll from spin (drives late nose-up)
    Cmq: -0.030,   // pitch damping
    Cnr: -0.0002,  // spin decay

    // Standard-throw definition (see sixDof.js initialState)
    launchAngleDeg: 6.0,
};

/**
 * Parameters the calibrator is allowed to move, with hard bounds.
 *
 * Bounds are PHYSICAL STATEMENTS, not just numeric guardrails, and some
 * of them exist to forbid degenerate fits. An unconstrained first run
 * discovered that it could buy distance by driving `Cma_perFade` and
 * `alphaTrim_perFade` to zero — making a Firebird (fade 4) and a Teebird
 * (fade 2) the same disc. That scored well and was nonsense: if a flight
 * number does not change the flight, the model cannot support disc
 * selection, which is the entire product. Lower bounds below marked
 * "must matter" encode that a flight number is meaningful.
 */
export const CALIBRATION_BOUNDS = {
    CD0_base: [0.02, 0.09],
    CD0_perSpeed: [-0.004, 0],
    CDa: [0.5, 4.0],
    // Minimum-drag angle sits at or below the zero-lift angle, which is
    // negative for a cambered disc. A positive value is unphysical.
    alpha0Deg: [-8, 0],

    CL0_base: [0.05, 0.30],
    // Faster (sharper-rimmed) discs make less lift at zero α — this is
    // what creates "speed demand" — but the effect must not be so steep
    // that a speed-12 driver cannot climb at all at low α, which would
    // make every drive flat and force fade to be traded away.
    CL0_perSpeed: [-0.010, -0.001],
    CLa_base: [0.6, 2.5],
    CLa_perGlide: [0.01, 0.30],   // glide must matter
    alphaStallDeg: [18, 35],

    alphaTrim_base: [-2, 10],
    alphaTrim_perTurn: [-4, -0.1],  // turn must matter
    alphaTrim_perFade: [-3, -0.2],  // fade must matter
    Cma_base: [0.05, 1.2],
    Cma_perFade: [0.03, 0.4],       // fade must matter

    Clp: [-0.3, -0.001],
    Clr: [-0.08, -0.002],  // advancing-blade coupling is a real effect
    Cmq: [-0.3, -0.001],
    Cnr: [-0.002, -0.00001],
    launchAngleDeg: [0, 16],
};

export const ACTIVE_MAPPING = { ...PRIOR_MAPPING, ...(FITTED?.mapping ?? {}) };

/**
 * Map a disc's flight numbers to the coefficient set sixDof.js consumes.
 * All angles come out in RADIANS — the engine never sees degrees.
 */
export function discToCoefficients(disc, mapping = ACTIVE_MAPPING) {
    const m = mapping;
    const { speed, glide, turn, fade } = disc;

    const alphaTrimDeg =
        m.alphaTrim_base
        + m.alphaTrim_perTurn * turn      // turn is ≤ 0, coefficient is ≤ 0 → raises trim
        + m.alphaTrim_perFade * fade;

    return {
        CD0: Math.max(0.01, m.CD0_base + m.CD0_perSpeed * speed),
        CDa: m.CDa,
        alpha0: m.alpha0Deg * DEG,

        CL0: Math.max(0.01, m.CL0_base + m.CL0_perSpeed * speed),
        CLa: Math.max(0.1, m.CLa_base + m.CLa_perGlide * glide),
        alphaStall: m.alphaStallDeg * DEG,

        alphaTrim: alphaTrimDeg * DEG,
        Cma: Math.max(0.01, m.Cma_base + m.Cma_perFade * fade),

        Clp: m.Clp,
        Clr: m.Clr,
        Cmq: m.Cmq,
        Cnr: m.Cnr,
    };
}

/** The calibrated standard-throw launch elevation, in degrees. */
export function launchAngleDeg(mapping = ACTIVE_MAPPING) {
    return mapping.launchAngleDeg;
}
