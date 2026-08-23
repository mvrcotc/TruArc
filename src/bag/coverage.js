/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  TruArc — Bag Coverage & Gap Analysis                            ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Answers "what can this bag actually do, and what can't it?" by
 * simulating every disc across a grid of release angles and powers and
 * looking at where the landings fall.
 *
 * ── WHY A MAP AND NOT A LADDER ───────────────────────────────────────
 * The usual version of this feature is a one-dimensional distance
 * ladder — "you throw 250, 300, 350, buy a 275". That is close to
 * useless, because two discs that fly the same distance can finish in
 * completely different places, and a bag with five 350 ft drivers is not
 * five discs in one slot: they cover five different SHAPES.
 *
 * So coverage is two-dimensional — distance × lateral finish — and a
 * disc is not a point in that space but a REGION, because the same disc
 * thrown on hyzer, flat and anhyzer at full and controlled power covers
 * a swath. Gaps are the holes between those swaths.
 *
 * ── WHY THIS IS THE RIGHT JOB FOR THIS ENGINE ────────────────────────
 * The 6-DOF engine currently passes 10/12 of its comparative ground
 * truths (is A longer / more overstable than B?) and only 3/23 of its
 * absolute ones (how far exactly?). See docs/ACCURACY_ROADMAP.md.
 *
 * A coverage map needs the first kind of accuracy and not the second.
 * If every disc reads 30 % short, the map is TRANSLATED but not
 * distorted — the gaps stay in the right places relative to each other,
 * which is what a bag decision turns on. `distanceScale` below is the
 * hook for fixing the translation once the player anchors the axis with
 * a distance they actually know.
 *
 * Consequence, and it must reach the UI: until that anchor exists the
 * absolute numbers here are NOT trustworthy and must not be presented as
 * measurements. The shape of the map is the product; the axis labels are
 * provisional.
 *
 * ── THE THRESHOLDS ARE JUDGEMENT, NOT MEASUREMENT ────────────────────
 * MIN_GAP_FT, REDUNDANT_WITHIN_FT and the dispersion radii below are
 * reasoned estimates, not fitted values — there is no field data in this
 * repo yet (tests/ground-truth/field-data/ is still empty). They are
 * collected here as named constants precisely so they are easy to find
 * and replace when real throws exist, rather than scattered as literals.
 */

import { simulateFlight } from '../physics/sixDof.js';
import { discToCoefficients, launchAngleDeg } from '../physics/discCoefficients.js';
import { buildThrowSpec, DEFAULT_THROWER } from '../physics/throwerProfile.js';

const M_TO_FT = 3.28084;

/**
 * The shot grid: five release angles × two powers per disc.
 *
 * Five angles rather than three because the interesting question at the
 * edges is whether a disc can be *forced* into a shape (a Firebird on a
 * big anhyzer still finishes left; a Leopard does not), and three points
 * miss that. Two powers because most real gaps live at controlled power
 * — full-power coverage is usually dense and controlled coverage is
 * where people discover they own nothing throwable.
 */
export const DEFAULT_SHOT_GRID = Object.freeze({
    hyzerDeg: Object.freeze([-20, -10, 0, 10, 20]),
    powerPct: Object.freeze([100, 75]),
});

/**
 * Shape bands, defined on lateral÷distance rather than raw feet so the
 * label means the same thing at 200 ft and at 400 ft. 30 ft right at
 * 200 ft is a genuine turnover; at 400 ft it is essentially straight.
 */
export const SHAPE_BANDS = Object.freeze([
    { id: 'hardLeft', label: 'Hard hyzer', min: -Infinity, max: -0.20 },
    { id: 'left', label: 'Fade left', min: -0.20, max: -0.07 },
    { id: 'straight', label: 'Straight', min: -0.07, max: 0.07 },
    { id: 'right', label: 'Turn right', min: 0.07, max: 0.20 },
    { id: 'hardRight', label: 'Big turnover', min: 0.20, max: Infinity },
]);

export const SHAPE_ORDER = Object.freeze(SHAPE_BANDS.map((b) => b.id));

/**
 * Smallest interior distance hole worth calling a gap. Below roughly
 * this, the player throttles a disc they already own and never notices
 * the seam; above it they are either over-throwing one disc or leaving
 * the shot on the table.
 */
export const MIN_GAP_FT = 45;

