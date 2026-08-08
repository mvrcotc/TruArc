/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  TruArc — Ground-Truth Flight Envelopes (Section 0)             ║
 * ║  Domain-judgment targets the physics engine must satisfy.       ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * This file is DATA ONLY. The regression harness (built separately)
 * imports it and asserts every entry against the flight simulator.
 * Nothing in the physics engine may be merged unless this suite passes.
 *
 * These targets supersede the illustrative numbers in
 * docs/ACCURACY_ROADMAP.md §0.
 *
 * ── PROVENANCE ─────────────────────────────────────────────────────
 * Envelopes are synthesized from: published TechDisc release-speed vs
 * distance relationships (distance potential ≈ 5.5–6.5 ft per mph of
 * release speed with a well-matched disc), manufacturer flight charts
 * (Innova/Discraft), tournament caddie-book hole distances vs known pro
 * throws, and widely-corroborated community knowledge of how specific
 * molds behave per arm speed. Ranges are deliberately WIDE (±8–12%):
 * the point of v1 is to reject structurally wrong physics, not to
 * split hairs. Tighten ranges as measured field throws are added to
 * tests/ground-truth/field-data/ (Section 0 step 2).
 *
 * ── CONVENTIONS (the harness must implement exactly these) ─────────
 * • All throws are RIGHT-HAND BACKHAND on flat ground (ground elevation
 *   callback returns 0), sea-level air density, 175 g disc.
 * • Aim line = +Z in sim space (bearing 0). Lateral axis: +X = RIGHT of
 *   the aim line, −X = LEFT. All lateral values in this file follow
 *   that sign convention (negative = left = fade side for RHBH).
 * • Distances/heights in FEET (disc golf convention). The sim works in
 *   meters; harness converts (1 m = 3.28084 ft).
 * • Wind: speed in m/s; direction = degrees the wind comes FROM,
 *   matching the existing engine API. With aim bearing 0, direction 0
 *   is a pure HEADWIND, 180 is a pure TAILWIND, 90 is a crosswind
 *   from the right.
 * • releaseAngleDeg: negative = hyzer, positive = anhyzer (existing
 *   engine convention). noseAngleDeg: pitch of nose above velocity.
 * • powerPct scales the thrower tier's release speed linearly
 *   (100 = tier's releaseSpeedMph). NOTE: the current engine derives
 *   velocity from disc.speed, not from a thrower — the harness needs a
 *   thin adapter per engine; the Section 1 engine must accept release
 *   speed directly.
 *
 * ── SHAPE SIGNATURES (machine-checkable definitions) ───────────────
 * Computed from the trajectory's lateral profile x(s), where s = 0..1
 * is the fraction of total horizontal distance flown:
 *
 *  'straight'  |x(s)| < 20 ft for all s < 0.85, AND finish within
 *              finishLateralFt range.
 *  'sCurve'    max right excursion ≥ 8 ft, occurring in the window
 *              s ∈ [0.25, 0.75], AND finish at least 15 ft LEFT of
 *              that maximum-excursion point.
 *  'hyzerOut'  x(s) never exceeds +5 ft (never crosses meaningfully
 *              right of the aim line), and x is monotonically
 *              decreasing (leftward) for s > 0.3 within 3 ft tolerance.
 *  'turnover'  finish ≥ −5 ft (i.e. right of, or barely left of, the
 *              aim line), AND x(s) at s = 0.8 ≥ x(s) at s = 0.4 − 5 ft
 *              (the disc does NOT come back hard).
 *  'fadeOut'   max right excursion < 8 ft AND the leftward rate in the
 *              final third exceeds the average of the first two thirds
 *              (classic overstable finish; used for beat-in/slow-arm
 *              "meat hook" checks).
 *  'flex'      released anhyzer: moves right early (max right
 *              excursion ≥ 10 ft before s = 0.6), then finishes at
 *              least 20 ft left of the maximum-excursion point.
 *
 * Every entry also implies these UNIVERSAL invariants (assert for all):
 *  • Flight time between 2 and 14 s; no NaN/Infinity anywhere.
 *  • Apex occurs after release and before landing; y never < 0 mid-flight.
 *  • Ground speed monotonically trends down after the first 20% of
 *    flight (no energy gain — the "Anti-Gravity Rocket" regression).
 */

// ─── THROWER TIERS ───────────────────────────────────────────────
// releaseSpeedMph is the ground-truth anchor (what TechDisc measures).
// spinRpm is a nominal value for engines that take spin explicitly;
// real ratio is roughly proportional to release speed.
// NOTE: releaseSpeedMph is the tier's DRIVER release speed. Slower discs
// are released proportionally slower — see releaseSpeedMphFor() below,
// which every adapter must use rather than reading this field directly.
export const THROWER_TIERS = {
    rec: {
        releaseSpeedMph: 40,
        spinRpm: 800,
        description: 'Recreational arm. Max driver distance ~200–250 ft. High-speed discs are unusable air-bricks at this tier.',
    },
    intermediate: {
        releaseSpeedMph: 50,
        spinRpm: 1000,
        description: 'Intermediate arm. Max driver distance ~280–330 ft.',
    },
    advanced: {
        releaseSpeedMph: 60,
        spinRpm: 1200,
        description: 'Advanced/low-open arm. Max driver distance ~350–410 ft. Default tier for most envelopes.',
    },
    pro: {
        releaseSpeedMph: 70,
        spinRpm: 1400,
        description: 'Touring-pro arm. Max driver distance ~430–500 ft.',
    },
};

/**
 * Release speed depends on the DISC, not just the thrower.
 *
 * A tier's `releaseSpeedMph` is its DRIVER speed. Nobody releases a
 * putter as fast as a driver: a wide-rimmed driver gives far more
 * leverage and grip than a bead-rimmed putter, and touring pros measure
 * roughly 68–72 mph on drivers, ~58–62 on midranges and ~50–55 on
 * putters. Applying one speed to every disc — as this file originally
 * did — produced a perfectly monotonic distance error in the engine
 * under test, from +18 % on a speed-2 putter to −13 % on a speed-12
 * driver. That was a defect in the ground truth, not in any engine.
 *
 * Fitted through the pro numbers above and capped at 1.0, since the tier
 * speed is by definition the thrower's driver speed.
 */
export function releaseSpeedMphFor(tier, disc, powerPct = 100) {
    const discFactor = Math.min(1, 0.70 + 0.025 * disc.speed);
    return tier.releaseSpeedMph * discFactor * (powerPct / 100);
}

// Default throw used unless overridden: flat, slightly nose-up, aimed
// down the +Z line, calm air.
const FLAT = { powerPct: 100, releaseAngleDeg: 0, noseAngleDeg: 3, aimDeg: 0 };
const CALM = { speedMps: 0, directionDeg: 0 };
const HEADWIND_5 = { speedMps: 5, directionDeg: 0 };   // ~11 mph headwind
const TAILWIND_5 = { speedMps: 5, directionDeg: 180 }; // ~11 mph tailwind

// Reference discs — flight numbers MUST match src/data/discs.js.
const DISCS = {
    destroyer: { name: 'Destroyer', speed: 12, glide: 5, turn: -1, fade: 3 },
    wraith:    { name: 'Wraith',    speed: 11, glide: 5, turn: -1, fade: 3 },
    tern:      { name: 'Tern',      speed: 12, glide: 6, turn: -2, fade: 2 },
    boss:      { name: 'Boss',      speed: 13, glide: 5, turn:  0, fade: 3 },
    katana:    { name: 'Katana',    speed: 13, glide: 5, turn: -3, fade: 3 },
    mamba:     { name: 'Mamba',     speed: 11, glide: 6, turn: -5, fade: 1 },
    mystere:   { name: 'Mystere',   speed: 11, glide: 6, turn: -2, fade: 2 },
    firebird:  { name: 'Firebird',  speed: 9,  glide: 3, turn:  0, fade: 4 },
    teebird:   { name: 'Teebird',   speed: 7,  glide: 5, turn:  0, fade: 2 },
    leopard:   { name: 'Leopard',   speed: 6,  glide: 5, turn: -2, fade: 1 },
    buzzz:     { name: 'Buzzz',     speed: 5,  glide: 4, turn: -1, fade: 1 },
    roc:       { name: 'Roc',       speed: 4,  glide: 4, turn:  0, fade: 3 },
    aviar:     { name: 'Aviar',     speed: 2,  glide: 3, turn:  0, fade: 1 },
};

// ─── ABSOLUTE ENVELOPES ──────────────────────────────────────────
// expect ranges are [min, max] inclusive. finishLateralFt: −left/+right.
// maxRightExcursionFt: peak of x(s) over the whole flight (0 if the
// disc never crosses right of the aim line).
export const ENVELOPES = [

    // ═══ THE DISTANCE LADDER — advanced arm, flat, calm ═══════════
    // Core relative truth: putter < mid < fairway < distance driver,
    // with correct absolute anchors at 60 mph.
    {
        id: 'destroyer-adv-flat',
        description: 'Destroyer, advanced arm, full power, flat: workhorse max-distance stable driver.',
        rationale: '60 mph is right at the Destroyer\'s speed demand. Little turn (−1 barely moves at this speed), dependable fade 3 finish. ~5.9–6.8 ft/mph with this mold.',
        disc: DISCS.destroyer, thrower: 'advanced', throw: FLAT, wind: CALM,
        expect: {
            distanceFt: [350, 415],
            finishLateralFt: [-60, -20],
            apexFt: [16, 40],
            maxRightExcursionFt: [0, 22],
            shape: 'sCurve',
        },
    },
    {
        id: 'wraith-adv-flat',
        description: 'Wraith, advanced arm, full power, flat.',
        rationale: 'One speed below the Destroyer with identical turn/fade → nearly the same result at 60 mph, marginally less speed demand.',
        disc: DISCS.wraith, thrower: 'advanced', throw: FLAT, wind: CALM,
        expect: {
            distanceFt: [345, 410],
            finishLateralFt: [-55, -20],
            apexFt: [16, 40],
            maxRightExcursionFt: [0, 25],
            shape: 'sCurve',
        },
    },
    {
        id: 'teebird-adv-flat',
        description: 'Teebird, advanced arm, full power, flat: the fairway control benchmark.',
        rationale: 'Turn 0 → dead straight with a modest forward-penetrating fade 2 finish. The most predictable disc in golf; if the engine can\'t fly a Teebird straight, nothing else matters.',
        disc: DISCS.teebird, thrower: 'advanced', throw: FLAT, wind: CALM,
        expect: {
            distanceFt: [290, 345],
            finishLateralFt: [-35, -8],
            apexFt: [15, 32],
            maxRightExcursionFt: [0, 12],
            shape: 'straight',
        },
    },
    {
        id: 'buzzz-adv-flat',
        description: 'Buzzz, advanced arm, full power, flat: the straight-midrange benchmark.',
        rationale: 'The most famous point-and-shoot disc ever made. Minimal lateral movement in either direction at full advanced power.',
        disc: DISCS.buzzz, thrower: 'advanced', throw: FLAT, wind: CALM,
        expect: {
            distanceFt: [265, 320],
            finishLateralFt: [-20, 5],
            apexFt: [12, 28],
            maxRightExcursionFt: [0, 15],
            shape: 'straight',
        },
    },
    {
        id: 'roc-adv-flat',
        description: 'Roc, advanced arm, full power, flat: overstable mid.',
        rationale: 'Fade 3 on a speed-4 disc → shorter than a Buzzz with a firm left finish. Classic "finishes left every time" mid.',
        disc: DISCS.roc, thrower: 'advanced', throw: FLAT, wind: CALM,
        expect: {
            distanceFt: [245, 300],
            finishLateralFt: [-42, -12],
            apexFt: [12, 28],
            maxRightExcursionFt: [0, 8],
            shape: 'fadeOut',
        },
    },
    {
        id: 'aviar-adv-flat',
        description: 'Aviar, advanced arm, full power, flat: thrown putter.',
        rationale: 'Full-send putter for an advanced arm is ~230–270 ft with a gentle finish. Must be clearly shorter than the Buzzz.',
        disc: DISCS.aviar, thrower: 'advanced', throw: FLAT, wind: CALM,
        expect: {
            distanceFt: [215, 270],
            finishLateralFt: [-22, 8],
            apexFt: [10, 26],
            maxRightExcursionFt: [0, 12],
            shape: 'straight',
        },
    },

    // ═══ TURN / GLIDE BEHAVIOR — advanced arm ═════════════════════
    {
        id: 'tern-adv-flat',
        description: 'Tern, advanced arm, full power, flat: glidey −2 distance driver.',
        rationale: 'Glide 6 + turn −2 at 60 mph → visible rightward turn phase, longer than the Destroyer for this arm, softer left finish (fade 2).',
        disc: DISCS.tern, thrower: 'advanced', throw: FLAT, wind: CALM,
        expect: {
            distanceFt: [360, 425],
            finishLateralFt: [-38, 5],
            apexFt: [17, 42],
            maxRightExcursionFt: [10, 40],
            shape: 'sCurve',
        },
    },
    {
        id: 'mamba-adv-flat',
        description: 'Mamba, advanced arm, full power, flat: max-turn (−5) glider.',
        rationale: 'Turn −5 / fade 1: deep turn phase, may never come back to the aim line. Longest right excursion of any envelope. Distance similar to Destroyer via glide, not speed.',
        disc: DISCS.mamba, thrower: 'advanced', throw: FLAT, wind: CALM,
        expect: {
            distanceFt: [345, 420],
            finishLateralFt: [-18, 45],
            apexFt: [17, 45],
            maxRightExcursionFt: [20, 65],
            shape: 'turnover',
        },
    },
    {
        id: 'boss-adv-flat',
        description: 'Boss, advanced arm, full power, flat: speed 13 / turn 0 — too much disc for 60 mph.',
        rationale: 'Speed demand exceeds the arm: no turn phase at all, early fade, SHORTER than the slower Destroyer/Tern. The "more speed ≠ more distance" truth the current engine fails.',
        disc: DISCS.boss, thrower: 'advanced', throw: FLAT, wind: CALM,
        expect: {
            distanceFt: [310, 375],
            finishLateralFt: [-75, -30],
            apexFt: [16, 36],
            maxRightExcursionFt: [0, 8],
            shape: 'fadeOut',
        },
    },
    {
        id: 'katana-adv-flat',
        description: 'Katana, advanced arm, full power, flat: −3 turn at its speed demand.',
        rationale: 'At 60 mph the Katana works: pronounced S with a real turn phase and fade-3 return.',
        disc: DISCS.katana, thrower: 'advanced', throw: FLAT, wind: CALM,
        expect: {
            distanceFt: [355, 425],
            finishLateralFt: [-45, 0],
            apexFt: [16, 42],
            maxRightExcursionFt: [15, 50],
            shape: 'sCurve',
        },
    },

    // ═══ STABILITY-vs-ARM-SPEED INVERSIONS ════════════════════════
    // The single most important family of checks. A model with fake
    // (speed-independent) turn/fade fails all three.
    {
        id: 'katana-adv-lowpower',
        description: 'Katana at 70% advanced power (≈42 mph): understable disc thrown slow acts OVERSTABLE.',
        rationale: 'Below its speed demand the −3 turn never activates; the disc just fades. Anyone who has handed a Katana to a beginner has watched this.',
        disc: DISCS.katana, thrower: 'advanced',
        throw: { ...FLAT, powerPct: 70 }, wind: CALM,
        expect: {
            distanceFt: [210, 285],
            finishLateralFt: [-70, -25],
            apexFt: [6, 22],
            maxRightExcursionFt: [0, 6],
            shape: 'fadeOut',
        },
    },
    {
        id: 'destroyer-rec-flat',
        description: 'Destroyer, rec arm (40 mph), full power: the classic beginner meat-hook.',
        rationale: 'Way below speed demand: immediate hard fade, badly short. This envelope is why the app should eventually WARN users off discs above their arm speed — a monetization-relevant truth.',
        disc: DISCS.destroyer, thrower: 'rec', throw: FLAT, wind: CALM,
        expect: {
            distanceFt: [170, 245],
            finishLateralFt: [-80, -30],
            apexFt: [5, 18],
            maxRightExcursionFt: [0, 5],
            shape: 'fadeOut',
        },
    },
    {
        id: 'leopard-rec-flat',
        description: 'Leopard, rec arm (40 mph), full power: the correct beginner driver.',
        rationale: 'At 40 mph the −2 turn roughly cancels the wind-down fade → flies straight and OUTDISTANCES the Destroyer for this arm (see comparative leopard-beats-destroyer-rec).',
        disc: DISCS.leopard, thrower: 'rec', throw: FLAT, wind: CALM,
        expect: {
            distanceFt: [195, 255],
            finishLateralFt: [-25, 15],
            apexFt: [5, 18],
            maxRightExcursionFt: [0, 18],
            shape: 'straight',
        },
    },
    {
        id: 'leopard-adv-flat',
        description: 'Leopard, advanced arm, full power: same disc, fast arm → turnover.',
        rationale: 'The mirror image of the inversion: above its speed demand the Leopard turns and stays right or barely returns.',
        disc: DISCS.leopard, thrower: 'advanced', throw: FLAT, wind: CALM,
        expect: {
            distanceFt: [280, 345],
            finishLateralFt: [-12, 40],
            apexFt: [15, 34],
            maxRightExcursionFt: [10, 45],
            shape: 'turnover',
        },
    },

    // ═══ PRO-TIER ANCHORS ═════════════════════════════════════════
    {
        id: 'destroyer-pro-flat',
        description: 'Destroyer, pro arm (70 mph), full power, flat: the tournament reference throw.',
        rationale: 'At 70 mph the −1 turn activates properly → full S-curve, 430–500 ft. This is the number every disc golfer knows.',
        disc: DISCS.destroyer, thrower: 'pro', throw: FLAT, wind: CALM,
        expect: {
            distanceFt: [425, 500],
            finishLateralFt: [-65, -15],
            apexFt: [20, 52],
            maxRightExcursionFt: [8, 45],
            shape: 'sCurve',
        },
    },
    {
        id: 'buzzz-pro-flat',
        description: 'Buzzz, pro arm, full power, flat.',
        rationale: 'Pros throw the Buzzz ~330–360 ft and it still flies straight — straightness must not degrade with arm speed for a −1/1 mid (only mild turn appears).',
        disc: DISCS.buzzz, thrower: 'pro', throw: FLAT, wind: CALM,
        expect: {
            distanceFt: [305, 365],
            finishLateralFt: [-25, 12],
            apexFt: [15, 32],
            maxRightExcursionFt: [0, 22],
            shape: 'straight',
        },
    },

    // ═══ WIND BEHAVIOR — advanced arm ═════════════════════════════
    // Direction of effect is what matters; magnitudes are loose.
    {
        id: 'destroyer-adv-headwind',
        description: 'Destroyer into a 5 m/s headwind: acts LESS stable (more turn).',
        rationale: 'Headwind raises airspeed → higher effective speed → the −1 turn behaves like −2/−3. More right movement, later/softer fade, modest distance loss. THE canonical wind check.',
        disc: DISCS.destroyer, thrower: 'advanced', throw: FLAT, wind: HEADWIND_5,
        expect: {
            distanceFt: [300, 395],
            finishLateralFt: [-45, 10],
            apexFt: [22, 55],           // headwind lofts the disc
            maxRightExcursionFt: [5, 45],
            shape: 'sCurve',
        },
    },
    {
        id: 'destroyer-adv-tailwind',
        description: 'Destroyer with a 5 m/s tailwind: acts MORE stable (early fade, flat flight).',
        rationale: 'Tailwind lowers airspeed → disc behaves overstable and flies lower. Right excursion shrinks toward zero; fade arrives earlier and finishes harder left.',
        disc: DISCS.destroyer, thrower: 'advanced', throw: FLAT, wind: TAILWIND_5,
        expect: {
            distanceFt: [320, 410],
            finishLateralFt: [-70, -25],
            apexFt: [8, 28],           // tailwind flattens the flight
            maxRightExcursionFt: [0, 10],
            shape: 'fadeOut',
        },
    },
    {
        id: 'tern-adv-headwind',
        description: 'Tern (−2) into a 5 m/s headwind: flips over.',
        rationale: 'An understable distance driver in a real headwind turns over and does not come back — the reason players reach for a Firebird in wind.',
        disc: DISCS.tern, thrower: 'advanced', throw: FLAT, wind: HEADWIND_5,
        expect: {
            distanceFt: [290, 390],
            finishLateralFt: [-10, 55],
            apexFt: [22, 55],
            maxRightExcursionFt: [25, 75],
            shape: 'turnover',
        },
    },

    // ═══ RELEASE-ANGLE BEHAVIOR — advanced arm ════════════════════
    {
        id: 'firebird-adv-hyzer',
        description: 'Firebird on a −15° hyzer at 85% power: the dependable hyzer line.',
        rationale: 'Turn 0 / fade 4 on hyzer NEVER flips up or crosses the aim line right. Sacrifices distance for certainty — the shot pros throw when OB right exists.',
        disc: DISCS.firebird, thrower: 'advanced',
        throw: { ...FLAT, powerPct: 85, releaseAngleDeg: -15 }, wind: CALM,
        expect: {
            distanceFt: [215, 285],
            finishLateralFt: [-95, -40],
            apexFt: [6, 20],
            maxRightExcursionFt: [0, 3],
            shape: 'hyzerOut',
        },
    },
    {
        id: 'destroyer-adv-flex',
        description: 'Destroyer on a +15° anhyzer at full power: the flex shot.',
        rationale: 'Overstable disc released anhyzer rides right early, then the fade takes over and brings it all the way back left. S-shape with a larger amplitude than the flat throw, similar or better distance.',
        disc: DISCS.destroyer, thrower: 'advanced',
        throw: { ...FLAT, releaseAngleDeg: 15 }, wind: CALM,
        expect: {
            distanceFt: [330, 420],
            finishLateralFt: [-55, 0],
            apexFt: [8, 28],
            maxRightExcursionFt: [15, 65],
            shape: 'flex',
        },
    },
    {
        id: 'leopard-adv-anhyzer',
        description: 'Leopard on a +10° anhyzer at 85% power: holds the turnover line.',
        rationale: 'Understable disc released anhyzer keeps the anhyzer the whole flight and finishes right — fade 1 cannot rescue it. The standard turnover/anny placement shot.',
        disc: DISCS.leopard, thrower: 'advanced',
        throw: { ...FLAT, powerPct: 85, releaseAngleDeg: 10 }, wind: CALM,
        expect: {
            distanceFt: [240, 310],
            finishLateralFt: [10, 65],
            apexFt: [7, 22],
            maxRightExcursionFt: [15, 70],
            shape: 'turnover',
        },
    },

    // ═══ NOSE ANGLE ═══════════════════════════════════════════════
    {
        id: 'destroyer-adv-noseup',
        description: 'Destroyer at full power with 8° nose-up: the distance killer.',
        rationale: 'Nose-up bleeds speed into altitude and stalls the disc early → higher apex, early fade, big distance loss vs the 3° baseline (see comparative nose-up-penalty).',
        disc: DISCS.destroyer, thrower: 'advanced',
        throw: { ...FLAT, noseAngleDeg: 8 }, wind: CALM,
        expect: {
            distanceFt: [280, 365],
            finishLateralFt: [-70, -25],
            apexFt: [28, 60],
            maxRightExcursionFt: [0, 15],
            shape: 'fadeOut',
        },
    },
];

// ─── COMPARATIVE ASSERTIONS ──────────────────────────────────────
// Relative truths that must hold between two simulated throws. These
// are stronger than absolute ranges: they encode the orderings players
// actually rely on for disc selection. Each side is either an envelope
// id (reuse its exact setup) or an inline {disc, thrower, throw, wind}.
// metric: 'distanceFt' | 'apexFt' | 'maxRightExcursionFt' | 'finishLateralFt'.
// Assert: value(a) − value(b) ≥ minDeltaFt.
export const COMPARATIVES = [
    {
        id: 'ladder-driver-beats-mid',
        rationale: 'A distance driver must out-throw a midrange for an arm that can power both.',
        metric: 'distanceFt', a: 'destroyer-adv-flat', b: 'buzzz-adv-flat', minDeltaFt: 40,
    },
    {
        id: 'ladder-mid-beats-putter',
        rationale: 'Mid must out-throw putter at the same arm.',
        metric: 'distanceFt', a: 'buzzz-adv-flat', b: 'aviar-adv-flat', minDeltaFt: 20,
    },
    {
        id: 'speed-demand-tern-beats-boss',
        rationale: 'At 60 mph the slower, glidier Tern out-throws the speed-13 Boss. "Faster disc" must NOT mean "farther" below its speed demand.',
        metric: 'distanceFt', a: 'tern-adv-flat', b: 'boss-adv-flat', minDeltaFt: 15,
    },
    {
        id: 'leopard-beats-destroyer-rec',
        rationale: 'For a 40 mph arm the Leopard out-throws the Destroyer. The single most valuable disc-recommendation truth in the app.',
        metric: 'distanceFt', a: 'leopard-rec-flat', b: 'destroyer-rec-flat', minDeltaFt: 10,
    },
    {
        id: 'glide-adds-distance',
        rationale: 'Mystere (11/6/−2/2) should not fly meaningfully shorter than Wraith (11/5/−1/3) at the same arm; glide 6 vs 5 buys hang time.',
        metric: 'distanceFt',
        a: { disc: DISCS.mystere, thrower: 'advanced', throw: FLAT, wind: CALM },
        b: 'wraith-adv-flat',
        minDeltaFt: -10, // allow ~parity, forbid Mystere being clearly shorter
    },
    {
        id: 'pro-beats-advanced',
        rationale: 'Same disc, +10 mph release → substantially more distance.',
        metric: 'distanceFt', a: 'destroyer-pro-flat', b: 'destroyer-adv-flat', minDeltaFt: 40,
    },
    {
        id: 'headwind-increases-turn',
        rationale: 'Headwind must strictly increase rightward turn vs calm for the same throw.',
        metric: 'maxRightExcursionFt', a: 'destroyer-adv-headwind', b: 'destroyer-adv-flat', minDeltaFt: 3,
    },
    {
        id: 'tailwind-kills-turn',
        // Was 'tailwind-hardens-fade', asserted on finishLateralFt. That
        // target was wrong: landing lateral is confounded by flight
        // length. A tailwind lowers airspeed, so the disc genuinely acts
        // more overstable — but it also lands sooner, so it can fade
        // harder per second and still finish LESS far left. Right
        // excursion measures the stability shift directly, with nothing
        // to confound it.
        rationale: 'Tailwind lowers airspeed → raises α → the turn phase shrinks or disappears versus calm.',
        metric: 'maxRightExcursionFt', a: 'destroyer-adv-flat', b: 'destroyer-adv-tailwind', minDeltaFt: 3,
    },
    {
        id: 'tailwind-flattens-flight',
        rationale: 'Tailwind lowers apex vs calm.',
        metric: 'apexFt', a: 'destroyer-adv-flat', b: 'destroyer-adv-tailwind', minDeltaFt: 2,
    },
    {
        id: 'nose-up-penalty',
        rationale: '8° nose-up must cost at least 25 ft vs the 3° baseline.',
        metric: 'distanceFt', a: 'destroyer-adv-flat', b: 'destroyer-adv-noseup', minDeltaFt: 25,
    },
    {
        id: 'nose-up-balloons',
        rationale: 'Nose-up raises the apex vs baseline.',
        metric: 'apexFt', a: 'destroyer-adv-noseup', b: 'destroyer-adv-flat', minDeltaFt: 3,
    },
    {
        id: 'hyzer-costs-distance',
        rationale: 'A committed hyzer release costs distance vs flat for a stable disc (spent laterally, not forward). Compare Firebird hyzer to its own flat 85% throw.',
        metric: 'distanceFt',
        a: { disc: DISCS.firebird, thrower: 'advanced', throw: { ...FLAT, powerPct: 85 }, wind: CALM },
        b: 'firebird-adv-hyzer',
        minDeltaFt: 10,
    },
];

// ─── FIELD DATA (Section 0, step 2 — placeholder) ────────────────
// Measured throws (TechDisc sessions, field measurements) get added as
// JSON files under tests/ground-truth/field-data/, each row:
//   { disc, releaseSpeedMph, spinRpm, noseAngleDeg, hyzerDeg,
//     measuredDistanceFt, lateralFinishFt, notes, date }
// The harness treats them as additional absolute envelopes with ±10%
// tolerance, and they take precedence over the synthesized targets
// above when they conflict.
export const FIELD_DATA_DIR = 'tests/ground-truth/field-data';
