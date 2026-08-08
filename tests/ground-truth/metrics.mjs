/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  TruArc — Ground-Truth Metric Extraction & Shape Classifiers    ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Pure functions that turn a raw simulator trajectory ({x,y,z} points in
 * local meter-space, +Z forward along the aim line, +X = RIGHT of the
 * aim line — see flight-envelopes.mjs conventions) into the metrics and
 * shape-signature checks that flight-envelopes.mjs specifies. Engine-
 * agnostic: works against anything shaped like a
 * `{ points: {x,y,z}[], landingIndex: number, maxHeight: number }`
 * result, so the same file verifies both the current engine and the
 * Section 1 replacement.
 */

const M_TO_FT = 3.28084;

// ─── METRIC EXTRACTION ────────────────────────────────────────────

export function extractMetrics(result) {
    const { points, landingIndex, maxHeight } = result;
    const landing = points[landingIndex];

    const distanceFt = Math.sqrt(landing.x ** 2 + landing.z ** 2) * M_TO_FT;
    const finishLateralFt = landing.x * M_TO_FT;
    const apexFt = maxHeight * M_TO_FT;

    let maxRightExcursionM = 0;
    for (let i = 0; i <= landingIndex; i++) {
        if (points[i].x > maxRightExcursionM) maxRightExcursionM = points[i].x;
    }

    return {
        distanceFt,
        finishLateralFt,
        apexFt,
        maxRightExcursionFt: maxRightExcursionM * M_TO_FT,
    };
}

// ─── HELPERS ────────────────────────────────────────────────────────

/** Linear-interpolated lateral position (ft) at time-fraction s ∈ [0,1] of the flight. */
function xAtFraction(points, landingIndex, s) {
    const idx = Math.max(0, Math.min(landingIndex, s * landingIndex));
    const i0 = Math.floor(idx);
    const i1 = Math.min(landingIndex, i0 + 1);
    const frac = idx - i0;
    const p0 = points[i0];
    const p1 = points[i1];
    return (p0.x + (p1.x - p0.x) * frac) * M_TO_FT;
}

function maxAbsXBefore(points, landingIndex, sLimit) {
    let m = 0;
    for (let i = 0; i <= landingIndex; i++) {
        const s = i / landingIndex;
        if (s >= sLimit) break;
        m = Math.max(m, Math.abs(points[i].x * M_TO_FT));
    }
    return m;
}

/** Point of maximum rightward excursion, optionally restricted to s < sLimit. */
function maxExcursion(points, landingIndex, sLimit = 1) {
    let maxXm = -Infinity;
    let maxIdx = 0;
    for (let i = 0; i <= landingIndex; i++) {
        const s = i / landingIndex;
        if (s >= sLimit) break;
        if (points[i].x > maxXm) {
            maxXm = points[i].x;
            maxIdx = i;
        }
    }
    return { xFt: maxXm * M_TO_FT, s: maxIdx / landingIndex };
}

// ─── SHAPE SIGNATURE CHECKS ──────────────────────────────────────
// Each returns { pass, detail } per the precise definitions in
// flight-envelopes.mjs's "SHAPE SIGNATURES" doc comment.

function checkStraight(points, landingIndex) {
    const m = maxAbsXBefore(points, landingIndex, 0.85);
    return { pass: m < 20, detail: `max|x| for s<0.85 = ${m.toFixed(1)} ft (need < 20)` };
}

function checkSCurve(points, landingIndex, metrics) {
    const { xFt, s } = maxExcursion(points, landingIndex);
    const inWindow = s >= 0.25 && s <= 0.75;
    const bigEnough = xFt >= 8;
    const finishesLeft = metrics.finishLateralFt <= xFt - 15;
    return {
        pass: inWindow && bigEnough && finishesLeft,
        detail: `maxRightExcursion=${xFt.toFixed(1)}ft @s=${s.toFixed(2)} (need ≥8ft in [0.25,0.75]); `
            + `finish=${metrics.finishLateralFt.toFixed(1)}ft (need ≤${(xFt - 15).toFixed(1)}ft)`,
    };
}

function checkHyzerOut(points, landingIndex) {
    let maxXft = -Infinity;
    for (let i = 0; i <= landingIndex; i++) maxXft = Math.max(maxXft, points[i].x * M_TO_FT);
    const neverRight = maxXft <= 5;

    let monotonic = true;
    let worstUptick = 0;
    let prev = null;
    for (let i = 0; i <= landingIndex; i++) {
        const s = i / landingIndex;
        if (s <= 0.3) continue;
        const xFt = points[i].x * M_TO_FT;
        if (prev !== null && xFt > prev + 3) {
            monotonic = false;
            worstUptick = Math.max(worstUptick, xFt - prev);
        }
        prev = xFt;
    }
    return {
        pass: neverRight && monotonic,
        detail: `maxX=${maxXft.toFixed(1)}ft (need ≤5); monotonic-left after s=0.3: ${monotonic}`
            + (monotonic ? '' : ` (worst uptick ${worstUptick.toFixed(1)}ft)`),
    };
}

