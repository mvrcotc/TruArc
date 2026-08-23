#!/usr/bin/env node
/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  TruArc — Flight Coefficient Calibration (Section 1, step 3)    ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Fits the flight-number → coefficient mapping in
 * src/physics/discCoefficients.js against the ground-truth suite, and
 * writes the result to src/physics/calibratedMapping.json.
 *
 *   node tools/calibrate.mjs                 # default budget
 *   node tools/calibrate.mjs --iters 6000 --restarts 6
 *   node tools/calibrate.mjs --dry           # score current mapping only
 *
 * WHY THIS EXISTS: the previous engine was tuned by hand, one constant
 * at a time, against whichever throw looked wrong that day — which is
 * why fixing turn broke fade and fixing fade broke distance. Tuning by
 * optimisation against all 35 cases at once makes that impossible: the
 * objective cannot improve by trading one case for another unless the
 * net is better, and the score is a single number you can watch.
 *
 * Method: Nelder-Mead simplex (derivative-free — the objective has
 * plateaus from the pass/fail shape checks, so gradient methods are
 * inappropriate) in a normalised [0,1] parameter space with multi-start
 * from deterministic perturbations of the physical priors.
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ENVELOPES as SYNTHESIZED, COMPARATIVES as SYNTH_COMPARATIVES } from '../tests/ground-truth/flight-envelopes.mjs';
import { loadFieldEnvelopes, mergeFieldEnvelopes, remapComparatives } from '../tests/ground-truth/field-data.mjs';
import { runEnvelope } from '../tests/ground-truth/adapters/sixDof.mjs';
import { extractMetrics, checkShape, checkInvariants } from '../tests/ground-truth/metrics.mjs';
import { PRIOR_MAPPING, CALIBRATION_BOUNDS, ACTIVE_MAPPING } from '../src/physics/discCoefficients.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, '..', 'src', 'physics', 'calibratedMapping.json');

// Fitting against measured throws where they exist. A row that displaces
// a synthesized target changes what is being optimised, so the swap is
// printed rather than applied silently.
const FIELD = loadFieldEnvelopes(join(__dirname, '..', 'tests', 'ground-truth', 'field-data'));
const { envelopes: ENVELOPES, replaced: FIELD_REPLACED, idMap: FIELD_ID_MAP } = mergeFieldEnvelopes(SYNTHESIZED, FIELD);
// Comparatives reference envelopes by id; a superseded id must follow.
const COMPARATIVES = remapComparatives(SYNTH_COMPARATIVES, FIELD_ID_MAP);

// ─── CLI ─────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flag = (name, fallback) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 && args[i + 1] ? Number(args[i + 1]) : fallback;
};
const ITERS = flag('iters', 3000);
const RESTARTS = flag('restarts', 4);
// The integrator is timestep-converged: tests/physics-invariants.test.mjs
// asserts that 0.001–0.008 s agree to under a foot, which is why the
// axisymmetric formulation was chosen over quaternions. Calibrating at
// the coarse end is therefore free speed, not an approximation.
const CALIB_DT = 0.008;
const VERIFY_DT = 0.002;
const DRY = args.includes('--dry');

const PARAMS = Object.keys(CALIBRATION_BOUNDS);

// ─── OBJECTIVE ───────────────────────────────────────────────────

/**
 * ── DERIVED-QUANTITY CONSTRAINTS ─────────────────────────────────
 *
 * CALIBRATION_BOUNDS is a box: it constrains each parameter alone. Some
 * unphysical mappings are reachable with every individual parameter
 * comfortably in range, because it is a COMBINATION that is impossible.
 *
 * The one that actually bit: zero-α lift for a fast disc is
 * `CL0_base + speed·CL0_perSpeed`, and the 2026-08-08 fit reached
 * 0.1445 and −0.00828 — both in-bounds, jointly giving CL0 ≈ 0.029 at
 * speed 14. A driver that makes no lift at zero α flies at a high angle
 * of attack for its whole flight, which sits it above trim, which makes
 * it fade hard AND drag short. That single degeneracy produced both
 * headline symptoms in the residuals (distances 25–40 % short, every
 * stable disc finishing far left), and it collapsed the disc ladder:
 * a Firebird and a Roc landed 3 ft apart in src/bag/coverage.js.
 *
 * Tightening the CL0_perSpeed box alone does NOT close this — CL0_base
 * can fall to meet it (its floor of 0.05 with a −0.006 slope makes lift
 * NEGATIVE at speed 12, which is worse). The constraint has to be on
 * the derived value, so it is expressed here rather than as a bound.
 *
 * The floor is deliberately conservative. Hummel & Hubbard measured
 * CL0 ≈ 0.15–0.2 for a standard Frisbee; a golf driver is far flatter
 * and sleeker, so a much lower value is legitimate — but it cannot
 * approach zero, or the disc could not carry the distances these discs
 * demonstrably carry.
 */
const MAX_DISC_SPEED = 14;
const MIN_CL0_AT_MAX_SPEED = 0.06;
const PHYSICS_PENALTY_WEIGHT = 40;

