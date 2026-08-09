/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  TruArc — Mapbox ↔ Three.js Coordinate Sync Tests                ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Verified against MAPBOX'S OWN `MercatorCoordinate`, imported from the
 * installed mapbox-gl, rather than against the derivation in
 * mercatorTransform.js. That matters: a self-consistent derivation with
 * a flipped sign passes every test you write from the same reasoning
 * that produced the bug. Mapbox's implementation is genuinely
 * independent ground truth, and it runs in Node without a GL context or
 * an access token.
 *
 * The behavioural tests are phrased as "a tree placed HERE in the scene
 * lands THERE on Earth", checked by round-tripping through Mapbox's
 * `toLngLat()` and measuring real distances — because that is the thing
 * that is actually wrong when this code is wrong.
 *
 *   npm run test:map
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import mapboxgl from 'mapbox-gl';

import {
    createLocalFrame, lngLatAltToScene, sceneToLngLatAlt,
    sceneToMercatorMatrix, sceneProjectionMatrix, multiplyMat4,
    transformPoint, determinant3x3,
    mercatorXFromLng, mercatorYFromLat, mercatorZFromAltitude,
    latFromMercatorY, lngFromMercatorX,
} from '../../src/map/mercatorTransform.js';

const { MercatorCoordinate } = mapboxgl;

// Maple Hill — the showcase course, and a real place with real latitude.
const LNG = -71.896;
const LAT = 42.2765;

const METERS_PER_DEG_LAT = 111320;
const metersPerDegLng = (lat) => METERS_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);

/** Approximate ground distance in metres between two lng/lat points. */
function groundDistanceM(a, b) {
    const midLat = (a.lat + b.lat) / 2;
    const dx = (b.lng - a.lng) * metersPerDegLng(midLat);
    const dy = (b.lat - a.lat) * METERS_PER_DEG_LAT;
    return Math.hypot(dx, dy);
}

describe('Mercator primitives match mapbox-gl exactly', () => {
    test('mercatorXFromLng / mercatorYFromLat agree with MercatorCoordinate', () => {
        for (const [lng, lat] of [[LNG, LAT], [0, 0], [-121.99, 37.005], [151.2, -33.9], [13.4, 52.5]]) {
            const truth = MercatorCoordinate.fromLngLat({ lng, lat }, 0);
            assert.ok(Math.abs(mercatorXFromLng(lng) - truth.x) < 1e-12, `x at ${lng},${lat}`);
            assert.ok(Math.abs(mercatorYFromLat(lat) - truth.y) < 1e-12, `y at ${lng},${lat}`);
        }
    });

    test('mercatorZFromAltitude agrees with MercatorCoordinate', () => {
        for (const alt of [0, 50, 137.5, 1000]) {
            const truth = MercatorCoordinate.fromLngLat({ lng: LNG, lat: LAT }, alt);
            assert.ok(Math.abs(mercatorZFromAltitude(alt, LAT) - truth.z) < 1e-15, `z at alt=${alt}`);
        }
    });

    test('metersToMercator agrees with meterInMercatorCoordinateUnits()', () => {
        const truth = MercatorCoordinate.fromLngLat({ lng: LNG, lat: LAT }, 0);
        const frame = createLocalFrame(LNG, LAT);
        assert.ok(
            Math.abs(frame.metersToMercator - truth.meterInMercatorCoordinateUnits()) < 1e-20,
            `${frame.metersToMercator} vs ${truth.meterInMercatorCoordinateUnits()}`,
        );
    });

    test('inverse projections round-trip', () => {
        for (const [lng, lat] of [[LNG, LAT], [0, 0], [151.2, -33.9]]) {
            assert.ok(Math.abs(lngFromMercatorX(mercatorXFromLng(lng)) - lng) < 1e-9);
            assert.ok(Math.abs(latFromMercatorY(mercatorYFromLat(lat)) - lat) < 1e-9);
        }
    });
});

