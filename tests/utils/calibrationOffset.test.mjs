/**
 * Tests for the calibration-offset helpers added alongside
 * TreeLayer/PointCloudLayer (applyOffsetToTrees, applyOffsetToPointCloud)
 * and, for Section 4, applyOffsetToVoxelHeader. (The pre-existing
 * GeoJSON/single-coordinate functions in this module predate this test
 * file and are exercised indirectly through the app; not backfilled here
 * to keep scope to what changed.)
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { applyOffsetToTrees, applyOffsetToPointCloud, applyOffsetToVoxelHeader } from '../../src/utils/calibrationOffset.js';

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

describe('applyOffsetToVoxelHeader', () => {
    function fakeHeader() {
        return {
            origin: [261191.4393269105, 4684538.24189523, 137.0],
            cellM: 1.0,
            dims: [4, 3, 5],
            workingCrs: 'EPSG:32619',
            georeference: {
                originLng: -71.896,
                originLat: 42.2765,
                xAxisBearingDeg: 88.044,
                yAxisBearingDeg: 358.058,
            },
        };
    }

    test('shifts georeference.originLng/originLat and origin[2] (altitude) by the offset', () => {
        const header = fakeHeader();
        const offset = { dLng: 0.001, dLat: -0.0005, dElev: 2.5 };
        const shifted = applyOffsetToVoxelHeader(header, offset);
        assert.ok(Math.abs(shifted.georeference.originLng - (-71.896 + 0.001)) < 1e-12);
        assert.ok(Math.abs(shifted.georeference.originLat - (42.2765 - 0.0005)) < 1e-12);
        assert.ok(Math.abs(shifted.origin[2] - 139.5) < 1e-9);
    });

    test('leaves working-CRS origin[0]/origin[1] and axis bearings untouched', () => {
        const header = fakeHeader();
        const shifted = applyOffsetToVoxelHeader(header, { dLng: 1, dLat: 1, dElev: 1 });
        assert.equal(shifted.origin[0], header.origin[0]);
        assert.equal(shifted.origin[1], header.origin[1]);
        assert.equal(shifted.georeference.xAxisBearingDeg, header.georeference.xAxisBearingDeg);
        assert.equal(shifted.georeference.yAxisBearingDeg, header.georeference.yAxisBearingDeg);
    });

    test('does not mutate the input header', () => {
        const header = fakeHeader();
        const original = JSON.parse(JSON.stringify(header));
        applyOffsetToVoxelHeader(header, { dLng: 5, dLat: 5, dElev: 5 });
        assert.deepEqual(header, original);
    });

    test('returns the same object reference when the offset is a no-op zero offset', () => {
        const header = fakeHeader();
        const result = applyOffsetToVoxelHeader(header, { dLng: 0, dLat: 0, dElev: 0 });
        assert.equal(result, header);
    });

    test('handles a missing offset object and a null header as a no-op', () => {
        const header = fakeHeader();
        assert.equal(applyOffsetToVoxelHeader(header, undefined), header);
        assert.equal(applyOffsetToVoxelHeader(null, { dLng: 1, dLat: 1, dElev: 1 }), null);
    });
});
