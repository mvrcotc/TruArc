/**
 * Tests for src/physics/discProfile.js — the "what does this disc do
 * naturally" reference-flight profile behind DiscProfilePanel.jsx.
 *
 * Two things here are load-bearing and easy to break silently:
 *
 *  1. THE LATERAL SIGN CONVENTION. The panel draws turn to the right of
 *     the tee line and fade to the left. That reading depends on the
 *     engine's output frame (+x = right) surviving unchanged through
 *     this module. If it ever flips, every flight chart in the app
 *     mirrors — an error a human would notice instantly but no existing
 *     suite covers, since the sign never mattered before there was a
 *     chart to draw. Asserted against discs whose real-world behaviour
 *     is not in dispute (a Firebird finishes LEFT for a RH backhand).
 *
 *  2. THE STABILITY BUCKETS. Thresholds on `turn + fade` are a judgment
 *     call, so they're pinned to the reference discs players calibrate
 *     their intuition against — a Buzzz must read "Stable", not
 *     "Understable". A threshold tweak that reclassifies those fails
 *     here rather than in a user's mental model.
 *
 * Distances are deliberately NOT asserted against real-world targets:
 * that is tests/ground-truth/'s job (and the engine is knowingly
 * uncalibrated at 13/35 — see docs/ACCURACY_ROADMAP.md §1). These tests
 * assert structure, signs, and finiteness, which hold regardless of
 * where calibration lands.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
    computeDiscProfile, stabilityFromNumbers, REFERENCE_THROW,
    projectPathToChart, projectPathToHeightChart, toPolylinePoints,
    CHART_DIMS,
} from '../../src/physics/discProfile.js';
import { windProfileFactor } from '../../src/physics/sixDof.js';
import { DISC_DATABASE } from '../../src/data/discs.js';
import { buildWindSpec } from '../../src/physics/throwerProfile.js';

// Real flight numbers, by name, from the shipped database.
const DESTROYER = { name: 'Destroyer', speed: 12, glide: 5, turn: -1, fade: 3 };
const FIREBIRD = { name: 'Firebird', speed: 9, glide: 3, turn: 0, fade: 4 };
const MAMBA = { name: 'Mamba', speed: 11, glide: 6, turn: -5, fade: 1 };
const BUZZZ = { name: 'Buzzz', speed: 5, glide: 4, turn: -1, fade: 1 };
const LEOPARD = { name: 'Leopard', speed: 6, glide: 5, turn: -2, fade: 1 };

// ─── stabilityFromNumbers ────────────────────────────────────────────

describe('stabilityFromNumbers', () => {
    test('classifies the reference discs the way players read them', () => {
        // These are the discs everyone's intuition is anchored to. If a
        // threshold change moves any of them, that is a product-visible
        // regression, not a refactor.
        assert.equal(stabilityFromNumbers(BUZZZ).label, 'Stable');
        assert.equal(stabilityFromNumbers({ turn: 0, fade: 1 }).label, 'Stable'); // Aviar
        assert.equal(stabilityFromNumbers(LEOPARD).label, 'Understable');
        assert.equal(stabilityFromNumbers(MAMBA).label, 'Very Understable');
        assert.equal(stabilityFromNumbers(DESTROYER).label, 'Overstable');
        assert.equal(stabilityFromNumbers(FIREBIRD).label, 'Very Overstable');
    });

    test('reports the turn+fade sum it decided from', () => {
        assert.equal(stabilityFromNumbers(DESTROYER).sum, 2);
        assert.equal(stabilityFromNumbers(MAMBA).sum, -4);
    });

    test('is monotonic — more fade never reads less overstable', () => {
        const order = ['very-understable', 'understable', 'stable', 'overstable', 'very-overstable'];
        let prev = -1;
        for (let fade = -4; fade <= 6; fade++) {
            const idx = order.indexOf(stabilityFromNumbers({ turn: 0, fade }).key);
            assert.ok(idx >= prev, `fade=${fade} classified below fade=${fade - 1}`);
            prev = idx;
        }
    });

    test('treats a missing turn/fade as 0 rather than producing NaN', () => {
        const s = stabilityFromNumbers({});
        assert.equal(s.sum, 0);
        assert.equal(s.key, 'stable');
    });
});

// ─── computeDiscProfile: the sign convention ─────────────────────────

describe('computeDiscProfile — lateral sign convention (+x = right of the tee line)', () => {
    test('an overstable disc finishes LEFT of the tee line', () => {
        // RH backhand: a Firebird fades hard left. If this ever reads
        // positive, every chart in the app is mirrored.
        const p = computeDiscProfile(FIREBIRD);
        assert.ok(p.lateralFinishM < 0, `Firebird finished at ${p.lateralFinishFt.toFixed(1)} ft (expected left/negative)`);
        assert.ok(p.maxLeftM < 0);
    });

    test('an understable disc finishes RIGHT of the tee line', () => {
        const p = computeDiscProfile(MAMBA);
        assert.ok(p.lateralFinishM > 0, `Mamba finished at ${p.lateralFinishFt.toFixed(1)} ft (expected right/positive)`);
        assert.ok(p.maxRightM > 0);
    });

    test('an overstable driver still shows its turn phase before fading back left', () => {
        // The S-curve: a Destroyer is not a pure left-hook — it must
        // reach further right at some point than where it lands. This is
        // the assertion that would catch turn being dropped entirely.
        const p = computeDiscProfile(DESTROYER);
        assert.ok(p.maxRightM > p.lateralFinishM,
            `maxRight=${p.maxRightFt.toFixed(1)}ft finish=${p.lateralFinishFt.toFixed(1)}ft`);
        assert.ok(p.lateralFinishM < 0, 'Destroyer should still finish left');
    });

    test('a stable midrange finishes far closer to the tee line than either extreme', () => {
        const buzzz = computeDiscProfile(BUZZZ);
        const firebird = computeDiscProfile(FIREBIRD);
        const mamba = computeDiscProfile(MAMBA);
        assert.ok(Math.abs(buzzz.lateralFinishM) < Math.abs(firebird.lateralFinishM));
        assert.ok(Math.abs(buzzz.lateralFinishM) < Math.abs(mamba.lateralFinishM));
    });
});

// ─── computeDiscProfile: structure ───────────────────────────────────

describe('computeDiscProfile — structure and invariants', () => {
    test('returns a finite, non-trivial path with consistent metric units', () => {
        const p = computeDiscProfile(DESTROYER);
        assert.ok(p.path.length > 10, `path had only ${p.path.length} points`);
        for (const pt of p.path) {
            assert.ok(Number.isFinite(pt.lateralM) && Number.isFinite(pt.downrangeM) && Number.isFinite(pt.heightM));
        }
        assert.ok(p.distanceM > 0);
        assert.ok(Math.abs(p.distanceFt - p.distanceM * 3.28084) < 1e-6);
        assert.ok(Math.abs(p.apexFt - p.apexM * 3.28084) < 1e-6);
        assert.ok(Math.abs(p.lateralFinishFt - p.lateralFinishM * 3.28084) < 1e-6);
    });

    test('the path stops at touchdown rather than continuing underground', () => {
        const p = computeDiscProfile(DESTROYER);
        // The final point is the interpolated landing; nothing before it
        // may be meaningfully below ground.
        for (const pt of p.path) {
            assert.ok(pt.heightM > -0.01, `path dips to ${pt.heightM} m`);
        }
    });

    test('downrange advances monotonically (a reference throw never flies backwards)', () => {
        const p = computeDiscProfile(DESTROYER);
        for (let i = 1; i < p.path.length; i++) {
            assert.ok(p.path[i].downrangeM >= p.path[i - 1].downrangeM - 1e-9,
                `downrange went backwards at index ${i}`);
        }
    });

    test('apex is the maximum height actually present in the path', () => {
        const p = computeDiscProfile(MAMBA);
        const maxInPath = Math.max(...p.path.map((pt) => pt.heightM));
        assert.ok(Math.abs(p.apexM - maxInPath) < 1e-9);
        assert.ok(p.apexM > 0);
    });

    test('is deterministic — the same disc profiles identically twice', () => {
        const a = computeDiscProfile(DESTROYER);
        const b = computeDiscProfile(DESTROYER);
        assert.equal(a.path.length, b.path.length);
        assert.equal(a.distanceM, b.distanceM);
        assert.equal(a.lateralFinishM, b.lateralFinishM);
    });

    test('carries the reference conditions it used, and they are flat/full-power', () => {
        const p = computeDiscProfile(DESTROYER);
        assert.equal(p.reference.hyzerDeg, 0);
        assert.equal(p.reference.noseAngleDeg, 0);
        assert.equal(p.reference.powerPct, 100);
        assert.equal(p.reference.hand, 'RH');
    });

    test('REFERENCE_THROW is frozen — a caller cannot mutate the shared baseline', () => {
        assert.throws(() => { 'use strict'; REFERENCE_THROW.hyzerDeg = 20; });
    });

    test('rejects a disc with no usable flight numbers instead of returning NaN', () => {
        assert.throws(() => computeDiscProfile(null), /flight numbers/);
        assert.throws(() => computeDiscProfile({ glide: 5 }), /flight numbers/);
    });

    test('the stability label comes from the published numbers, not the simulated path', () => {
        // Guards the deliberate split documented in the module header:
        // a calibration change may move the drawn curve, but it must
        // never silently rewrite a disc's advertised character.
        const p = computeDiscProfile(FIREBIRD);
        assert.equal(p.stability.label, stabilityFromNumbers(FIREBIRD).label);
    });
});

// ─── LIVE THROW SETTINGS ─────────────────────────────────────────────

describe('computeDiscProfile — throwSettings drive the flight', () => {
    const flat = { power: 100, aimAngle: 0, releaseAngle: 0, noseAngle: 0 };

    test('omitting throwSettings reproduces the reference throw exactly', () => {
        // The chart's two readings must not drift apart: "no settings"
        // has to be numerically identical to explicitly asking for the
        // reference conditions, or the panel would show one number for
        // the disc and a different one for the same throw.
        const implicit = computeDiscProfile(DESTROYER);
        const explicit = computeDiscProfile(DESTROYER, { throwSettings: flat });
        assert.equal(implicit.distanceM, explicit.distanceM);
        assert.equal(implicit.lateralFinishM, explicit.lateralFinishM);
        assert.equal(implicit.apexM, explicit.apexM);
    });

    test('isReferenceThrow reports which QUESTION was asked, not whether answers coincide', () => {
        // Settings that happen to equal the reference still describe the
        // player's throw, not the disc's inherent character — the panel
        // labels those differently on purpose.
        assert.equal(computeDiscProfile(DESTROYER).isReferenceThrow, true);
        assert.equal(computeDiscProfile(DESTROYER, { throwSettings: flat }).isReferenceThrow, false);
    });

    test('power changes the flight', () => {
        const full = computeDiscProfile(DESTROYER, { throwSettings: flat });
        const half = computeDiscProfile(DESTROYER, { throwSettings: { ...flat, power: 50 } });
        assert.ok(half.distanceM < full.distanceM,
            `half power flew ${half.distanceFt.toFixed(0)}ft vs ${full.distanceFt.toFixed(0)}ft at full`);
    });

    test('hyzer finishes further left, anhyzer further right', () => {
        const hyzer = computeDiscProfile(DESTROYER, { throwSettings: { ...flat, releaseAngle: 20 } });
        const anhyzer = computeDiscProfile(DESTROYER, { throwSettings: { ...flat, releaseAngle: -20 } });
        // Engine output frame: +x is RIGHT of the tee line.
        assert.ok(anhyzer.lateralFinishM < hyzer.lateralFinishM,
            `anhyzer=${anhyzer.lateralFinishFt.toFixed(0)}ft hyzer=${hyzer.lateralFinishFt.toFixed(0)}ft`);
    });

    test('nose angle changes the flight', () => {
        const flatNose = computeDiscProfile(DESTROYER, { throwSettings: flat });
        const noseUp = computeDiscProfile(DESTROYER, { throwSettings: { ...flat, noseAngle: 10 } });
        assert.ok(Math.abs(noseUp.distanceM - flatNose.distanceM) > 1,
            'nose angle should visibly change the flight');
    });

    test('AIM angle does NOT change the flight — it rotates it, and the chart IS the aim line', () => {
        // Documented exclusion in throwSpecFieldsFromUI. If aim ever
        // leaks into the spec, the chart would read "this disc turns
        // more when I aim right", which is false.
        const straight = computeDiscProfile(DESTROYER, { throwSettings: flat });
        const aimed = computeDiscProfile(DESTROYER, { throwSettings: { ...flat, aimAngle: 40 } });
        assert.equal(aimed.distanceM, straight.distanceM);
        assert.equal(aimed.lateralFinishM, straight.lateralFinishM);
    });

    test('coarser sim options do not move the answer (dt-convergence)', () => {
        // The interactive chart runs at dt 0.004 / sampleEvery 10 to stay
        // cheap enough for a slider drag. That is only legitimate because
        // the engine converges — asserted here so a future dt change
        // can't silently degrade the chart.
        const fine = computeDiscProfile(DESTROYER, { throwSettings: flat });
        const coarse = computeDiscProfile(DESTROYER, {
            throwSettings: flat,
            simOptions: { dt: 0.004, sampleEvery: 10 },
        });
        assert.ok(Math.abs(coarse.distanceFt - fine.distanceFt) < 1,
            `coarse=${coarse.distanceFt.toFixed(2)}ft fine=${fine.distanceFt.toFixed(2)}ft`);
        assert.ok(coarse.path.length > 20, 'coarse path still needs enough points to draw');
    });
});

// ─── WIND ────────────────────────────────────────────────────────────

describe('computeDiscProfile — wind', () => {
    const flat = { power: 100, aimAngle: 0, releaseAngle: 0, noseAngle: 0 };

    test('wind actually reaches the engine (regression: it silently did not)', () => {
        // THE bug this guards: the engine reads `speedMps`/`directionDeg`
        // and the UI hands it `{speed, direction}`, so an unconverted
        // pass-through simulated dead calm at every wind setting. If
        // buildWindSpec is ever dropped from this path, these become
        // equal and this fails.
        const calm = computeDiscProfile(DESTROYER, { throwSettings: flat, wind: { speed: 0, direction: 0 } });
        const headwind = computeDiscProfile(DESTROYER, { throwSettings: flat, wind: { speed: 10, direction: 0 } });
        assert.ok(Math.abs(headwind.distanceM - calm.distanceM) > 1,
            `wind had no effect: calm=${calm.distanceFt.toFixed(0)}ft headwind=${headwind.distanceFt.toFixed(0)}ft`);
    });

    test('a headwind pushes the finish further right than a tailwind', () => {
        // Direction-of-effect, not a magnitude claim: a headwind raises
        // airspeed, which turns a disc over (rightward for RH backhand).
        const head = computeDiscProfile(DESTROYER, { throwSettings: flat, wind: { speed: 8, direction: 0 } });
        const tail = computeDiscProfile(DESTROYER, { throwSettings: flat, wind: { speed: 8, direction: 180 } });
        assert.ok(head.lateralFinishM > tail.lateralFinishM,
            `head=${head.lateralFinishFt.toFixed(0)}ft tail=${tail.lateralFinishFt.toFixed(0)}ft`);
    });

    test('omitted wind and explicit zero wind agree', () => {
        const omitted = computeDiscProfile(DESTROYER, { throwSettings: flat });
        const zero = computeDiscProfile(DESTROYER, { throwSettings: flat, wind: { speed: 0, direction: 0 } });
        assert.equal(omitted.distanceM, zero.distanceM);
    });

    test('wind disqualifies a profile from claiming to be the reference throw', () => {
        const windy = computeDiscProfile(DESTROYER, { wind: { speed: 8, direction: 0 } });
        assert.equal(windy.isReferenceThrow, false);
    });

    test('wind direction is COMPASS, so the same wind plays differently per hole bearing', () => {
        // Wind is stored as the meteorological bearing it blows FROM.
        // The same easterly is a headwind on an east-facing hole and a
        // tailwind on a west-facing one — if the bearing were ignored,
        // these would be identical.
        const wind = { speed: 8, direction: 90 }; // from the east
        const intoIt = computeDiscProfile(DESTROYER, { throwSettings: flat, wind, throwBearingDeg: 90 });
        const withIt = computeDiscProfile(DESTROYER, { throwSettings: flat, wind, throwBearingDeg: 270 });

        // Direction-of-effect, matching the ground-truth suite's
        // "headwind-increases-turn": a headwind raises airspeed and
        // turns a RH backhand over to the RIGHT, a tailwind does not.
        assert.ok(intoIt.lateralFinishM > withIt.lateralFinishM,
            `headwind finish ${intoIt.lateralFinishFt.toFixed(0)}ft should be right of tailwind ${withIt.lateralFinishFt.toFixed(0)}ft`);

        // NOT asserted: that a headwind flies shorter. It does not here,
        // and that is correct rather than a calibration artefact — a
        // tailwind bleeds airspeed off a speed-12 driver until it stops
        // generating lift (measured apex 6ft vs 18ft), so it drops early
        // while the headwind stays aloft and turns over. Encoding the
        // naive "headwind = shorter" intuition here would pin a claim
        // the physics contradicts.
        assert.ok(Math.abs(intoIt.distanceM - withIt.distanceM) > 1,
            'bearing must materially change the flight');
    });

    test('the chart matches the map: same wind + bearing gives the engine the same input', () => {
        // The chart and the map must not simulate the same wind from
        // different directions — a player would see the chart contradict
        // the flight it just drew. Both funnel through buildWindSpec, so
        // this asserts the chart's rotation equals the engine boundary's.
        const wind = { speed: 8, direction: 45 };
        const bearing = 135;
        const viaChart = computeDiscProfile(DESTROYER, { throwSettings: flat, wind, throwBearingDeg: bearing });
        // Same throw, expressed the way the engine boundary would: wind
        // already rotated, bearing therefore zero.
        const preRotated = { speed: 8, direction: buildWindSpec(wind, bearing).directionDeg };
        const viaEngine = computeDiscProfile(DESTROYER, { throwSettings: flat, wind: preRotated });
        assert.equal(viaChart.distanceM, viaEngine.distanceM);
        assert.equal(viaChart.lateralFinishM, viaEngine.lateralFinishM);
    });

    test('the aim slider rotates the wind, since aim moves the axis the wind is measured against', () => {
        // Aim doesn't reshape the flight, but it does change which way
        // you are facing — so a headwind becomes a quartering wind. This
        // mirrors MapCanvas, which aims along (hole bearing + aim).
        const wind = { speed: 8, direction: 0 }; // from the north
        const straight = computeDiscProfile(DESTROYER, { throwSettings: flat, wind, throwBearingDeg: 0 });
        const aimed = computeDiscProfile(DESTROYER, {
            throwSettings: { ...flat, aimAngle: 45 }, wind, throwBearingDeg: 0,
        });
        assert.notEqual(aimed.lateralFinishM, straight.lateralFinishM);
    });
});

// ─── every shipped disc ──────────────────────────────────────────────

describe('computeDiscProfile against the whole shipped disc database', () => {
    test('every disc in DISC_DATABASE profiles without NaN or a degenerate flight', () => {
        // The real "does this ship" check: one disc whose numbers fall
        // outside the coefficient mapping's usable range would render an
        // empty or exploded chart for that disc only, which spot-checking
        // a handful would miss.
        assert.ok(DISC_DATABASE.length > 100, 'expected the full database');
        const failures = [];
        for (const disc of DISC_DATABASE) {
            try {
                const p = computeDiscProfile(disc);
                if (!Number.isFinite(p.distanceM) || p.distanceM <= 0) failures.push(`${disc.name}: distance ${p.distanceM}`);
                else if (p.path.length < 5) failures.push(`${disc.name}: ${p.path.length} points`);
                else if (!Number.isFinite(p.lateralFinishM)) failures.push(`${disc.name}: lateral NaN`);
                else if (!Number.isFinite(p.apexM)) failures.push(`${disc.name}: apex NaN`);
            } catch (err) {
                failures.push(`${disc.name}: threw ${err.message}`);
            }
        }
        assert.deepEqual(failures, [], `discs that failed to profile:\n${failures.join('\n')}`);
    });
});

// ─── chart projection ────────────────────────────────────────────────

describe('projectPathToChart', () => {
    const straightish = [
        { lateralM: 0, downrangeM: 0, heightM: 1.4 },
        { lateralM: 0.05, downrangeM: 40, heightM: 5 },
        { lateralM: -0.03, downrangeM: 80, heightM: 3 },
        { lateralM: 0.01, downrangeM: 100, heightM: 0 },
    ];

    test('a dead-straight disc is drawn straight, not stretched into an S-curve', () => {
        // Without the minimum-lateral-span floor, 5 cm of drift would be
        // normalized to the full chart width and read as a huge turn.
        const { points } = projectPathToChart(straightish, { width: 200, height: 240 });
        const centre = 100;
        for (const p of points) {
            assert.ok(Math.abs(p.x - centre) < 2, `x=${p.x} strayed from centre for a straight flight`);
        }
    });

    test('honours the minimum lateral span even when the path barely deviates', () => {
        // With the stretch cap switched off, the floor is the binding
        // constraint — this is the original guarantee, that 5 cm of drift
        // is never normalized to the full chart width.
        const { lateralSpanM } = projectPathToChart(straightish, {
            minLateralSpanM: 7.5,
            maxStretch: 0,
        });
        assert.equal(lateralSpanM, 7.5);
    });

    test('caps horizontal exaggeration so an arc is never drawn as a hairpin', () => {
        // The floor alone bounded only the WORST case. A real 60 m drive
        // with 11 m of lateral movement was still being drawn at >5×
        // horizontal stretch, which turns the arc a disc actually flies
        // into a hairpin no disc has ever made. Players read the picture,
        // not the caption.
        const arc = [
            { lateralM: 0, downrangeM: 0, heightM: 1.4 },
            { lateralM: 8, downrangeM: 30, heightM: 6 },
            { lateralM: 4, downrangeM: 50, heightM: 4 },
            { lateralM: -11, downrangeM: 60, heightM: 0 },
        ];
        const { stretchX, lateralSpanM } = projectPathToChart(arc, {
            width: 288, height: 150, maxStretch: 2.5,
        });
        assert.ok(stretchX <= 2.5 + 1e-9, `stretch ${stretchX} exceeds the cap`);
        // The cap works by WIDENING the axis, so the axis must have grown
        // past the flight's own extent rather than clipping it.
        assert.ok(lateralSpanM > 11, `axis ${lateralSpanM} clips the widest point`);
    });

    test('a flight wide enough to need the room is not padded past the cap', () => {
        // The cap is a ceiling, not a target: a genuinely wide flight
        // should use the width it needs and report a stretch BELOW the cap
        // rather than being inflated up to it.
        const veryWide = [
            { lateralM: 0, downrangeM: 0, heightM: 1.4 },
            { lateralM: 45, downrangeM: 30, heightM: 6 },
            { lateralM: -40, downrangeM: 55, heightM: 0 },
        ];
        const { stretchX } = projectPathToChart(veryWide, {
            width: 288, height: 150, maxStretch: 2.5,
        });
        assert.ok(stretchX < 2.5, `stretch ${stretchX} should fall below the cap`);
        assert.ok(stretchX > 0, 'stretch must be a positive ratio');
    });

    test('scales to the real lateral extent once it exceeds the floor, with headroom', () => {
        const wide = [
            { lateralM: 0, downrangeM: 0, heightM: 1.4 },
            { lateralM: 20, downrangeM: 50, heightM: 8 },
            { lateralM: -12, downrangeM: 100, heightM: 0 },
        ];
        const { lateralSpanM } = projectPathToChart(wide, { minLateralSpanM: 7.5 });
        // Must accommodate the widest point (20 m) and leave a margin, but
        // not so much that the flight shrinks to a squiggle in the middle.
        assert.ok(lateralSpanM > 20, `span ${lateralSpanM} must exceed the widest point`);
        assert.ok(lateralSpanM < 20 * 1.5, `span ${lateralSpanM} wastes too much width`);
    });

    test('the extreme lateral point renders clear of the border, marker and all', () => {
        // The regression this guards: an overstable driver's landing IS
        // its widest point, so with no headroom the landing marker drew
        // half-clipped against the plot edge — the one dot a player most
        // wants to read. 5 px covers the marker's halo radius.
        const MARKER_R = 5;
        const W = 212;
        const padX = 10;
        for (const disc of [DESTROYER, FIREBIRD, MAMBA, LEOPARD]) {
            const { points } = projectPathToChart(computeDiscProfile(disc).path, { width: W, padX });
            for (const p of points) {
                assert.ok(p.x > padX - MARKER_R && p.x < W - padX + MARKER_R,
                    `${disc.name}: x=${p.x.toFixed(1)} too close to the plot edge`);
            }
        }
    });

    test('downrange runs bottom→top (published flight-chart orientation)', () => {
        const { points } = projectPathToChart(straightish, { width: 200, height: 240 });
        for (let i = 1; i < points.length; i++) {
            assert.ok(points[i].y <= points[i - 1].y + 1e-9,
                `y increased (drew downrange downward) at index ${i}`);
        }
    });

    test('right-of-centre lateral maps right of chart centre', () => {
        const right = [
            { lateralM: 0, downrangeM: 0, heightM: 1.4 },
            { lateralM: 15, downrangeM: 50, heightM: 5 },
        ];
        const { points } = projectPathToChart(right, { width: 200, height: 240 });
        assert.ok(points[1].x > 100, 'positive lateral must draw right of centre');
    });

    test('stays inside the viewBox for every shipped disc', () => {
        // Overflow would clip the curve against the panel edge.
        const W = 200;
        const H = 240;
        for (const disc of DISC_DATABASE) {
            const { points } = projectPathToChart(computeDiscProfile(disc).path, { width: W, height: H });
            for (const p of points) {
                assert.ok(p.x >= -0.01 && p.x <= W + 0.01, `${disc.name}: x=${p.x} outside [0,${W}]`);
                assert.ok(p.y >= -0.01 && p.y <= H + 0.01, `${disc.name}: y=${p.y} outside [0,${H}]`);
            }
        }
    });

    test('an empty path degrades to an empty projection instead of throwing', () => {
        const out = projectPathToChart([], {});
        assert.deepEqual(out.points, []);
        const out2 = projectPathToChart(null, {});
        assert.deepEqual(out2.points, []);
    });
});

describe('projectPathToHeightChart', () => {
    const arc = [
        { lateralM: 0, downrangeM: 0, heightM: 1.4 },
        { lateralM: 0, downrangeM: 50, heightM: 9 },
        { lateralM: 0, downrangeM: 100, heightM: 0 },
    ];

    test('downrange runs left→right and altitude runs upward', () => {
        const { points } = projectPathToHeightChart(arc, { width: 200, height: 60 });
        assert.ok(points[1].x > points[0].x, 'downrange must advance rightward');
        assert.ok(points[2].x > points[1].x);
        // Apex (index 1) is the highest point → smallest SVG y.
        assert.ok(points[1].y < points[0].y, 'apex must draw above the release point');
        assert.ok(points[1].y < points[2].y, 'apex must draw above the landing point');
    });

    test('reports the true apex, not the floor used for scaling', () => {
        const flat = [
            { lateralM: 0, downrangeM: 0, heightM: 1.4 },
            { lateralM: 0, downrangeM: 60, heightM: 1.6 },
        ];
        const { apexM } = projectPathToHeightChart(flat, { minApexM: 3 });
        assert.ok(Math.abs(apexM - 1.6) < 1e-9, `apexM=${apexM} should report the real apex`);
    });

    test('a flat laser is not amplified into a tall arc by the apex floor', () => {
        const flat = [
            { lateralM: 0, downrangeM: 0, heightM: 1.4 },
            { lateralM: 0, downrangeM: 30, heightM: 1.5 },
            { lateralM: 0, downrangeM: 60, heightM: 1.4 },
        ];
        const { points } = projectPathToHeightChart(flat, { width: 200, height: 60, minApexM: 3 });
        const ys = points.map((p) => p.y);
        assert.ok(Math.max(...ys) - Math.min(...ys) < 5, 'a flat flight should stay visually flat');
    });

    test('an empty path degrades to an empty projection', () => {
        assert.deepEqual(projectPathToHeightChart([], {}).points, []);
    });

    test('no shipped disc\'s curve reaches the bottom-left corner', () => {
        // DiscProfilePanel puts its "SIDE VIEW" caption there. The first
        // attempt put it top-left on the reasoning that "the disc is
        // released low" — true only relative to a tall apex. The strip
        // rescales to each disc's own apex, so a flat midrange starts
        // near half height and climbs straight through the top-left,
        // which is exactly what shipped and had to be fixed. This pins
        // the corner that is actually safe, so a change to the apex
        // floor or release height fails here instead of in the UI.
        const W = CHART_DIMS.heightW;
        const H = CHART_DIMS.heightH;
        const padX = 10;
        const CAPTION_W = 56; // rendered width of the caption
        const CAPTION_H = 12;
        for (const disc of DISC_DATABASE) {
            const { points } = projectPathToHeightChart(computeDiscProfile(disc).path, { width: W, height: H, padX });
            for (const p of points) {
                const inCaptionBox = p.x < padX + CAPTION_W && p.y > H - CAPTION_H;
                assert.ok(!inCaptionBox,
                    `${disc.name}: curve enters the caption box at (${p.x.toFixed(1)}, ${p.y.toFixed(1)})`);
            }
        }
    });
});

describe('CHART_DIMS', () => {
    // The panel's whole purpose is being readable WHILE the throw
    // sliders are dragged. The SVGs render at width:100%, so a viewBox
    // narrower than the column is magnified and the chart grows taller
    // in proportion — a 212-wide viewBox in the 288px column was
    // magnified ~36% and pushed the sliders off-screen. These pin the
    // geometry that keeps both on screen together.
    const COLUMN_W = 288; // 320px panel − 2×16px padding

    test('viewBox width equals the column width, so nothing is magnified', () => {
        assert.equal(CHART_DIMS.w, COLUMN_W);
        assert.equal(CHART_DIMS.heightW, COLUMN_W);
    });

    test('the PINNED region fits the chart and four sliders together', () => {
        // ThrowPanel pins the top-down chart and the throw sliders in a
        // non-scrolling region so they cannot scroll apart — adjusting a
        // setting and then scrolling to see what it did is not a usable
        // control loop. That only holds if the chart leaves room for the
        // rest of the pinned content. Measured from the shipped layout:
        // disc header ~44, flight-number row ~40, headline figures ~26,
        // divider + gaps ~30, settings header ~30, 4 sliders ~44 each.
        const PINNED_CHROME = 44 + 40 + 26 + 30 + 30 + (4 * 44);
        const pinned = CHART_DIMS.h + CHART_DIMS.captionH + PINNED_CHROME;
        // Panel max-height is calc(100vh − 120px), i.e. 780px at a 900px
        // viewport. Leave at least ~120px so the scrolling region below
        // is visibly a scrolling region rather than a sliver.
        assert.ok(pinned <= 660,
            `pinned region is ${pinned}px — chart + sliders will not fit on screen together`);
    });

    test('the side strip is small — it scrolls, so it must not crowd what does not', () => {
        assert.ok(CHART_DIMS.heightH <= 48);
    });

    test('the top-down plot stays tall enough to read a flight shape', () => {
        assert.ok(CHART_DIMS.h >= 140, 'too short to distinguish an S-curve from a hook');
    });

    test('is frozen — component and tests must read the same numbers', () => {
        assert.throws(() => { 'use strict'; CHART_DIMS.h = 999; });
    });
});

describe('toPolylinePoints', () => {
    test('formats projected points as an SVG points attribute', () => {
        const s = toPolylinePoints([{ x: 1.234, y: 5.678 }, { x: 10, y: 20 }]);
        assert.equal(s, '1.23,5.68 10.00,20.00');
    });

    test('an empty projection produces an empty string, not "undefined"', () => {
        assert.equal(toPolylinePoints([]), '');
    });
});

/**
 * ── WIND SHEAR ───────────────────────────────────────────────────────
 * Weather services report wind at the WMO standard height of 10 m. A
 * disc golf flight lives between the release height (~1.4 m) and an apex
 * of a few metres. Applying the reported number uniformly blows the disc
 * with a wind it never meets, and the error is worst at release — where
 * the disc is fastest and α is most sensitive to an airspeed change.
 *
 * The symptom that sent us looking: a Destroyer in the panel's own wind
 * slider flipped from a clean fade to a hard turn-over hairpin somewhere
 * around 10 m/s, because the engine was flying it through a 10 m wind at
 * 2 m altitude.
 */