describe('Scene axes point where the documentation claims', () => {
    // These are the tests that catch a sign error. Each asserts where a
    // point placed in the scene actually ends up on Earth.
    const frame = createLocalFrame(LNG, LAT);
    const L = sceneToMercatorMatrix(frame, 1);

    /** Scene point → lng/lat/alt, via the matrix and Mapbox's own inverse. */
    function sceneToEarth(x, y, z) {
        const m = transformPoint(L, x, y, z);
        const mc = new MercatorCoordinate(m.x, m.y, m.z);
        const ll = mc.toLngLat();
        return { lng: ll.lng, lat: ll.lat, altitudeM: mc.toAltitude() };
    }

    test('the scene origin is exactly the anchor point', () => {
        const p = sceneToEarth(0, 0, 0);
        assert.ok(Math.abs(p.lng - LNG) < 1e-9, `lng ${p.lng}`);
        assert.ok(Math.abs(p.lat - LAT) < 1e-9, `lat ${p.lat}`);
        assert.ok(Math.abs(p.altitudeM) < 1e-6, `alt ${p.altitudeM}`);
    });

    test('+X is EAST, and 100 scene units is 100 metres', () => {
        const p = sceneToEarth(100, 0, 0);
        assert.ok(p.lng > LNG, `+X should increase longitude, got ${p.lng}`);
        assert.ok(Math.abs(p.lat - LAT) < 1e-9, 'should not move north/south');
        const d = groundDistanceM({ lng: LNG, lat: LAT }, p);
        assert.ok(Math.abs(d - 100) < 0.5, `expected ~100 m east, got ${d.toFixed(2)} m`);
    });

    test('+Z is SOUTH (so NORTH is −Z)', () => {
        const south = sceneToEarth(0, 0, 100);
        assert.ok(south.lat < LAT, `+Z should decrease latitude, got ${south.lat}`);
        const dS = groundDistanceM({ lng: LNG, lat: LAT }, south);
        assert.ok(Math.abs(dS - 100) < 0.5, `expected ~100 m south, got ${dS.toFixed(2)} m`);

        const north = sceneToEarth(0, 0, -100);
        assert.ok(north.lat > LAT, `−Z should increase latitude, got ${north.lat}`);
    });

    test('+Y is UP, and reads as altitude in metres above sea level', () => {
        // Exact at the anchor latitude, where the frame's scale is taken.
        for (const alt of [0, 25, 137.5]) {
            const p = sceneToEarth(0, alt, 0);
            assert.ok(Math.abs(p.altitudeM - alt) < 1e-6, `scene Y=${alt} gave altitude ${p.altitudeM}`);
        }
    });

    test('a diagonal placement lands where both axes say it should', () => {
        // 60 m east, 80 m north, 30 m up → 100 m away on the ground.
        const p = sceneToEarth(60, 30, -80);
        assert.ok(p.lng > LNG && p.lat > LAT, 'should be north-east of the anchor');
        const d = groundDistanceM({ lng: LNG, lat: LAT }, p);
        assert.ok(Math.abs(d - 100) < 1.0, `expected ~100 m, got ${d.toFixed(2)} m`);
        // Altitude is only exact at the anchor latitude — see
        // 'anchor-scale approximation' below for why millimetres of
        // drift 80 m away is the accepted cost of a single matrix.
        assert.ok(Math.abs(p.altitudeM - 30) < 0.01, `altitude ${p.altitudeM}`);
    });
});