/**
 * Two shots within this FRACTION of the bag's longest throw are doing
 * the same job.
 *
 * Relative rather than a fixed number of feet for two reasons. The
 * honest one: "same job" genuinely scales with how far you throw — 25 ft
 * of separation is a different disc to a 200 ft player and a rounding
 * error to a 450 ft player. The practical one: the distance axis is
 * currently compressed by an uncalibrated model and will stretch when
 * the player anchors it, and a fixed threshold would silently change
 * meaning the moment that happens.
 */
export const REDUNDANT_WITHIN_FRACTION = 0.075;

/** Fraction of a disc's shots that must be duplicated to call it redundant. */
export const REDUNDANT_SHOT_FRACTION = 0.75;

/**
 * Resolve a landing to its shape band.
 * @param {number} distanceFt
 * @param {number} finishLateralFt right-positive, matching the engine's
 *        output frame and tests/ground-truth/metrics.mjs.
 */
export function shapeOf(distanceFt, finishLateralFt) {
    if (!(distanceFt > 0)) return SHAPE_BANDS[2];
    const ratio = finishLateralFt / distanceFt;
    return SHAPE_BANDS.find((b) => ratio >= b.min && ratio < b.max) ?? SHAPE_BANDS[2];
}

/**
 * One simulated throw, reduced to where it finished.
 *
 * Metric conventions are deliberately identical to
 * tests/ground-truth/metrics.mjs (`distanceFt` is radial, `lateralFt` is
 * the landing's x) so a coverage number and a ground-truth number can be
 * compared without a mental conversion.
 */
export function simulateShot(disc, shot, options = {}) {
    const {
        thrower = DEFAULT_THROWER,
        distanceScale = 1,
        wind = {},
        dt = 0.008,
    } = options;

    const spec = buildThrowSpec(thrower, disc, {
        powerPct: shot.powerPct,
        hyzerDeg: shot.hyzerDeg,
        noseAngleDeg: shot.noseAngleDeg ?? 0,
        launchAngleDeg: launchAngleDeg(),
        hand: shot.hand ?? 'RH',
        style: shot.style ?? 'BH',
    });

    const result = simulateFlight(disc, spec, wind, null, {
        dt,
        // Only the landing matters here; a dense polyline would be
        // thousands of points per disc thrown away immediately.
        sampleEvery: 20,
        coefficients: discToCoefficients(disc),
    });

    const land = result.points[result.landingIndex];
    const distanceFt = Math.hypot(land.x, land.z) * M_TO_FT * distanceScale;
    const lateralFt = land.x * M_TO_FT * distanceScale;

    return {
        hyzerDeg: shot.hyzerDeg,
        powerPct: shot.powerPct,
        distanceFt,
        lateralFt,
        apexFt: result.maxHeight * M_TO_FT * distanceScale,
        shape: shapeOf(distanceFt, lateralFt).id,
    };
}

/**
 * Every shot one disc can produce across the grid — its footprint in the
 * coverage space.
 */
export function discFootprint(disc, options = {}) {
    const grid = options.grid ?? DEFAULT_SHOT_GRID;
    const shots = [];

    for (const powerPct of grid.powerPct) {
        for (const hyzerDeg of grid.hyzerDeg) {
            try {
                shots.push(simulateShot(disc, { hyzerDeg, powerPct }, options));
            } catch (e) {
                // One unstable parameter combination must not blank the
                // whole bag chart. Skipping loses a grid point; throwing
                // loses the feature.
                if (options.onError) options.onError(disc, { hyzerDeg, powerPct }, e);
            }
        }
    }

    const distances = shots.map((s) => s.distanceFt);
    return {
        disc,
        key: discKey(disc),
        shots,
        maxDistanceFt: distances.length ? Math.max(...distances) : 0,
        minDistanceFt: distances.length ? Math.min(...distances) : 0,
    };
}

/** Stable identity for a disc across bag edits. */
export function discKey(disc) {
    return `${disc.brand ?? '?'}:${disc.name ?? '?'}`;
}

/**
 * Simulate the whole bag.
 *
 * @returns {{footprints, shots, maxDistanceFt, thrower, calibrated}}
 *          `calibrated` is false whenever the distance axis is still the
 *          model's own uncalibrated scale — the UI must say so.
 */
export function bagCoverage(bag = [], options = {}) {
    const footprints = bag.map((disc) => discFootprint(disc, options));
    const shots = footprints.flatMap((f) => f.shots.map((s) => ({ ...s, key: f.key })));

    return {
        footprints,
        shots,
        maxDistanceFt: footprints.reduce((m, f) => Math.max(m, f.maxDistanceFt), 0),
        thrower: options.thrower ?? DEFAULT_THROWER,
        calibrated: (options.distanceScale ?? 1) !== 1,
    };
}