describe('wind shear (logarithmic surface layer)', () => {
    test('the reported wind is recovered exactly at the reference height', () => {
        assert.ok(Math.abs(windProfileFactor(10) - 1) < 1e-12);
    });

    test('a disc at flight altitude feels markedly less than the reported wind', () => {
        const atRelease = windProfileFactor(1.4);
        const atApex = windProfileFactor(3.2);
        assert.ok(atRelease > 0.5 && atRelease < 0.75,
            `release-height factor ${atRelease} outside the physical band`);
        assert.ok(atApex > atRelease, 'wind must increase with height');
        assert.ok(atApex < 1, 'below 10 m the wind must stay below the reported value');
    });

    test('wind keeps increasing above the reference height', () => {
        // A high hyzer-flip spends its apex up where the wind is stronger;
        // clamping at 1.0 would understate that.
        assert.ok(windProfileFactor(20) > 1);
    });

    test('the mean wind vanishes inside the roughness sublayer', () => {
        assert.equal(windProfileFactor(0.05), 0);
        assert.equal(windProfileFactor(0), 0);
        assert.equal(windProfileFactor(-1), 0);
    });

    test('z0 <= 0 is the explicit no-shear escape hatch', () => {
        // Lets a caller (or a regression test) recover the old uniform-wind
        // behaviour exactly, rather than approximating it.
        assert.equal(windProfileFactor(1.4, 0), 1);
        assert.equal(windProfileFactor(50, 0), 1);
    });

    test('shear leaves a calm flight untouched', () => {
        const disc = { speed: 12, glide: 5, turn: -1, fade: 3 };
        const settings = { power: 80, aimAngle: 0, releaseAngle: 0, noseAngle: 2 };
        const calm = computeDiscProfile(disc, { throwSettings: settings });
        const zeroWind = computeDiscProfile(disc, {
            throwSettings: settings, wind: { speed: 0, direction: 90 },
        });
        assert.ok(Math.abs(calm.distanceM - zeroWind.distanceM) < 1e-9);
    });

    test('a strong headwind no longer flips an overstable driver into a hairpin', () => {
        // A Destroyer (12/5/-1/3) is overstable. Into a strong headwind it
        // flies flatter and finishes left — harder, if anything. What it
        // must NOT do is cross the tee line and hook right, which is what
        // the unsheared 10 m wind produced.
        const disc = { speed: 12, glide: 5, turn: -1, fade: 3 };
        const settings = { power: 80, aimAngle: 0, releaseAngle: 0, noseAngle: 2 };
        const strong = computeDiscProfile(disc, {
            throwSettings: settings,
            wind: { speed: 11.5, direction: 0 },
            throwBearingDeg: 0,
        });
        assert.ok(strong.lateralFinishM < 0,
            `an overstable driver must finish left, got ${strong.lateralFinishFt.toFixed(0)} ft`);
        assert.ok(strong.maxRightM < 3,
            `excursion right of the tee line was ${strong.maxRightFt.toFixed(0)} ft`);
    });

    test('shear reduces the wind\'s effect without erasing it', () => {
        // The fix must not become "wind does nothing" — that would trade
        // one wrong answer for another.
        const disc = { speed: 7, glide: 5, turn: -2, fade: 1 };
        const settings = { power: 80, aimAngle: 0, releaseAngle: 0, noseAngle: 2 };
        const calm = computeDiscProfile(disc, { throwSettings: settings });
        const windy = computeDiscProfile(disc, {
            throwSettings: settings,
            wind: { speed: 8, direction: 0 },
            throwBearingDeg: 0,
        });
        assert.ok(Math.abs(windy.lateralFinishM - calm.lateralFinishM) > 1,
            'an 8 m/s headwind must still visibly change the flight');
    });
});