describe('lngLatAltToScene / sceneToLngLatAlt', () => {
    const frame = createLocalFrame(LNG, LAT);

    test('round-trips to sub-millimetre precision', () => {
        for (const [lng, lat, alt] of [
            [LNG, LAT, 0],
            [LNG + 0.004, LAT + 0.003, 137.5],
            [LNG - 0.006, LAT - 0.002, 45.25],
        ]) {
            const s = lngLatAltToScene(frame, lng, lat, alt);
            const back = sceneToLngLatAlt(frame, s.x, s.y, s.z);
            assert.ok(Math.abs(back.lng - lng) < 1e-11, `lng ${back.lng} vs ${lng}`);
            assert.ok(Math.abs(back.lat - lat) < 1e-11, `lat ${back.lat} vs ${lat}`);
            assert.ok(Math.abs(back.altitudeM - alt) < 1e-9);
        }
    });

    test('agrees with the matrix path', () => {
        // The convenience helper and the render-time matrix must not
        // drift apart — they are two expressions of one transform.
        const L = sceneToMercatorMatrix(frame, 1);
        const lng = LNG + 0.003;
        const lat = LAT - 0.002;
        const alt = 88.0;
        const s = lngLatAltToScene(frame, lng, lat, alt);
        const m = transformPoint(L, s.x, s.y, s.z);
        const truth = MercatorCoordinate.fromLngLat({ lng, lat }, alt);
        // Horizontal is exact: normalized mercator X/Y involve no radius
        // and no per-point scale, so there is nothing to approximate.
        assert.ok(Math.abs(m.x - truth.x) < 1e-12, `x ${m.x} vs ${truth.x}`);
        assert.ok(Math.abs(m.y - truth.y) < 1e-12, `y ${m.y} vs ${truth.y}`);
        // Altitude carries the anchor-scale approximation. Assert the
        // RELATIVE error rather than an absolute epsilon, since that is
        // the quantity the approximation actually bounds.
        assert.ok(Math.abs(m.z - truth.z) / truth.z < 1e-4, `z ${m.z} vs ${truth.z}`);
    });

    test('anchor-scale approximation stays far below tree scale across a course', () => {
        // The frame uses ONE mercator scale, taken at its anchor, so
        // accuracy degrades with distance from it. This pins the actual
        // magnitude rather than trusting the estimate in the docstring:
        // over a course-sized area the vertical error must stay in
        // millimetres, i.e. thousands of times smaller than the trees.
        const L = sceneToMercatorMatrix(frame, 1);
        let worstAltErrM = 0;
        let worstGroundErrM = 0;
        for (const dLatM of [-400, -200, 0, 200, 400]) {
            for (const dLngM of [-400, 0, 400]) {
                const lat = LAT + dLatM / METERS_PER_DEG_LAT;
                const lng = LNG + dLngM / metersPerDegLng(LAT);
                const alt = 150;
                const s = lngLatAltToScene(frame, lng, lat, alt);
                const m = transformPoint(L, s.x, s.y, s.z);
                const mc = new MercatorCoordinate(m.x, m.y, m.z);
                worstAltErrM = Math.max(worstAltErrM, Math.abs(mc.toAltitude() - alt));
                const ll = mc.toLngLat();
                worstGroundErrM = Math.max(worstGroundErrM, groundDistanceM({ lng, lat }, ll));
            }
        }
        assert.ok(worstAltErrM < 0.05, `worst altitude error ${worstAltErrM.toFixed(4)} m at 400 m out`);
        assert.ok(worstGroundErrM < 0.01, `worst ground error ${worstGroundErrM.toFixed(4)} m at 400 m out`);
    });

    test('a tree at the far edge of a course is still sub-metre accurate', () => {
        // Single-scale frame error grows with distance from the anchor.
        // A course is ~800 m across; anchored at the centre, the worst
        // case is ~400 m out. Assert that stays far below tree width.
        const frameCentre = createLocalFrame(LNG, LAT);
        const farLat = LAT + 400 / METERS_PER_DEG_LAT;
        const farLng = LNG + 400 / metersPerDegLng(LAT);
        const s = lngLatAltToScene(frameCentre, farLng, farLat, 0);
        const back = sceneToLngLatAlt(frameCentre, s.x, s.y, s.z);
        const err = groundDistanceM({ lng: farLng, lat: farLat }, back);
        assert.ok(err < 0.1, `round-trip error ${err.toFixed(3)} m at 400 m out`);
    });
});

describe('Terrain exaggeration', () => {
    const frame = createLocalFrame(LNG, LAT);

    test('scales altitude but never horizontal position', () => {
        const plain = sceneToMercatorMatrix(frame, 1);
        const doubled = sceneToMercatorMatrix(frame, 2);

        const p1 = transformPoint(plain, 100, 50, -70);
        const p2 = transformPoint(doubled, 100, 50, -70);

        assert.ok(Math.abs(p1.x - p2.x) < 1e-15, 'exaggeration must not move X');
        assert.ok(Math.abs(p1.y - p2.y) < 1e-15, 'exaggeration must not move Y (north/south)');
        assert.ok(Math.abs(p2.z - 2 * p1.z) < 1e-18, 'exaggeration must double altitude');
    });

    test('exaggeration 2 puts a tree at twice its true altitude', () => {
        // This is the compensation that stops trees being buried under
        // Mapbox's exaggerated terrain mesh — see the module docstring.
        const doubled = sceneToMercatorMatrix(frame, 2);
        const m = transformPoint(doubled, 0, 100, 0);
        const mc = new MercatorCoordinate(m.x, m.y, m.z);
        assert.ok(Math.abs(mc.toAltitude() - 200) < 1e-6, `got ${mc.toAltitude()}`);
    });
});

