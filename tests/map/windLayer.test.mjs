/**
 * Tests for the wind streak field — src/map/windLayer.js
 *
 * THE ONE THAT MATTERS: streaks must travel the way the air travels.
 * `windFromDeg` is the bearing wind blows FROM, so a north wind moves
 * SOUTHWARD. Getting that backwards is the classic error in every wind
 * visualisation, it is invisible on a symmetric hole, and it would put
 * the picture on the map in direct contradiction with the "headwind on
 * this hole" line in the wind panel.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
    STREAK_SPACING_M, MAX_STREAKS, CALM_MPS, DASH_SEQUENCE,
    WIND_SOURCE, WIND_LAYER,
    windFieldGeoJSON, windLayerSpec, windSourceSpec,
    dashStepsPerSecond, streakPaint, shouldShowWind,
} from '../../src/map/windLayer.js';

const BOUNDS = { west: -118.175, south: 34.197, east: -118.163, north: 34.205 };

/** Bearing of a line's first→last coordinate, 0 = north, 90 = east. */
function lineBearing(feature) {
    const [[lng0, lat0], [lng1, lat1]] = feature.geometry.coordinates;
    const midLat = (lat0 + lat1) / 2;
    const dE = (lng1 - lng0) * Math.cos(midLat * Math.PI / 180);
    const dN = lat1 - lat0;
    return ((Math.atan2(dE, dN) * 180) / Math.PI + 360) % 360;
}

const angleGap = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

describe('the streaks travel downwind', () => {
    test('a north wind flows south', () => {
        // The load-bearing assertion. from=0 (north wind) must draw
        // lines running toward 180.
        const fc = windFieldGeoJSON(BOUNDS, 0);
        assert.ok(fc.features.length > 0);
        assert.ok(angleGap(lineBearing(fc.features[0]), 180) < 1);
    });

    test('a west wind flows east', () => {
        const fc = windFieldGeoJSON(BOUNDS, 270);
        assert.ok(angleGap(lineBearing(fc.features[0]), 90) < 1);
    });

    test('every bearing produces flow 180° from where it came', () => {
        for (const from of [0, 45, 90, 135, 180, 225, 270, 315, 359]) {
            const fc = windFieldGeoJSON(BOUNDS, from);
            const got = lineBearing(fc.features[0]);
            assert.ok(angleGap(got, (from + 180) % 360) < 1,
                `from ${from}° flowed toward ${got.toFixed(1)}°`);
        }
    });

    test('all streaks in one field are parallel', () => {
        // A uniform field is the honest depiction of a single measured
        // vector; any spread would be invented structure.
        const fc = windFieldGeoJSON(BOUNDS, 210);
        const first = lineBearing(fc.features[0]);
        for (const f of fc.features) {
            assert.ok(angleGap(lineBearing(f), first) < 1, 'streaks diverged');
        }
    });
});

describe('coverage', () => {
    test('the field spans the bounds it was given', () => {
        const fc = windFieldGeoJSON(BOUNDS, 45);
        const lngs = fc.features.flatMap((f) => f.geometry.coordinates.map((c) => c[0]));
        const lats = fc.features.flatMap((f) => f.geometry.coordinates.map((c) => c[1]));
        assert.ok(Math.min(...lngs) <= BOUNDS.west, 'left edge uncovered');
        assert.ok(Math.max(...lngs) >= BOUNDS.east, 'right edge uncovered');
        assert.ok(Math.min(...lats) <= BOUNDS.south, 'bottom edge uncovered');
        assert.ok(Math.max(...lats) >= BOUNDS.north, 'top edge uncovered');
    });

    test('streaks are long enough to cross the view at any angle', () => {
        // The tight case is a diagonal wind. Sizing the field from width
        // or height alone leaves the far corners bare — and a bounding
        // box check misses it, because the perpendicular spread of the
        // lines widens the box even when every line is too short. So
        // measure the property directly: project the endpoints onto the
        // flow axis and require that span to cover the bounds diagonal.
        const midLat = (BOUNDS.south + BOUNDS.north) / 2;
        const mLng = 111320 * Math.cos(midLat * Math.PI / 180);
        const diagM = Math.hypot(
            (BOUNDS.east - BOUNDS.west) * mLng,
            (BOUNDS.north - BOUNDS.south) * 111320,
        );

        for (const from of [0, 45, 90, 135]) {
            const flow = (from + 180) * Math.PI / 180;
            const ax = Math.sin(flow);
            const ay = Math.cos(flow);
            const fc = windFieldGeoJSON(BOUNDS, from);

            let min = Infinity;
            let max = -Infinity;
            for (const f of fc.features) {
                for (const [lng, lat] of f.geometry.coordinates) {
                    const xM = (lng - (BOUNDS.west + BOUNDS.east) / 2) * mLng;
                    const yM = (lat - midLat) * 111320;
                    const along = xM * ax + yM * ay;
                    min = Math.min(min, along);
                    max = Math.max(max, along);
                }
            }
            assert.ok(max - min >= diagM,
                `from ${from}°: streaks span ${(max - min).toFixed(0)} m, need ${diagM.toFixed(0)} m`);
        }
    });

    test('a wider view does not produce unbounded geometry', () => {
        const huge = { west: -120, south: 30, east: -110, north: 40 };
        assert.ok(windFieldGeoJSON(huge, 90).features.length <= MAX_STREAKS + 1);
    });

    test('spacing is honoured', () => {
        const tight = windFieldGeoJSON(BOUNDS, 0, { spacingM: STREAK_SPACING_M / 2 });
        const loose = windFieldGeoJSON(BOUNDS, 0, { spacingM: STREAK_SPACING_M * 2 });
        assert.ok(tight.features.length > loose.features.length);
    });
});

