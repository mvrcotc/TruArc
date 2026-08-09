/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  TruArc — Disc Flight Profile ("what does this disc do?")        ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Computes a disc's NATURAL flight — the canonical reference throw a
 * manufacturer's flight chart implies — so a player can see a disc's
 * inherent character before committing to it on a hole.
 *
 * ── WHY THE REAL ENGINE, NOT A DECORATIVE CURVE ──────────────────────
 * The obvious cheap implementation is a parametric S-curve drawn from
 * the turn/fade numbers. This module deliberately does NOT do that: it
 * runs the SAME 6-DOF engine (`sixDof.simulateFlight`) through the SAME
 * coefficient mapping (`discCoefficients.discToCoefficients`) and the
 * SAME thrower→throwSpec bridge (`throwerProfile.buildThrowSpec`) that
 * the app uses for a real throw. If the chart came from a different
 * model than the simulation, a player could learn "this disc finishes
 * left" from the panel and then watch it do something else on the map —
 * a credibility gap, and precisely the class of quiet inconsistency
 * docs/ACCURACY_ROADMAP.md exists to eliminate. The cost of being honest
 * here is one ~6-7 ms simulation per disc selection, memoized by caller.
 *
 * ── REFERENCE THROW, NOT THE USER'S CURRENT SETTINGS ─────────────────
 * `REFERENCE_THROW` is flat (no hyzer, no nose), full power, no wind,
 * flat ground, default thrower. That is what makes the profile a
 * PROPERTY OF THE DISC and comparable across discs — the whole point of
 * "what does it do naturally". The live throw (settings sliders, wind,
 * real terrain) is already shown on the map and in FlightStats; this
 * panel answers a different question and must not drift as sliders move.
 * Callers should label it as a reference throw so the two can't be
 * confused.
 *
 * ── WHAT IS AND ISN'T CALIBRATED ─────────────────────────────────────
 * The engine currently passes 13/35 ground-truth envelopes (see
 * docs/ACCURACY_ROADMAP.md §1 and tests/ground-truth/). Shapes are
 * directionally right; absolute distances still run short for some
 * archetypes. The stability LABEL below is therefore derived from the
 * manufacturer's published numbers (what the disc is sold as), not from
 * the simulated path — so a calibration gap can never silently rewrite a
 * disc's advertised character. The drawn path is the engine's answer;
 * the label is the manufacturer's. Callers surface both.
 */

import { simulateFlight } from './sixDof.js';
import { discToCoefficients, ACTIVE_MAPPING, launchAngleDeg } from './discCoefficients.js';
import { buildThrowSpec, DEFAULT_THROWER } from './throwerProfile.js';

const METERS_TO_FEET = 3.28084;

/**
 * The canonical conditions a flight chart implies: flat release, full
 * power, no wind, flat ground, right-hand backhand (the reference every
 * published flight number is quoted for).
 */
export const REFERENCE_THROW = Object.freeze({
    powerPct: 100,
    hyzerDeg: 0,
    noseAngleDeg: 0,
    hand: 'RH',
    style: 'BH',
});

/**
 * Stability read off the manufacturer's numbers, the way players read
 * them: `turn + fade`. A crude metric — it collapses a whole flight into
 * one scalar and says nothing about WHEN the turn happens — but it is
 * the shared vocabulary, and buckets are chosen so the well-known
 * reference discs land where a player expects (Buzzz 5/4/-1/1 → Stable,
 * Leopard 6/5/-2/1 → Understable, Firebird 9/3/0/4 → Very Overstable).
 * Asserted against those discs by name in the test suite so a threshold
 * tweak can't quietly reclassify the discs everyone calibrates against.
 */
export function stabilityFromNumbers(disc) {
    const s = (disc?.turn ?? 0) + (disc?.fade ?? 0);
    if (s < -2) return { key: 'very-understable', label: 'Very Understable', color: '#00e5ff', sum: s };
    if (s < -0.5) return { key: 'understable', label: 'Understable', color: '#4dd4ff', sum: s };
    if (s <= 1.5) return { key: 'stable', label: 'Stable', color: '#00ff88', sum: s };
    if (s <= 3) return { key: 'overstable', label: 'Overstable', color: '#ff6b35', sum: s };
    return { key: 'very-overstable', label: 'Very Overstable', color: '#ff3366', sum: s };
}

/**
 * Simulate a disc's reference flight and reduce it to what a profile
 * panel needs.
 *
 * @param {{speed,glide,turn,fade}} disc
 * @param {Object} [options] - { thrower, mapping, simOptions } — overrides
 *        for Section 6 (per-user thrower profiles) and for tests.
 * @returns {{
 *   path: {lateralM, downrangeM, heightM}[],
 *   distanceM, distanceFt, apexM, apexFt,
 *   lateralFinishM, lateralFinishFt,
 *   maxRightM, maxRightFt, maxLeftM, maxLeftFt,
 *   flightTimeS,
 *   stability: {key, label, color, sum},
 *   reference: typeof REFERENCE_THROW,
 * }}
 *
 * Lateral sign follows the engine's output frame: POSITIVE = right of
 * the tee line, NEGATIVE = left. For the RH backhand reference throw
 * that means a turn reads positive and a fade reads negative, so an
 * overstable disc finishes with `lateralFinishM < 0`.
 */