function physicsPenalty(mapping) {
    const cl0Fast = mapping.CL0_base + MAX_DISC_SPEED * mapping.CL0_perSpeed;
    if (cl0Fast >= MIN_CL0_AT_MAX_SPEED) return 0;
    const shortfall = (MIN_CL0_AT_MAX_SPEED - cl0Fast) / MIN_CL0_AT_MAX_SPEED;
    return Math.min(200, shortfall ** 2 * PHYSICS_PENALTY_WEIGHT);
}

/** Squared, range-width-normalised miss distance; 0 inside the range. */
function rangePenalty(value, [lo, hi]) {
    if (!Number.isFinite(value)) return 25;
    const w = Math.max(1e-6, hi - lo);
    if (value < lo) return Math.min(25, ((lo - value) / w) ** 2);
    if (value > hi) return Math.min(25, ((value - hi) / w) ** 2);
    return 0;
}

function evaluate(mapping, dt = CALIB_DT) {
    const cache = new Map();
    const runCached = (env) => {
        if (env.id && cache.has(env.id)) return cache.get(env.id);
        const result = runEnvelope(env, { mapping, dt });
        const rec = { result, metrics: extractMetrics(result) };
        if (env.id) cache.set(env.id, rec);
        return rec;
    };

    // Charged before any case runs: an unphysical mapping should be
    // unattractive even where it happens to score well.
    let score = physicsPenalty(mapping);
    let envelopesPassing = 0;
    const failures = [];

    for (const env of ENVELOPES) {
        let rec;
        try {
            rec = runCached(env);
        } catch {
            score += 100;
            failures.push({ id: env.id, why: 'threw' });
            continue;
        }
        const { result, metrics } = rec;
        let envScore = 0;
        const why = [];

        for (const [key, range] of Object.entries(env.expect)) {
            if (key === 'shape') continue;
            const p = rangePenalty(metrics[key], range);
            envScore += p;
            if (p > 0) why.push(`${key}=${metrics[key].toFixed(1)}∉[${range[0]},${range[1]}]`);
        }

        // Measured rows assert no shape — nothing to check, and not a
        // free pass for a synthesized envelope missing one.
        if (env.expect.shape) {
            const shape = checkShape(env.expect.shape, result.points, result.landingIndex, metrics);
            if (!shape.pass) { envScore += 2; why.push(`shape:${env.expect.shape}`); }
        }

        const inv = checkInvariants(result.points, result.landingIndex, result.flightTimeS);
        if (!inv.pass) { envScore += 3; why.push(`inv:${inv.problems[0]}`); }

        score += envScore;
        if (envScore === 0) envelopesPassing++;
        else failures.push({ id: env.id, why: why.join(' ') });
    }

    let comparativesPassing = 0;
    for (const c of COMPARATIVES) {
        const side = (s) => {
            if (typeof s === 'string') {
                const env = ENVELOPES.find((e) => e.id === s);
                return runCached(env).metrics;
            }
            return extractMetrics(runEnvelope({ ...s }, { mapping, dt }));
        };
        let delta;
        try {
            delta = side(c.a)[c.metric] - side(c.b)[c.metric];
        } catch {
            score += 100;
            failures.push({ id: c.id, why: 'threw' });
            continue;
        }
        if (delta >= c.minDeltaFt) {
            comparativesPassing++;
        } else {
            const scale = Math.max(10, Math.abs(c.minDeltaFt));
            score += Math.min(25, ((c.minDeltaFt - delta) / scale) ** 2) + 1.5;
            failures.push({ id: c.id, why: `${c.metric} Δ=${delta.toFixed(1)} < ${c.minDeltaFt}` });
        }
    }

    return {
        score,
        // Reported separately so a run's score stays comparable to runs
        // made before this penalty existed — the fit-quality half of the
        // number is `score - physics`.
        physics: physicsPenalty(mapping),
        envelopesPassing,
        comparativesPassing,
        passing: envelopesPassing + comparativesPassing,
        total: ENVELOPES.length + COMPARATIVES.length,
        failures,
    };
}

// ─── NORMALISED PARAMETER SPACE ──────────────────────────────────
// Nelder-Mead assumes comparable scales; our params span 1e-4 to 30, so
// everything is optimised in [0,1] and decoded through the bounds.

const encode = (mapping) => PARAMS.map((k) => {
    const [lo, hi] = CALIBRATION_BOUNDS[k];
    return (mapping[k] - lo) / (hi - lo);
});

const decode = (x) => {
    const m = { ...PRIOR_MAPPING };
    PARAMS.forEach((k, i) => {
        const [lo, hi] = CALIBRATION_BOUNDS[k];
        m[k] = lo + Math.min(1, Math.max(0, x[i])) * (hi - lo);
    });
    return m;
};

// ─── NELDER-MEAD ─────────────────────────────────────────────────