function checkTurnover(points, landingIndex, metrics) {
    const x40 = xAtFraction(points, landingIndex, 0.4);
    const x80 = xAtFraction(points, landingIndex, 0.8);
    const finishOk = metrics.finishLateralFt >= -5;
    const noHardReturn = x80 >= x40 - 5;
    return {
        pass: finishOk && noHardReturn,
        detail: `finish=${metrics.finishLateralFt.toFixed(1)}ft (need ≥-5); `
            + `x@0.4=${x40.toFixed(1)}ft x@0.8=${x80.toFixed(1)}ft (need x@0.8 ≥ x@0.4−5)`,
    };
}

function checkFadeOut(points, landingIndex, metrics) {
    const { xFt: maxX } = maxExcursion(points, landingIndex);
    const x0 = xAtFraction(points, landingIndex, 0);
    const x13 = xAtFraction(points, landingIndex, 1 / 3);
    const x23 = xAtFraction(points, landingIndex, 2 / 3);
    const xEnd = metrics.finishLateralFt;

    const rate1 = -(x13 - x0) / (1 / 3);
    const rate2 = -(x23 - x13) / (1 / 3);
    const rate3 = -(xEnd - x23) / (1 / 3);
    const avgRate12 = (rate1 + rate2) / 2;

    const excursionOk = maxX < 8;
    const rateOk = rate3 > avgRate12;
    return {
        pass: excursionOk && rateOk,
        detail: `maxRightExcursion=${maxX.toFixed(1)}ft (need <8); finalThirdRate=${rate3.toFixed(2)} `
            + `vs avgFirstTwoThirds=${avgRate12.toFixed(2)} ft/(s-fraction) (need final > avg)`,
    };
}

function checkFlex(points, landingIndex, metrics) {
    const { xFt: maxX, s: maxS } = maxExcursion(points, landingIndex, 0.6);
    const bigEnough = maxX >= 10;
    const finishesLeft = metrics.finishLateralFt <= maxX - 20;
    return {
        pass: bigEnough && finishesLeft,
        detail: `maxRightExcursion(s<0.6)=${maxX.toFixed(1)}ft @s=${maxS.toFixed(2)} (need ≥10); `
            + `finish=${metrics.finishLateralFt.toFixed(1)}ft (need ≤${(maxX - 20).toFixed(1)}ft)`,
    };
}

const SHAPE_CHECKS = {
    straight: checkStraight,
    sCurve: checkSCurve,
    hyzerOut: checkHyzerOut,
    turnover: checkTurnover,
    fadeOut: checkFadeOut,
    flex: checkFlex,
};

export function checkShape(shape, points, landingIndex, metrics) {
    const fn = SHAPE_CHECKS[shape];
    if (!fn) throw new Error(`Unknown shape signature: ${shape}`);
    return fn(points, landingIndex, metrics);
}

// ─── UNIVERSAL INVARIANTS ────────────────────────────────────────
// See flight-envelopes.mjs doc comment. Flight-time is approximated
// from the current engine's fixed dt/sampling constants (dt=0.01s,
// sampled every 3rd step) since raw points carry no timestamp; this
// approximation is specific to the current-engine adapter's output
// shape and should be revisited if the Section 1 engine returns
// per-point timestamps instead.
const APPROX_DT = 0.01;
const APPROX_SAMPLE_EVERY = 3;

export function checkInvariants(points, landingIndex) {
    const problems = [];

    for (let i = 0; i <= landingIndex; i++) {
        const p = points[i];
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) {
            problems.push(`non-finite coordinate at index ${i}`);
            break;
        }
    }

    const timeApproxS = landingIndex * APPROX_DT * APPROX_SAMPLE_EVERY;
    if (!(timeApproxS >= 2 && timeApproxS <= 14)) {
        problems.push(`flight time ≈${timeApproxS.toFixed(1)}s outside [2, 14]s`);
    }

    let maxY = -Infinity;
    let maxIdx = 0;
    for (let i = 0; i <= landingIndex; i++) {
        if (points[i].y > maxY) { maxY = points[i].y; maxIdx = i; }
    }
    if (maxIdx === 0) problems.push('apex occurs at release point (disc never climbs)');

    for (let i = 0; i < landingIndex; i++) {
        if (points[i].y < -0.01) {
            problems.push(`negative height mid-flight at index ${i}: ${points[i].y.toFixed(2)}m`);
            break;
        }
    }

    function sampleSpeed(i) {
        if (i <= 0) return null;
        const a = points[i - 1];
        const b = points[i];
        return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    }
    const i20 = Math.max(1, Math.floor(landingIndex * 0.2));
    const i90 = Math.max(i20 + 1, Math.floor(landingIndex * 0.9));
    const s20 = sampleSpeed(i20);
    const s90 = sampleSpeed(i90);
    if (s20 != null && s90 != null && s90 > s20 * 1.15) {
        problems.push(
            `possible energy gain (Anti-Gravity Rocket regression): per-sample speed at s≈0.9 `
            + `(${s90.toFixed(2)}) exceeds s≈0.2 (${s20.toFixed(2)}) by >15%`
        );
    }

    return { pass: problems.length === 0, problems };
}