/**
 * Interior holes in the coverage, per shape band.
 *
 * ── WHY ONLY INTERIOR ────────────────────────────────────────────────
 * "You have no straight shot at 500 ft" is not a gap, it is a distance
 * limit, and a recommender that treats it as a gap will cheerfully sell
 * someone a speed-14 driver they cannot throw. A gap is a seam BETWEEN
 * two things you can already do — you cover 215 and 300 straight and
 * nothing between — which is a shot you genuinely cannot make and could.
 *
 * The one exception is a shape band with no coverage at all inside your
 * distance range, reported as kind 'shape'. Owning nothing that turns
 * right is a real hole in a bag even though it has no interior seam.
 */
export function findGaps(coverage, options = {}) {
    const minGapFt = options.minGapFt ?? MIN_GAP_FT;
    const gaps = [];

    for (const band of SHAPE_BANDS) {
        const inBand = coverage.shots
            .filter((s) => s.shape === band.id)
            .sort((a, b) => a.distanceFt - b.distanceFt);

        if (inBand.length === 0) {
            // Only a real finding if the band is reachable at all — with
            // an empty bag every band is empty and none of it is news.
            if (coverage.maxDistanceFt > 0) {
                gaps.push({
                    kind: 'shape',
                    shape: band.id,
                    label: band.label,
                    note: 'nothing in the bag finishes this way at any distance',
                });
            }
            continue;
        }

        for (let i = 1; i < inBand.length; i++) {
            const from = inBand[i - 1].distanceFt;
            const to = inBand[i].distanceFt;
            if (to - from >= minGapFt) {
                gaps.push({
                    kind: 'distance',
                    shape: band.id,
                    label: band.label,
                    fromFt: from,
                    toFt: to,
                    midFt: (from + to) / 2,
                    widthFt: to - from,
                });
            }
        }
    }

    // Widest first — the seam you most often fall into.
    return gaps.sort((a, b) => (b.widthFt ?? 0) - (a.widthFt ?? 0));
}

/**
 * Discs whose footprints substantially duplicate another disc's.
 *
 * This is the half of the feature that earns the other half's trust.
 * Every retailer's bag tool concludes "buy more discs"; a tool willing
 * to say "these three are the same disc" is making a claim against its
 * own commercial interest, which is exactly why anyone believes the
 * recommendations that follow it.
 *
 * Asymmetric by construction: a versatile disc can cover a specialist's
 * whole footprint without the reverse being true, and it is the
 * SPECIALIST that is redundant. Reporting the pair symmetrically would
 * suggest dropping either one, which is wrong.
 */
export function findRedundancies(coverage, options = {}) {
    const within = options.withinFt
        ?? coverage.maxDistanceFt * (options.withinFraction ?? REDUNDANT_WITHIN_FRACTION);
    const fraction = options.shotFraction ?? REDUNDANT_SHOT_FRACTION;
    const out = [];

    for (const a of coverage.footprints) {
        if (!a.shots.length) continue;

        for (const b of coverage.footprints) {
            if (a.key === b.key || !b.shots.length) continue;

            const duplicated = a.shots.filter((sa) => b.shots.some(
                (sb) => Math.hypot(sa.distanceFt - sb.distanceFt, sa.lateralFt - sb.lateralFt) <= within,
            )).length;

            const covered = duplicated / a.shots.length;
            if (covered >= fraction) {
                out.push({
                    disc: a.disc,
                    key: a.key,
                    coveredBy: b.disc,
                    coveredByKey: b.key,
                    coveredFraction: covered,
                });
            }
        }
    }

    // Most-duplicated first, and only the strongest claim per disc —
    // listing a disc three times because three others overlap it reads
    // as three problems when it is one.
    const best = new Map();
    for (const r of out) {
        const prior = best.get(r.key);
        if (!prior || r.coveredFraction > prior.coveredFraction) best.set(r.key, r);
    }
    return [...best.values()].sort((x, y) => y.coveredFraction - x.coveredFraction);
}

/**
 * Everything the UI needs in one pass.
 */
export function analyzeBag(bag = [], options = {}) {
    const coverage = bagCoverage(bag, options);
    return {
        ...coverage,
        gaps: findGaps(coverage, options),
        redundancies: findRedundancies(coverage, options),
    };
}
