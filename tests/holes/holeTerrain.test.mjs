/**
 * Tests for hole terrain reading — src/holes/holeTerrain.js
 *
 * These assert MEASUREMENT logic, so unlike the flight suites there is
 * no calibration to be uncertain about: a ridge either blocks a sight
 * line or it does not, and a hand-written profile can say which. That is
 * the whole reason the analysis was kept free of Mapbox — a blind hole
 * can be constructed here exactly, instead of being hunted for on a real
 * course and eyeballed.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
    EYE_HEIGHT_FT, BASKET_TOP_FT, FLAT_THRESHOLD_FT, FEATURE_THRESHOLD_FT,
    CROSS_SAMPLE_FT,
    elevationChangeFt, dominantFeature, basketVisibility, slopeAt,
    landingSlopes, describeProfile, readHole,
    groundDistanceFt, bearingDeg,
} from '../../src/holes/holeTerrain.js';

/** Build a profile from an elevation array, `stepFt` apart. */
const profile = (elevFt, stepFt = 15, extra = {}) => ({
    lengthFt: (elevFt.length - 1) * stepFt,
    stepFt,
    elevFt,
    ...extra,
});

/** n samples following f(i/(n-1)) → elevation. */
const shaped = (n, f) => Array.from({ length: n }, (_, i) => f(i / (n - 1)));

describe('elevation change', () => {
    test('a flat hole reads zero', () => {
        assert.equal(elevationChangeFt(profile([0, 0, 0, 0, 0])), 0);
    });

    test('sign convention: positive means the basket is above you', () => {
        assert.equal(elevationChangeFt(profile([0, -10, -20, -30])), -30);
        assert.equal(elevationChangeFt(profile([0, 10, 20, 30])), 30);
    });

    test('an empty profile degrades to zero rather than NaN', () => {
        assert.equal(elevationChangeFt(null), 0);
        assert.equal(elevationChangeFt({ elevFt: [] }), 0);
    });
});

describe('dominant feature', () => {
    test('a steady slope has no feature — it is all trend, no departure', () => {
        assert.equal(dominantFeature(profile(shaped(21, (t) => -40 * t))).kind, 'none');
    });

    test('a crest is found even when the hole is net flat', () => {
        // The case that motivates measuring departure from the chord
        // rather than net change: this hole starts and ends level and
        // still throws over a 30 ft rise.
        const f = dominantFeature(profile(shaped(21, (t) => 30 * Math.sin(Math.PI * t))));
        assert.equal(f.kind, 'crest');
        assert.ok(f.deviationFt > 25, `deviation was ${f.deviationFt}`);
        assert.ok(Math.abs(f.atFt - 150) < 40, `crest located at ${f.atFt} ft`);
    });

    test('a valley is found and signed the other way', () => {
        const f = dominantFeature(profile(shaped(21, (t) => -30 * Math.sin(Math.PI * t))));
        assert.equal(f.kind, 'valley');
        assert.ok(f.deviationFt < 0);
    });

    test('a bump below the threshold is not promoted to a feature', () => {
        const small = FEATURE_THRESHOLD_FT - 3;
        assert.equal(dominantFeature(profile(shaped(21, (t) => small * Math.sin(Math.PI * t)))).kind, 'none');
    });

    test('a feature is measured against the chord, not against the tee', () => {
        // Steadily downhill with a real shelf partway. Measured from the
        // tee every sample is "below"; only the chord reveals the shelf.
        const p = profile(shaped(21, (t) => -60 * t + 18 * Math.sin(Math.PI * t)));
        const f = dominantFeature(p);
        assert.equal(f.kind, 'crest', 'a shelf on a downslope is still a rise to throw over');
    });
});

