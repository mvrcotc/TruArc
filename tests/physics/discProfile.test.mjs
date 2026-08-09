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
} from '../../src/physics/discProfile.js';
import { DISC_DATABASE } from '../../src/data/discs.js';

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
        const { lateralSpanM } = projectPathToChart(straightish, { minLateralSpanM: 7.5 });
        assert.equal(lateralSpanM, 7.5);
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
        const W = 212;
        const H = 54;
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

describe('toPolylinePoints', () => {
    test('formats projected points as an SVG points attribute', () => {
        const s = toPolylinePoints([{ x: 1.234, y: 5.678 }, { x: 10, y: 20 }]);
        assert.equal(s, '1.23,5.68 10.00,20.00');
    });

    test('an empty projection produces an empty string, not "undefined"', () => {
        assert.equal(toPolylinePoints([]), '');
    });
});