function nelderMead(f, x0, { iters = 3000, step = 0.12 } = {}) {
    const n = x0.length;
    const simplex = [x0.slice()];
    for (let i = 0; i < n; i++) {
        const p = x0.slice();
        p[i] = Math.min(1, Math.max(0, p[i] + step));
        simplex.push(p);
    }
    let values = simplex.map(f);

    const order = () => {
        const idx = values.map((v, i) => i).sort((a, b) => values[a] - values[b]);
        return { pts: idx.map((i) => simplex[i]), vals: idx.map((i) => values[i]) };
    };

    for (let it = 0; it < iters; it++) {
        const { pts, vals } = order();
        for (let i = 0; i <= n; i++) { simplex[i] = pts[i]; values[i] = vals[i]; }
        if (values[n] - values[0] < 1e-9) break;

        const centroid = new Array(n).fill(0);
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) centroid[j] += simplex[i][j] / n;

        const project = (v) => v.map((q) => Math.min(1, Math.max(0, q)));
        const combine = (a, b, k) => project(a.map((q, j) => q + k * (q - b[j])));

        const reflected = combine(centroid, simplex[n], 1);
        const fr = f(reflected);

        if (fr < values[0]) {
            const expanded = combine(centroid, simplex[n], 2);
            const fe = f(expanded);
            if (fe < fr) { simplex[n] = expanded; values[n] = fe; }
            else { simplex[n] = reflected; values[n] = fr; }
        } else if (fr < values[n - 1]) {
            simplex[n] = reflected; values[n] = fr;
        } else {
            const contracted = combine(centroid, simplex[n], -0.5);
            const fc = f(contracted);
            if (fc < values[n]) { simplex[n] = contracted; values[n] = fc; }
            else {
                for (let i = 1; i <= n; i++) {
                    simplex[i] = project(simplex[i].map((q, j) => simplex[0][j] + 0.5 * (q - simplex[0][j])));
                    values[i] = f(simplex[i]);
                }
            }
        }
    }

    const { pts, vals } = order();
    return { x: pts[0], value: vals[0] };
}

// ─── DETERMINISTIC RNG (reproducible restarts) ───────────────────
function mulberry32(seed) {
    return () => {
        seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// ─── MAIN ────────────────────────────────────────────────────────

function report(label, r) {
    console.log(
        `${label}  score=${r.score.toFixed(2)} (fit ${(r.score - r.physics).toFixed(2)} `
        + `+ physics ${r.physics.toFixed(2)})  passing=${r.passing}/${r.total} `
        + `(envelopes ${r.envelopesPassing}/${ENVELOPES.length}, comparatives ${r.comparativesPassing}/${COMPARATIVES.length})`,
    );
}

// Printed before the DRY exit too: whether measured throws are in play
// changes what any score below actually means.
function reportFieldData() {
    if (FIELD.length) {
        console.log(`${FIELD.length} measured throw(s) included; ${FIELD_REPLACED.length} synthesized target(s) superseded`);
        for (const r of FIELD_REPLACED) console.log(`    ${r.id} → ${r.by}`);
    } else {
        console.log('no field data — every target is domain judgement (see tests/ground-truth/field-data/README.md)');
    }
}

if (DRY) {
    reportFieldData();
    report('current mapping:', evaluate(ACTIVE_MAPPING, VERIFY_DT));
    process.exit(0);
}

console.log(`Calibrating ${PARAMS.length} parameters against ${ENVELOPES.length + COMPARATIVES.length} ground-truth cases`);
reportFieldData();
report('prior      ', evaluate(PRIOR_MAPPING, VERIFY_DT));

const objective = (x) => evaluate(decode(x)).score;
const rand = mulberry32(20260808);

let best = null;
for (let r = 0; r < RESTARTS; r++) {
    const start = r === 0
        ? encode(PRIOR_MAPPING)
        : encode(PRIOR_MAPPING).map((v) => Math.min(1, Math.max(0, v + (rand() - 0.5) * 0.5)));

    const t0 = Date.now();
    const res = nelderMead(objective, start, { iters: ITERS, step: r === 0 ? 0.10 : 0.18 });
    const full = evaluate(decode(res.x), VERIFY_DT);
    console.log(`  restart ${r}: score=${res.value.toFixed(2)} → verified ${full.score.toFixed(2)} `
        + `passing=${full.passing}/${full.total}  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);

    if (!best || full.score < best.full.score) best = { x: res.x, full };
}

const mapping = decode(best.x);
const final = evaluate(mapping, VERIFY_DT);
console.log('');
report('BEST       ', final);
console.log('\nRemaining failures:');
for (const f of final.failures) console.log(`  ${f.id.padEnd(32)} ${f.why}`);

writeFileSync(OUT_PATH, `${JSON.stringify({
    _comment: 'GENERATED by tools/calibrate.mjs — do not hand-edit. Re-run the calibration instead.',
    fittedAt: new Date().toISOString(),
    score: Number(final.score.toFixed(4)),
    passing: `${final.passing}/${final.total}`,
    envelopesPassing: `${final.envelopesPassing}/${ENVELOPES.length}`,
    comparativesPassing: `${final.comparativesPassing}/${COMPARATIVES.length}`,
    mapping,
}, null, 2)}\n`);

console.log(`\nWrote ${OUT_PATH}`);