describe('basket visibility', () => {
    test('a flat hole is visible from the tee', () => {
        const v = basketVisibility(profile(new Array(21).fill(0)));
        assert.equal(v.visibleFromTee, true);
        assert.equal(v.blind, false);
        assert.equal(v.revealDistanceFt, 0);
    });

    test('a downhill hole is visible — the ground falls away from the line', () => {
        assert.equal(basketVisibility(profile(shaped(21, (t) => -50 * t))).visibleFromTee, true);
    });

    test('a ridge between tee and pin makes the hole blind', () => {
        // Level tee and pin with a 40 ft ridge at the midpoint. The sight
        // line from the tee runs near flat, so the ridge plainly blocks.
        const e = new Array(21).fill(0);
        for (let i = 8; i <= 12; i++) e[i] = 40;
        const v = basketVisibility(profile(e));

        assert.equal(v.visibleFromTee, false);
        assert.equal(v.blind, true);
        assert.ok(v.revealDistanceFt > 0, 'a blind hole must say where the pin appears');
        assert.ok(v.revealDistanceFt <= 300);
    });

    test('the pin reappears past the ridge, not at the pin itself', () => {
        const e = new Array(21).fill(0);
        for (let i = 5; i <= 7; i++) e[i] = 30;
        const v = basketVisibility(profile(e));
        assert.ok(v.revealDistanceFt > 0 && v.revealDistanceFt < 300,
            `reveal at ${v.revealDistanceFt} should be past the ridge but before the pin`);
    });

    test('an uphill pin above the brow is visible despite rising ground', () => {
        // Rising steadily to a pin that sits at the top: nothing is
        // between you and it, so a naive "ground is higher than me" test
        // would wrongly call this blind.
        assert.equal(basketVisibility(profile(shaped(21, (t) => 40 * t))).visibleFromTee, true);
    });

    test('a grazing sight line does not count as visible', () => {
        // Terrain exactly at the sight line clears by 0 ft. Grass, haze
        // and DEM error all exceed that, so it must read blind.
        const e = new Array(21).fill(0);
        e[10] = EYE_HEIGHT_FT + (BASKET_TOP_FT - EYE_HEIGHT_FT) * 0.5;
        assert.equal(basketVisibility(profile(e)).visibleFromTee, false);
    });

    test('a degenerate profile does not throw', () => {
        assert.doesNotThrow(() => basketVisibility(profile([0, 0])));
        assert.doesNotThrow(() => basketVisibility(null));
    });
});

describe('slope', () => {
    test('along-slope is positive uphill, negative downhill', () => {
        assert.ok(slopeAt(profile(shaped(21, (t) => 100 * t)), 150).alongDeg > 0);
        assert.ok(slopeAt(profile(shaped(21, (t) => -100 * t)), 150).alongDeg < 0);
    });

    test('a 45-degree slope reads as 45 degrees', () => {
        // rise == run per step.
        const s = slopeAt(profile([0, 15, 30, 45, 60], 15), 30);
        assert.ok(Math.abs(s.alongDeg - 45) < 0.01, `got ${s.alongDeg}`);
    });

    test('cross-slope is positive when the ground falls to the right', () => {
        const n = 21;
        const p = profile(new Array(n).fill(0), 15, {
            leftFt: new Array(n).fill(10),
            rightFt: new Array(n).fill(-10),
        });
        assert.ok(slopeAt(p, 150).crossDeg > 0, 'left high + right low must read as falling right');
    });

    test('unmeasured cross-slope is null, never zero', () => {
        // "Level" and "not measured" must not look the same to the UI.
        assert.equal(slopeAt(profile(new Array(21).fill(0)), 150).crossDeg, null);
    });

    test('cross-slope magnitude matches the sampling half-width', () => {
        const n = 21;
        const p = profile(new Array(n).fill(0), 15, {
            leftFt: new Array(n).fill(CROSS_SAMPLE_FT),
            rightFt: new Array(n).fill(-CROSS_SAMPLE_FT),
        });
        assert.ok(Math.abs(slopeAt(p, 150).crossDeg - 45) < 0.01);
    });

    test('landing slopes are reported at fractions, so they scale with the hole', () => {
        const short = landingSlopes(profile(new Array(21).fill(0), 10));
        const long = landingSlopes(profile(new Array(21).fill(0), 40));
        assert.equal(short.length, long.length);
        assert.ok(long.at(-1).distanceFt > short.at(-1).distanceFt);
    });
});

