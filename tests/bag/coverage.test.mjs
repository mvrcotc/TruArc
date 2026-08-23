/**
 * Tests for bag coverage & gap analysis — src/bag/coverage.js
 *
 * WHAT THESE ASSERT, AND WHAT THEY DELIBERATELY DO NOT:
 *
 * The flight model's ABSOLUTE distances are known-wrong (3/23 ground
 * truth envelopes; see docs/ACCURACY_ROADMAP.md), so nothing here
 * asserts that a Destroyer flies 340 ft. What these assert is the layer
 * on top: that the analysis is structurally sound, that its findings are
 * of the right KIND, and that it degrades safely — properties which must
 * hold no matter how the calibration moves underneath.
 *
 * This mirrors tests/physics-invariants.test.mjs, which exists for the
 * same reason: calibration-dependent assertions and calibration-
 * independent ones need separate homes, or a recalibration turns the
 * whole suite red and nobody can tell which failures are real.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
    SHAPE_BANDS, SHAPE_ORDER, DEFAULT_SHOT_GRID, MIN_GAP_FT,
    shapeOf, discKey, simulateShot, discFootprint,
    bagCoverage, findGaps, findRedundancies, analyzeBag,
} from '../../src/bag/coverage.js';

const DISC = {
    aviar: { name: 'Aviar', speed: 2, glide: 3, turn: 0, fade: 1, brand: 'Innova' },
    buzzz: { name: 'Buzzz', speed: 5, glide: 4, turn: -1, fade: 1, brand: 'Discraft' },
    teebird: { name: 'Teebird', speed: 7, glide: 5, turn: 0, fade: 2, brand: 'Innova' },
    firebird: { name: 'Firebird', speed: 9, glide: 3, turn: 0, fade: 4, brand: 'Innova' },
    leopard: { name: 'Leopard', speed: 6, glide: 5, turn: -2, fade: 1, brand: 'Innova' },
    destroyer: { name: 'Destroyer', speed: 12, glide: 5, turn: -1, fade: 3, brand: 'Innova' },
};

describe('shape bands', () => {
    test('bands tile the whole real line with no gap or overlap', () => {
        // A landing that falls between two bands would be silently
        // dropped from coverage and could manufacture a phantom gap.
        for (let i = 1; i < SHAPE_BANDS.length; i++) {
            assert.equal(SHAPE_BANDS[i].min, SHAPE_BANDS[i - 1].max,
                `${SHAPE_BANDS[i].id} does not start where ${SHAPE_BANDS[i - 1].id} ends`);
        }
        assert.equal(SHAPE_BANDS[0].min, -Infinity);
        assert.equal(SHAPE_BANDS.at(-1).max, Infinity);
        assert.deepEqual(SHAPE_ORDER, SHAPE_BANDS.map((b) => b.id));
    });

    test('shape is a ratio, so it means the same thing at any distance', () => {
        // The whole point of normalising: 30 ft right at 200 ft is a real
        // turnover; at 400 ft it is essentially straight. A band defined
        // in raw feet would call both the same shot.
        assert.equal(shapeOf(200, 30).id, shapeOf(400, 60).id);
        // Same 30 ft of finish: a turnover at 200 ft, straight at 500 ft.
        assert.equal(shapeOf(200, 30).id, 'right');
        assert.equal(shapeOf(500, 30).id, 'straight');
    });

    test('a zero-distance landing resolves rather than dividing by zero', () => {
        assert.ok(shapeOf(0, 0).id);
        assert.ok(shapeOf(0, 15).id);
    });
});

describe('simulation plumbing', () => {
    test('a shot returns finite geometry and a resolved shape', () => {
        const s = simulateShot(DISC.teebird, { hyzerDeg: 0, powerPct: 100 });
        for (const k of ['distanceFt', 'lateralFt', 'apexFt']) {
            assert.ok(Number.isFinite(s[k]), `${k} was ${s[k]}`);
        }
        assert.ok(s.distanceFt > 0);
        assert.ok(SHAPE_ORDER.includes(s.shape));
    });

    test('distanceScale scales the map linearly and changes nothing else', () => {
        // This is the hook the player's own known distance plugs into.
        // It must move the axis without reshaping the map, or anchoring
        // would silently rewrite which discs overlap.
        const a = simulateShot(DISC.buzzz, { hyzerDeg: 0, powerPct: 100 });
        const b = simulateShot(DISC.buzzz, { hyzerDeg: 0, powerPct: 100 }, { distanceScale: 2 });
        assert.ok(Math.abs(b.distanceFt - a.distanceFt * 2) < 1e-6);
        assert.ok(Math.abs(b.lateralFt - a.lateralFt * 2) < 1e-6);
        assert.equal(b.shape, a.shape, 'scaling must not move a disc between shape bands');
    });

    test('a footprint covers the whole grid', () => {
        const f = discFootprint(DISC.teebird);
        assert.equal(f.shots.length, DEFAULT_SHOT_GRID.hyzerDeg.length * DEFAULT_SHOT_GRID.powerPct.length);
        assert.ok(f.maxDistanceFt >= f.minDistanceFt);
    });

    test('a disc that throws an exception is skipped, not fatal', () => {
        // One bad parameter combination must cost a grid point, never the
        // whole chart — an empty bag screen is indistinguishable from a
        // broken app to the person looking at it.
        const seen = [];
        const bogus = { name: 'Bogus', brand: 'X', speed: NaN, glide: NaN, turn: NaN, fade: NaN };
        assert.doesNotThrow(() => discFootprint(bogus, { onError: (d, s, e) => seen.push(e) }));
    });

    test('less power never flies further than full power', () => {
        // Not a calibration claim — a monotonicity the model must respect
        // for any parameters at all, and the cheapest possible canary for
        // a sign error in the release-speed path.
        for (const disc of Object.values(DISC)) {
            const full = simulateShot(disc, { hyzerDeg: 0, powerPct: 100 });
            const soft = simulateShot(disc, { hyzerDeg: 0, powerPct: 75 });
            assert.ok(soft.distanceFt <= full.distanceFt + 1e-6,
                `${disc.name}: 75% power flew ${soft.distanceFt.toFixed(0)} vs ${full.distanceFt.toFixed(0)} at full`);
        }
    });

    test('an overstable disc cannot be forced into a big turnover', () => {
        // Calibration-independent because it is a claim about ORDERING,
        // which is the half of this engine that works. A Firebird thrown
        // on a hard anhyzer comes back; if it ever reads as a turnover the
        // stability mapping has inverted.
        const f = discFootprint(DISC.firebird);
        assert.ok(!f.shots.some((s) => s.shape === 'hardRight'),
            'Firebird reached the big-turnover band');
    });
});

describe('gap detection', () => {
    test('an empty bag produces no findings and does not throw', () => {
        const a = analyzeBag([]);
        assert.deepEqual(a.gaps, []);
        assert.deepEqual(a.redundancies, []);
        assert.equal(a.maxDistanceFt, 0);
    });

    test('gaps are interior seams, never "you cannot throw further"', () => {
        // The load-bearing test for the recommender's honesty. If a gap
        // could sit beyond the bag's longest throw, the buy advice would
        // cheerfully sell a beginner a speed-14 driver to "fill" it.
        const a = analyzeBag([DISC.aviar, DISC.destroyer]);
        for (const g of a.gaps) {
            if (g.kind !== 'distance') continue;
            assert.ok(g.toFt <= a.maxDistanceFt + 1e-6,
                `gap runs to ${g.toFt.toFixed(0)} ft past the bag's max of ${a.maxDistanceFt.toFixed(0)}`);
        }
    });

    test('every distance gap is at least the minimum width', () => {
        const a = analyzeBag(Object.values(DISC));
        for (const g of a.gaps) {
            if (g.kind === 'distance') assert.ok(g.widthFt >= MIN_GAP_FT);
        }
    });

    test('gaps are reported widest-first', () => {
        const a = analyzeBag(Object.values(DISC));
        const widths = a.gaps.filter((g) => g.kind === 'distance').map((g) => g.widthFt);
        for (let i = 1; i < widths.length; i++) {
            assert.ok(widths[i] <= widths[i - 1], 'gaps came back out of order');
        }
    });

    test('a shape nothing in the bag can reach is reported as a shape gap', () => {
        // A bag of only overstable discs has no turnover shot at any
        // distance. That is a real hole even though it has no interior
        // seam, so it needs its own finding kind.
        const a = analyzeBag([DISC.firebird]);
        assert.ok(a.gaps.some((g) => g.kind === 'shape' && g.shape === 'hardRight'));
    });
});

describe('redundancy detection', () => {
    test('a single-disc bag has no redundancies', () => {
        assert.deepEqual(analyzeBag([DISC.teebird]).redundancies, []);
    });

    test('an exact duplicate is caught', () => {
        // Same flight numbers, different name — the clearest possible
        // case, and the floor this pass has to clear.
        const clone = { ...DISC.teebird, name: 'Eagle', brand: 'Innova' };
        const a = analyzeBag([DISC.teebird, clone]);
        assert.ok(a.redundancies.some((r) => r.coveredFraction === 1));
    });

    test('each disc is reported at most once', () => {
        // Three discs overlapping one disc is one problem, not three.
        const a = analyzeBag(Object.values(DISC));
        const keys = a.redundancies.map((r) => r.key);
        assert.equal(keys.length, new Set(keys).size);
    });

    test('the threshold scales with the bag, not with absolute feet', () => {
        // Anchoring the axis to the player's real distances must not
        // silently change which discs count as duplicates.
        const bag = [DISC.buzzz, DISC.teebird, DISC.destroyer];
        const plain = analyzeBag(bag);
        const scaled = analyzeBag(bag, { distanceScale: 1.4 });
        assert.deepEqual(
            plain.redundancies.map((r) => r.key).sort(),
            scaled.redundancies.map((r) => r.key).sort(),
        );
    });

    test('discKey is stable and distinguishes same-name discs by brand', () => {
        assert.equal(discKey(DISC.teebird), discKey({ ...DISC.teebird }));
        assert.notEqual(
            discKey({ name: 'Wraith', brand: 'Innova' }),
            discKey({ name: 'Wraith', brand: 'Other' }),
        );
    });
});
