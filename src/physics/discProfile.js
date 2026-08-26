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
 * ── TWO QUESTIONS, ONE FUNCTION ──────────────────────────────────────
 * Called bare, `computeDiscProfile(disc)` simulates `REFERENCE_THROW` —
 * flat, full power, no wind, flat ground — which makes the result a
 * PROPERTY OF THE DISC, comparable across discs. That is the reading
 * the stability label and most of the test suite are written against.
 *
 * Given `throwSettings`/`wind`, it instead simulates THIS THROW, which
 * is what lets the panel's chart redraw as the player drags a slider.
 * These are different claims and must never be presented as the same
 * one: the return value carries `isReferenceThrow` so a caller can say
 * which it is showing, and DiscProfilePanel does say so in words.
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
import { buildThrowSpec, buildWindSpec, DEFAULT_THROWER } from './throwerProfile.js';

const METERS_TO_FEET = 3.28084;

/**
 * The canonical conditions a flight chart implies: flat release, full
 * power, no wind, flat ground, right-hand backhand (the reference every
 * published flight number is quoted for).
 *
 * Used when no `throwSettings` are supplied — which is what makes a
 * bare `computeDiscProfile(disc)` still mean "this disc's inherent
 * character", the comparable-across-discs reading the stability label
 * and the test suite are written against.
 */
export const REFERENCE_THROW = Object.freeze({
    powerPct: 100,
    hyzerDeg: 0,
    noseAngleDeg: 0,
    hand: 'RH',
    style: 'BH',
});

/**
 * A UI throw (`{power, aimAngle, releaseAngle, noseAngle}`) → the
 * throw-spec fields `buildThrowSpec` wants.
 *
 * ── AIM ANGLE IS DELIBERATELY IGNORED ────────────────────────────────
 * Aim rotates the ENTIRE flight about the tee; it does not change the
 * flight's shape. The chart's vertical axis IS the aim line, so folding
 * aim in would rotate the curve against its own reference and read as
 * "this disc turns more when I aim right", which is false. The map
 * already shows the real aimed heading. Excluded on purpose, not
 * forgotten.
 */
function throwSpecFieldsFromUI(ui) {
    return {
        powerPct: ui.power,
        hyzerDeg: ui.releaseAngle,
        noseAngleDeg: ui.noseAngle,
        hand: REFERENCE_THROW.hand,
        style: REFERENCE_THROW.style,
    };
}

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
    // Colours are the soft-premium palette (tailwind.config.js), not the
    // retired neon set — this badge is UI chrome, unlike the map layers
    // that stay vivid for visibility over satellite imagery.
    if (s < -2) return { key: 'very-understable', label: 'Very Understable', color: '#4cb8ff', sum: s };
    if (s < -0.5) return { key: 'understable', label: 'Understable', color: '#7cc9ff', sum: s };
    if (s <= 1.5) return { key: 'stable', label: 'Stable', color: '#34d399', sum: s };
    if (s <= 3) return { key: 'overstable', label: 'Overstable', color: '#f5a65b', sum: s };
    return { key: 'very-overstable', label: 'Very Overstable', color: '#ff6b7a', sum: s };
}

/**
 * Simulate a disc's reference flight and reduce it to what a profile
 * panel needs.
 *
 * @param {{speed,glide,turn,fade}} disc
 * @param {Object} [options] - {
 *        throwSettings: UI `{power, aimAngle, releaseAngle, noseAngle}`
 *          — omit for the canonical REFERENCE_THROW;
 *        wind: UI `{speed, direction}` where direction is the
 *          METEOROLOGICAL bearing the wind blows FROM — omit for calm;
 *        throwBearingDeg: compass bearing the throw is aimed along,
 *          used to rotate that wind into the chart's frame. The chart's
 *          vertical axis IS the aim line, so without this the chart and
 *          the map would simulate the SAME wind from different
 *          directions — a disagreement a player would see as the chart
 *          lying about the flight it just drew;
 *        thrower, mapping, simOptions — overrides for Section 6
 *          (per-user thrower profiles) and for tests.
 *      }
 * @returns {{
 *   path: {lateralM, downrangeM, heightM}[],
 *   distanceM, distanceFt, apexM, apexFt,
 *   lateralFinishM, lateralFinishFt,
 *   maxRightM, maxRightFt, maxLeftM, maxLeftFt,
 *   flightTimeS,
 *   stability: {key, label, color, sum},
 *   reference: typeof REFERENCE_THROW,
 *   isReferenceThrow: boolean,
 * }}
 *
 * Lateral sign follows the engine's output frame: POSITIVE = right of
 * the tee line, NEGATIVE = left. For the RH backhand reference throw
 * that means a turn reads positive and a fade reads negative, so an
 * overstable disc finishes with `lateralFinishM < 0`.
 *
 * `isReferenceThrow` tells a caller whether what it got back is the
 * disc's inherent character (comparable across discs) or this player's
 * current settings — the two must never be presented as the same claim.
 */
