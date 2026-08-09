/**
 * Tests for the two calibration-offset helpers added alongside
 * TreeLayer/PointCloudLayer this session — applyOffsetToTrees and
 * applyOffsetToPointCloud. (The pre-existing GeoJSON/single-coordinate
 * functions in this module predate this test file and are exercised
 * indirectly through the app; not backfilled here to keep scope to what
 * changed.)
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { applyOffsetToTrees, applyOffsetToPointCloud } from '../../src/utils/calibrationOffset.js';

describe('applyOffsetToTrees', () => {
    const trees = [
        { lng: -71.896, lat: 42.2765, ground_elev_m: 137.0, height_m: 20, form: 'deciduous' },
        { lng: -71.895, lat: 42.2770, ground_elev_m: 140.0, height_m: 15, form: 'conifer' },
    ];

    test('shifts lng/lat/ground_elev_m by the offset', () => {
        const offset = { dLng: 0.001, dLat: -0.0005, dElev: 2.5 };
        const shifted = applyOffsetToTrees(trees, offset);
        assert.ok(Math.abs(shifted[0].lng - (-71.896 + 0.001)) < 1e-12);
        assert.ok(Math.abs(shifted[0].lat - (42.2765 - 0.0005)) < 1e-12);
        assert.ok(Math.abs(shifted[0].ground_elev_m - 139.5) < 1e-9);
    });

    test('leaves other fields (height_m, form) untouched', () => {
        const shifted = applyOffsetToTrees(trees, { dLng: 1, dLat: 1, dElev: 1 });
        assert.equal(shifted[0].height_m, 20);
        assert.equal(shifted[1].form, 'conifer');
    });

    test('does not mutate the input array', () => {
        const original = JSON.parse(JSON.stringify(trees));
        applyOffsetToTrees(trees, { dLng: 5, dLat: 5, dElev: 5 });
        assert.deepEqual(trees, original);
    });

    test('handles null/undefined trees gracefully', () => {
        assert.equal(applyOffsetToTrees(null, { dLng: 1, dLat: 1, dElev: 1 }), null);
    });
});

describe('applyOffsetToPointCloud', () => {
    function fakeDecoded() {
        return {
            count: 2,
            lng: Float64Array.from([-71.896, -71.895]),
            lat: Float64Array.from([42.2765, 42.2770]),
            altitudeM: Float32Array.from([137.0, 140.0]),
            classification: Uint8Array.from([5, 2]),
        };
    }

    test('shifts lng/lat/altitudeM by the offset', () => {
        const decoded = fakeDecoded();
        const offset = { dLng: 0.001, dLat: -0.0005, dElev: 2.5 };
        const shifted = applyOffsetToPointCloud(decoded, offset);
        assert.ok(Math.abs(shifted.lng[0] - (-71.896 + 0.001)) < 1e-9);
        assert.ok(Math.abs(shifted.lat[0] - (42.2765 - 0.0005)) < 1e-9);
        assert.ok(Math.abs(shifted.altitudeM[0] - 139.5) < 1e-4);
    });

    test('leaves classification untouched', () => {
        const decoded = fakeDecoded();
        const shifted = applyOffsetToPointCloud(decoded, { dLng: 1, dLat: 1, dElev: 1 });
        assert.deepEqual(Array.from(shifted.classification), [5, 2]);
    });

    test('does not mutate the input typed arrays', () => {
        const decoded = fakeDecoded();
        const originalLng = decoded.lng.slice();
        applyOffsetToPointCloud(decoded, { dLng: 5, dLat: 5, dElev: 5 });
        assert.deepEqual(Array.from(decoded.lng), Array.from(originalLng));
    });

    test('returns the same object reference when the offset is a no-op zero offset', () => {
        const decoded = fakeDecoded();
        const result = applyOffsetToPointCloud(decoded, { dLng: 0, dLat: 0, dElev: 0 });
        assert.equal(result, decoded, 'zero offset should skip copying entirely');
    });

    test('handles a missing offset object as a no-op', () => {
        const decoded = fakeDecoded();
        const result = applyOffsetToPointCloud(decoded, undefined);
        assert.equal(result, decoded);
    });
});