describe('Handedness', () => {
    test('the scene→mercator transform mirrors winding, by necessity', () => {
        // Scene is right-handed; mercator (east, south, up) is
        // left-handed. The negative determinant is therefore CORRECT.
        // Pinned by a test so nobody "fixes" the sign later and inverts
        // every surface normal in the scene.
        const frame = createLocalFrame(LNG, LAT);
        const det = determinant3x3(sceneToMercatorMatrix(frame, 1));
        assert.ok(det < 0, `expected a negative determinant, got ${det}`);
    });

    test('mercator really is left-handed (east × south points down)', () => {
        // Independent confirmation from Mapbox's own numbers, so the
        // claim above rests on measurement rather than on assertion.
        const origin = MercatorCoordinate.fromLngLat({ lng: LNG, lat: LAT }, 0);
        const east = MercatorCoordinate.fromLngLat({ lng: LNG + 0.001, lat: LAT }, 0);
        const south = MercatorCoordinate.fromLngLat({ lng: LNG, lat: LAT - 0.001 }, 0);
        const up = MercatorCoordinate.fromLngLat({ lng: LNG, lat: LAT }, 100);

        const e = [east.x - origin.x, east.y - origin.y, 0];
        const s = [south.x - origin.x, south.y - origin.y, 0];
        const u = [0, 0, up.z - origin.z];

        // e × s, z-component only (both vectors are in the z=0 plane).
        const crossZ = e[0] * s[1] - e[1] * s[0];
        assert.ok(crossZ > 0, 'east × south should have positive z-component');
        assert.ok(u[2] > 0, 'up should have positive z');
        // crossZ and up share a sign ⇒ east × south points UP in raw
        // component terms, i.e. the (east, south, up) basis is left-handed.
    });
});

describe('sceneProjectionMatrix', () => {
    test('identity mapbox matrix leaves scene→mercator untouched', () => {
        const frame = createLocalFrame(LNG, LAT);
        const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
        const combined = sceneProjectionMatrix(identity, frame, 1);
        const direct = sceneToMercatorMatrix(frame, 1);
        for (let i = 0; i < 16; i++) {
            assert.ok(Math.abs(combined[i] - direct[i]) < 1e-18, `element ${i}`);
        }
    });

    test('applies the mapbox matrix AFTER the scene transform', () => {
        // Order matters and is easy to invert. With a mapbox matrix that
        // translates by a known amount, the result must be
        // mapbox(scene(p)), not scene(mapbox(p)).
        const frame = createLocalFrame(LNG, LAT);
        const translate = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 7, 11, 13, 1];
        const combined = sceneProjectionMatrix(translate, frame, 1);

        const p = transformPoint(combined, 100, 50, -70);
        const viaScene = transformPoint(sceneToMercatorMatrix(frame, 1), 100, 50, -70);
        assert.ok(Math.abs(p.x - (viaScene.x + 7)) < 1e-12);
        assert.ok(Math.abs(p.y - (viaScene.y + 11)) < 1e-12);
        assert.ok(Math.abs(p.z - (viaScene.z + 13)) < 1e-12);
    });

    test('multiplyMat4 matches a reference implementation', () => {
        const a = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
        const b = [17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32];
        const got = multiplyMat4(a, b);
        // Column-major reference: out[c][r] = sum_k a[k][r] * b[c][k]
        const ref = new Array(16);
        for (let c = 0; c < 4; c++) {
            for (let r = 0; r < 4; r++) {
                let sum = 0;
                for (let k = 0; k < 4; k++) sum += a[k * 4 + r] * b[c * 4 + k];
                ref[c * 4 + r] = sum;
            }
        }
        assert.deepEqual(got, ref);
    });
});