export function computeDiscProfile(disc, options = {}) {
    if (!disc || !Number.isFinite(disc.speed)) {
        throw new Error('computeDiscProfile: disc must carry numeric flight numbers');
    }

    const mapping = options.mapping ?? ACTIVE_MAPPING;
    const thrower = options.thrower ?? DEFAULT_THROWER;
    const coefficients = discToCoefficients(disc, mapping);
    const throwSpec = buildThrowSpec(thrower, disc, {
        ...REFERENCE_THROW,
        launchAngleDeg: launchAngleDeg(mapping),
    });

    // No wind, no terrain callback (flat ground at 0) — the reference
    // conditions. Anything else here would make the profile a property
    // of the situation rather than of the disc.
    const result = simulateFlight(disc, throwSpec, {}, null, {
        ...(options.simOptions ?? {}),
        coefficients,
    });

    // Stop at touchdown. simulateFlight appends the interpolated landing
    // point at `landingIndex`; drawing past it would show the disc
    // continuing below ground.
    const end = result.landingIndex >= 0 ? result.landingIndex + 1 : result.points.length;
    const raw = result.points.slice(0, end);

    const path = raw.map((p) => ({ lateralM: p.x, downrangeM: p.z, heightM: p.y }));

    let maxRightM = 0;
    let maxLeftM = 0;
    let apexM = 0;
    for (const p of path) {
        if (p.lateralM > maxRightM) maxRightM = p.lateralM;
        if (p.lateralM < maxLeftM) maxLeftM = p.lateralM;
        if (p.heightM > apexM) apexM = p.heightM;
    }
    const last = path[path.length - 1] ?? { lateralM: 0, downrangeM: 0 };

    return {
        path,
        distanceM: result.totalDistance,
        distanceFt: result.totalDistance * METERS_TO_FEET,
        apexM,
        apexFt: apexM * METERS_TO_FEET,
        lateralFinishM: last.lateralM,
        lateralFinishFt: last.lateralM * METERS_TO_FEET,
        maxRightM,
        maxRightFt: maxRightM * METERS_TO_FEET,
        maxLeftM,
        maxLeftFt: maxLeftM * METERS_TO_FEET,
        flightTimeS: result.flightTimeS,
        stability: stabilityFromNumbers(disc),
        reference: REFERENCE_THROW,
    };
}

/**
 * Project a profile's path into SVG viewBox coordinates for a top-down
 * flight chart (downrange runs bottom→top, the orientation every
 * published flight chart uses).
 *
 * `minLateralSpanM` is load-bearing, not cosmetic: without a floor on
 * the horizontal scale, a dead-straight disc's few centimetres of
 * lateral drift would be stretched across the full chart width and drawn
 * as a dramatic S-curve. The floor keeps "straight" looking straight.
 * The chart is anisotropic by necessity (a 120 m drive with 12 m of
 * lateral movement cannot be drawn to scale in a side panel), which is
 * why callers must label the axes with real distances.
 */
export function projectPathToChart(path, opts = {}) {
    const {
        width = 200,
        height = 240,
        padX = 10,
        padY = 10,
        minLateralSpanM = 7.5, // ~25 ft each side
        // The axis extends slightly past the widest point so the landing
        // marker (a filled dot plus a halo) renders fully inside the plot
        // instead of being clipped against the border — an overstable
        // driver's finish IS the extreme point, so without headroom the
        // single most important marker on the chart is the one that gets
        // cut in half. Callers label the axis with the resulting span, so
        // the caption stays a true statement about the axis bounds.
        headroom = 1.12,
    } = opts;

    if (!path || path.length === 0) return { points: [], lateralSpanM: minLateralSpanM, downrangeM: 0 };

    let maxAbsLateral = 0;
    let maxDownrange = 0;
    for (const p of path) {
        const a = Math.abs(p.lateralM);
        if (a > maxAbsLateral) maxAbsLateral = a;
        if (p.downrangeM > maxDownrange) maxDownrange = p.downrangeM;
    }

    const lateralSpanM = Math.max(maxAbsLateral * headroom, minLateralSpanM);
    const downrangeSpanM = Math.max(maxDownrange, 1);

    const innerW = width - padX * 2;
    const innerH = height - padY * 2;
    const cx = width / 2;

    const points = path.map((p) => ({
        x: cx + (p.lateralM / lateralSpanM) * (innerW / 2),
        // Downrange grows upward: larger z → smaller y in SVG space.
        y: height - padY - (p.downrangeM / downrangeSpanM) * innerH,
    }));

    return { points, lateralSpanM, downrangeM: maxDownrange };
}

/**
 * Project a profile's path into SVG coordinates for a side-on height
 * strip (downrange left→right, altitude up). Shows whether a disc gets
 * there on a flat laser or a high floaty hyzer — a real line-planning
 * difference the top-down view can't express.
 */
export function projectPathToHeightChart(path, opts = {}) {
    const {
        width = 200,
        height = 60,
        padX = 10,
        padY = 6,
        minApexM = 3,
    } = opts;

    if (!path || path.length === 0) return { points: [], apexM: minApexM, downrangeM: 0 };

    let maxDownrange = 0;
    let maxHeight = 0;
    for (const p of path) {
        if (p.downrangeM > maxDownrange) maxDownrange = p.downrangeM;
        if (p.heightM > maxHeight) maxHeight = p.heightM;
    }

    const apexM = Math.max(maxHeight, minApexM);
    const downrangeSpanM = Math.max(maxDownrange, 1);

    const innerW = width - padX * 2;
    const innerH = height - padY * 2;

    const points = path.map((p) => ({
        x: padX + (p.downrangeM / downrangeSpanM) * innerW,
        y: height - padY - (Math.max(0, p.heightM) / apexM) * innerH,
    }));

    return { points, apexM: maxHeight, downrangeM: maxDownrange };
}

/** SVG polyline `points` attribute from projected {x,y} pairs. */
export function toPolylinePoints(projected) {
    return projected.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
}