describe('bad input draws nothing rather than something wrong', () => {
    test('missing or non-finite bounds yield an empty field', () => {
        for (const b of [null, undefined, {}, { west: NaN, south: 0, east: 1, north: 1 }]) {
            assert.deepEqual(windFieldGeoJSON(b, 90).features, []);
        }
    });

    test('a non-finite bearing yields an empty field', () => {
        assert.deepEqual(windFieldGeoJSON(BOUNDS, NaN).features, []);
        assert.deepEqual(windFieldGeoJSON(BOUNDS, undefined).features, []);
    });

    test('degenerate bounds do not divide by zero', () => {
        const pt = { west: -118, south: 34, east: -118, north: 34 };
        assert.doesNotThrow(() => windFieldGeoJSON(pt, 90));
        assert.deepEqual(windFieldGeoJSON(pt, 90).features, []);
    });

    test('the output is valid GeoJSON', () => {
        const fc = windFieldGeoJSON(BOUNDS, 120);
        assert.equal(fc.type, 'FeatureCollection');
        for (const f of fc.features) {
            assert.equal(f.geometry.type, 'LineString');
            assert.equal(f.geometry.coordinates.length, 2);
            for (const [lng, lat] of f.geometry.coordinates) {
                assert.ok(Number.isFinite(lng) && Number.isFinite(lat));
                assert.ok(Math.abs(lat) <= 90, `latitude ${lat} out of range`);
            }
        }
    });
});

describe('when the layer draws at all', () => {
    test('no observation means unknown, not calm', () => {
        // Drawing a still field would assert something never measured.
        assert.equal(shouldShowWind(null), false);
        assert.equal(shouldShowWind(undefined), false);
        assert.equal(shouldShowWind({}), false);
    });

    test('genuine calm draws nothing either', () => {
        // Motionless streaks read as a broken animation, and the wind
        // panel already says "Calm" in words.
        assert.equal(shouldShowWind({ windSpeedMps: 0 }), false);
        assert.equal(shouldShowWind({ windSpeedMps: CALM_MPS }), false);
    });

    test('a real breeze draws', () => {
        assert.equal(shouldShowWind({ windSpeedMps: CALM_MPS + 0.1 }), true);
        assert.equal(shouldShowWind({ windSpeedMps: 9 }), true);
    });
});

describe('strength reads before you look at a number', () => {
    test('faster wind animates faster, within bounds', () => {
        assert.equal(dashStepsPerSecond(0), 0);
        assert.equal(dashStepsPerSecond(CALM_MPS), 0);
        assert.ok(dashStepsPerSecond(9) > dashStepsPerSecond(3));
        // Bounded at both ends: a static hatch is not wind, and a strobe
        // stops reading as direction.
        assert.ok(dashStepsPerSecond(60) <= 18);
        assert.ok(dashStepsPerSecond(1) >= 3);
    });

    test('faster wind is more visible, but never hides the fairway', () => {
        assert.ok(streakPaint(10).opacity > streakPaint(2).opacity);
        assert.ok(streakPaint(10).width > streakPaint(2).width);
        assert.ok(streakPaint(99).opacity < 0.6, 'streaks must stay a hint over imagery');
    });

    test('nonsense speeds do not produce nonsense paint', () => {
        for (const s of [NaN, undefined, -5]) {
            const p = streakPaint(s);
            assert.ok(Number.isFinite(p.opacity) && p.opacity > 0);
            assert.ok(Number.isFinite(p.width) && p.width > 0);
        }
    });
});

describe('layer wiring', () => {
    test('slot is present on Standard styles and absent on classic ones', () => {
        // A stray `slot` on a classic style is a spec violation, not a
        // harmless extra key — same rule as terrainLayers.js.
        assert.ok('slot' in windLayerSpec({ slots: true }));
        assert.ok(!('slot' in windLayerSpec({ slots: false })));
    });

    test('the layer points at the source this module owns', () => {
        const spec = windLayerSpec();
        assert.equal(spec.id, WIND_LAYER);
        assert.equal(spec.source, WIND_SOURCE);
        assert.equal(spec.type, 'line');
    });

    test('the dash sequence is a real cycle', () => {
        // Motion comes from stepping these; duplicates would stutter.
        assert.ok(DASH_SEQUENCE.length >= 4);
        const seen = new Set(DASH_SEQUENCE.map((d) => d.join(',')));
        assert.equal(seen.size, DASH_SEQUENCE.length, 'duplicate dash patterns');
        for (const d of DASH_SEQUENCE) {
            assert.ok(d.every((n) => Number.isFinite(n) && n >= 0));
        }
    });

    test('the source spec carries the generated field', () => {
        const src = windSourceSpec(BOUNDS, 90);
        assert.equal(src.type, 'geojson');
        assert.ok(src.data.features.length > 0);
    });
});