describe('the sentence a player reads', () => {
    test('a level hole says so instead of quoting a meaningless number', () => {
        assert.match(describeProfile(profile(new Array(21).fill(0))), /level/i);
    });

    test('a drop is described as a drop, rounded to 5 ft', () => {
        const s = describeProfile(profile(shaped(21, (t) => -42 * t)));
        assert.match(s, /drops/i);
        assert.match(s, /40 ft/, 'must round to a precision the DEM supports');
    });

    test('a crest is named before the net change', () => {
        // A rise to throw over changes how a hole is played more than a
        // net drop does, so it leads.
        const s = describeProfile(profile(shaped(21, (t) => 35 * Math.sin(Math.PI * t))));
        assert.match(s, /^Throws over a rise/);
    });

    test('no description invents precision the data cannot carry', () => {
        for (const t of [0.5, 1, 2]) {
            const s = describeProfile(profile(shaped(21, (x) => -37.3 * x * t)));
            assert.ok(!/\.\d/.test(s), `decimal precision leaked: "${s}"`);
        }
    });

    test('below the flat threshold nothing is claimed', () => {
        const s = describeProfile(profile(shaped(21, (t) => (FLAT_THRESHOLD_FT - 2) * t)));
        assert.match(s, /level/i);
    });
});

describe('readHole', () => {
    test('assembles the full report and marks it measured', () => {
        const r = readHole(profile(shaped(21, (t) => -30 * t)));
        assert.equal(r.measured, true, 'the UI must be able to distinguish this from simulation');
        assert.equal(r.lengthFt, 300);
        assert.ok(r.summary.length > 0);
        assert.ok(r.slopes.length > 0);
        assert.ok('visibility' in r && 'feature' in r);
    });

    test('an empty profile returns null rather than a report of zeros', () => {
        assert.equal(readHole(null), null);
        assert.equal(readHole({ elevFt: [] }), null);
    });
});

describe('geometry', () => {
    const tee = { lng: -118.17, lat: 34.20 };

    test('distance is symmetric and scales linearly', () => {
        const a = groundDistanceFt(tee, { lng: -118.17, lat: 34.201 });
        const b = groundDistanceFt({ lng: -118.17, lat: 34.201 }, tee);
        assert.ok(Math.abs(a - b) < 1e-6);
        const twice = groundDistanceFt(tee, { lng: -118.17, lat: 34.202 });
        assert.ok(Math.abs(twice - 2 * a) < 1, `${twice} should be about double ${a}`);
    });

    test('one degree of latitude is about 364,000 ft', () => {
        const d = groundDistanceFt(tee, { lng: -118.17, lat: 35.20 });
        assert.ok(Math.abs(d - 364000) < 500, `got ${d}`);
    });

    test('bearing is 0 north, 90 east', () => {
        assert.ok(Math.abs(bearingDeg(tee, { lng: -118.17, lat: 34.21 })) < 0.01);
        assert.ok(Math.abs(bearingDeg(tee, { lng: -118.16, lat: 34.20 }) - 90) < 0.01);
        assert.ok(Math.abs(bearingDeg(tee, { lng: -118.17, lat: 34.19 })) - 180 < 0.01);
    });

    test('longitude degrees shrink with latitude', () => {
        const atEquator = groundDistanceFt({ lng: 0, lat: 0 }, { lng: 1, lat: 0 });
        const atSixty = groundDistanceFt({ lng: 0, lat: 60 }, { lng: 1, lat: 60 });
        assert.ok(Math.abs(atSixty / atEquator - 0.5) < 0.01, 'cos(60) = 0.5');
    });
});