export function computeDiscProfile(disc, options = {}) {
    if (!disc || !Number.isFinite(disc.speed)) {
        throw new Error('computeDiscProfile: disc must carry numeric flight numbers');
    }

    const mapping = options.mapping ?? ACTIVE_MAPPING;
    const thrower = options.thrower ?? DEFAULT_THROWER;
    const coefficients = discToCoefficients(disc, mapping);

    const usingReference = !options.throwSettings;
    const specFields = usingReference
        ? REFERENCE_THROW
        : throwSpecFieldsFromUI(options.throwSettings);
    const throwSpec = buildThrowSpec(thrower, disc, {
        ...specFields,
        launchAngleDeg: launchAngleDeg(mapping),
    });

    // Wind must go through buildWindSpec: the engine reads
    // `speedMps`/`directionDeg`, and handing it the UI's
    // `{speed, direction}` silently simulates dead calm (the exact bug
    // this codebase shipped in flightEngine.js — see that conversion's
    // comment). No terrain callback: flat ground, so the chart stays a
    // statement about the disc and the throw rather than about one
    // particular hole's slope.
    // The aim slider is added in for the same reason MapCanvas adds it
    // to its own bearing: the flight is aimed along
    // (hole bearing + aim), so that is the axis the wind must be
    // measured against. Aim still does not reshape the flight itself —
    // see throwSpecFieldsFromUI.
    const aimDeg = options.throwSettings?.aimAngle ?? 0;
    const windBearing = (options.throwBearingDeg ?? 0) + aimDeg;
    const wind = options.wind ? buildWindSpec(options.wind, windBearing) : {};
    const noWind = !(wind.speedMps > 0);

    const result = simulateFlight(disc, throwSpec, wind, null, {
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
        isReferenceThrow: usingReference && noWind,
    };
}

/**
 * Chart geometry, shared by DiscProfilePanel and its tests so the tests
 * guard the dimensions actually shipped rather than a copy that can
 * drift.
 *
 * `w` matches the panel's real inner column width (320px panel − 2×16px
 * padding). That matters: the SVGs render at `width:100%`, so a viewBox
 * narrower than the column gets scaled UP and the chart grows taller in
 * proportion. A 212-wide viewBox in a 288px column was being magnified
 * ~36%, which pushed the throw-settings sliders below the fold — the
 * one thing this panel must not do, since the chart exists to be read
 * WHILE those sliders are adjusted. Keeping w == the column width means
 * the rendered height is exactly `h`, no arithmetic required.
 */
export const CHART_DIMS = Object.freeze({
    w: 288,
    h: 150,          // top-down plot area
    captionH: 16,    // caption strip below the plot
    heightW: 288,
    heightH: 40,     // side-on altitude strip (scrolls; not in the pinned region)
});

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
        // ── THE CAP ON HORIZONTAL EXAGGERATION ───────────────────────
        // Fitting a 60 m drive into 130 px of height while its 11 m of
        // lateral movement fills 268 px of width stretches the lateral axis by
        // over 5×, and the honest arc a disc really flies gets drawn as a
        // hairpin — a shape no disc has ever made. Players read the
        // PICTURE, not the caption, so an uncapped stretch makes the
        // chart lie about the one thing it exists to show.
        //
        // Some stretch is unavoidable and every published flight chart
        // uses it: at true scale that same flight is a nearly straight
        // vertical line. 2.5× keeps the curve legible while keeping its
        // shape recognisably the shape the disc flies. Returned as
        // `stretchX` so the caller can state it.
        maxStretch = 2.5,
    } = opts;

    if (!path || path.length === 0) {
        return { points: [], lateralSpanM: minLateralSpanM, downrangeM: 0, stretchX: 1 };
    }

    let maxAbsLateral = 0;
    let maxDownrange = 0;
    for (const p of path) {
        const a = Math.abs(p.lateralM);
        if (a > maxAbsLateral) maxAbsLateral = a;
        if (p.downrangeM > maxDownrange) maxDownrange = p.downrangeM;
    }

    const downrangeSpanM = Math.max(maxDownrange, 1);

    const innerW = width - padX * 2;
    const innerH = height - padY * 2;
    const cx = width / 2;

    // Widening the axis is what REDUCES the stretch: the same lateral
    // metres then occupy fewer pixels. Solving
    //   (innerW/2)/lateralSpan ≤ maxStretch · innerH/downrangeSpan
    // for lateralSpan gives the floor below.
    const spanForMaxStretch = maxStretch > 0
        ? (innerW / 2) * downrangeSpanM / (maxStretch * innerH)
        : 0;

    const lateralSpanM = Math.max(
        maxAbsLateral * headroom,
        minLateralSpanM,
        spanForMaxStretch,
    );

    // What the drawing actually came out at — never above maxStretch, and
    // below it whenever the flight is wide enough to need the room.
    const stretchX = ((innerW / 2) / lateralSpanM) / (innerH / downrangeSpanM);

    const points = path.map((p) => ({
        x: cx + (p.lateralM / lateralSpanM) * (innerW / 2),
        // Downrange grows upward: larger z → smaller y in SVG space.
        y: height - padY - (p.downrangeM / downrangeSpanM) * innerH,
    }));

    return { points, lateralSpanM, downrangeM: maxDownrange, stretchX };
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
