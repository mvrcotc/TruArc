/**
 * Tests for src/physics/voxelGridFormat.js — decoding
 * tools/lidar_pipeline/voxelgrid.py's binary voxel grid format and
 * georeferenced world→grid coordinate conversion.
 *
 * The binary fixture is REAL bytes captured from the actual Python
 * packer (regenerated twice independently to confirm determinism
 * before being pasted here — see the git history of this file's
 * introduction for the exact capture commands), not a hand-encoded
 * buffer. The header JSON is likewise real `compute_georeference()`
 * output, not hand-computed — this suite exists specifically to catch
 * disagreement between the JS math and the Python math, so trusting the
 * JS side's own understanding of what the numbers "should" be would
 * defeat the point.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
    parseVoxelGridHeader, decodeVoxelGridBinary, isOccupied,
} from '../../src/physics/voxelGridFormat.js';

// Captured via:
//   python3 -c "
//   import numpy as np, base64, json
//   from tools.lidar_pipeline.voxelgrid import VoxelGridHeader, pack_voxel_grid, compute_georeference
//   nx, ny, nz = 4, 3, 5
//   occ = np.zeros((nx, ny, nz), dtype=bool)
//   occ[2, 1, 3] = True; occ[0, 0, 0] = True; occ[3, 2, 4] = True
//   packed = pack_voxel_grid(occ)
//   import pyproj
//   to_utm = pyproj.Transformer.from_crs('EPSG:4326', 'EPSG:32619', always_xy=True)
//   ox, oy = to_utm.transform(-71.896, 42.2765)
//   header = VoxelGridHeader(ox, oy, 137.0, 1.0, nx, ny, nz, 'EPSG:32619')
//   geo = compute_georeference(header)
//   print(base64.b64encode(packed).decode())
//   print(json.dumps({**header.to_dict(), 'georeference': geo}))
//   "
// Occupied cells by construction: (2,1,3), (0,0,0), (3,2,4). Dims 4x3x5.
const REAL_PACKED_B64 = 'VFZPWAE8AAAAgAAAAAIAABA=';
const REAL_HEADER_JSON = {
    origin: [261191.4393269105, 4684538.24189523, 137.0],
    cellM: 1.0,
    dims: [4, 3, 5],
    workingCrs: 'EPSG:32619',
    georeference: {
        originLng: -71.896,
        originLat: 42.276500000000006,
        xAxisBearingDeg: 88.04413890905988,
        yAxisBearingDeg: 358.0580445834481,
    },
};

function base64ToArrayBuffer(b64) {
    const binary = Buffer.from(b64, 'base64');
    return binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength);
}

describe('decodeVoxelGridBinary + isOccupied against real Python-packed bytes', () => {
    const buffer = base64ToArrayBuffer(REAL_PACKED_B64);
    const decoded = decodeVoxelGridBinary(buffer);
    const header = parseVoxelGridHeader(REAL_HEADER_JSON);

    test('decodes the correct bit count', () => {
        assert.equal(decoded.bitCount, 4 * 3 * 5);
    });

    test('the three cells occupied at construction time read as occupied', () => {
        assert.equal(isOccupied(decoded, header, 2, 1, 3), true);
        assert.equal(isOccupied(decoded, header, 0, 0, 0), true);
        assert.equal(isOccupied(decoded, header, 3, 2, 4), true);
    });

    test('a sample of cells NOT set at construction time read as unoccupied', () => {
        assert.equal(isOccupied(decoded, header, 1, 1, 1), false);
        assert.equal(isOccupied(decoded, header, 3, 0, 0), false);
        assert.equal(isOccupied(decoded, header, 0, 2, 4), false);
        assert.equal(isOccupied(decoded, header, 2, 1, 4), false); // adjacent to a true cell
    });

    test('every cell in the grid decodes to exactly the 3 expected occupied and rest false', () => {
        let count = 0;
        for (let ix = 0; ix < 4; ix++) {
            for (let iy = 0; iy < 3; iy++) {
                for (let iz = 0; iz < 5; iz++) {
                    if (isOccupied(decoded, header, ix, iy, iz)) count++;
                }
            }
        }
        assert.equal(count, 3);
    });

    test('out-of-bounds indices are unoccupied, not an error', () => {
        assert.equal(isOccupied(decoded, header, -1, 0, 0), false);
        assert.equal(isOccupied(decoded, header, 4, 0, 0), false);
        assert.equal(isOccupied(decoded, header, 0, 0, 100), false);
    });
});

describe('decodeVoxelGridBinary error handling', () => {
    test('rejects bad magic', () => {
        const buf = new ArrayBuffer(9);
        assert.throws(() => decodeVoxelGridBinary(buf), /bad magic/);
    });

    test('rejects a body length mismatch', () => {
        const buffer = base64ToArrayBuffer(REAL_PACKED_B64);
        assert.throws(() => decodeVoxelGridBinary(buffer.slice(0, buffer.byteLength - 1)), /expected/);
    });
});

describe('parseVoxelGridHeader / worldToGridXY against real georeference output', () => {
    const header = parseVoxelGridHeader(REAL_HEADER_JSON);

    test('rejects a header with no georeference block', () => {
        const { georeference, ...withoutGeo } = REAL_HEADER_JSON;
        assert.throws(() => parseVoxelGridHeader(withoutGeo), /georeference/);
    });

    test('the origin lng/lat maps to grid-local (0, 0)', () => {
        const { x, y } = header.worldToGridXY(REAL_HEADER_JSON.georeference.originLng, REAL_HEADER_JSON.georeference.originLat);
        assert.ok(Math.abs(x) < 1e-6, `x=${x}`);
        assert.ok(Math.abs(y) < 1e-6, `y=${y}`);
    });

    test('a point 100m east-ish of origin (the georeference baseline) maps near grid x=100', () => {
        // The Python side computed xAxisBearingDeg from a point 100m
        // along the grid's own +X at the ORIGINAL working-CRS location —
        // reprojecting that exact geometry here should recover x≈100, y≈0.
        // Reconstruct that reference point in lng/lat via the bearing Python measured.
        const bearingRad = REAL_HEADER_JSON.georeference.xAxisBearingDeg * Math.PI / 180;
        const latMid = REAL_HEADER_JSON.georeference.originLat; // small baseline, negligible mid-lat drift
        const metersPerDegLat = 111320;
        const metersPerDegLng = metersPerDegLat * Math.cos(latMid * Math.PI / 180);
        const dEast = 100 * Math.sin(bearingRad);
        const dNorth = 100 * Math.cos(bearingRad);
        const lng = REAL_HEADER_JSON.georeference.originLng + dEast / metersPerDegLng;
        const lat = REAL_HEADER_JSON.georeference.originLat + dNorth / metersPerDegLat;

        const { x, y } = header.worldToGridXY(lng, lat);
        assert.ok(Math.abs(x - 100) < 0.01, `x=${x}, expected ~100`);
        assert.ok(Math.abs(y - 0) < 0.01, `y=${y}, expected ~0`);
    });

    test('a point 100m north-ish of origin (the Y-axis baseline) maps near grid y=100', () => {
        const bearingRad = REAL_HEADER_JSON.georeference.yAxisBearingDeg * Math.PI / 180;
        const metersPerDegLat = 111320;
        const metersPerDegLng = metersPerDegLat * Math.cos(REAL_HEADER_JSON.georeference.originLat * Math.PI / 180);
        const dEast = 100 * Math.sin(bearingRad);
        const dNorth = 100 * Math.cos(bearingRad);
        const lng = REAL_HEADER_JSON.georeference.originLng + dEast / metersPerDegLng;
        const lat = REAL_HEADER_JSON.georeference.originLat + dNorth / metersPerDegLat;

        const { x, y } = header.worldToGridXY(lng, lat);
        assert.ok(Math.abs(x - 0) < 0.01, `x=${x}, expected ~0`);
        assert.ok(Math.abs(y - 100) < 0.01, `y=${y}, expected ~100`);
    });

    test('cellAt matches the header dims and cell size', () => {
        assert.deepEqual(header.cellAt(header.originX + 2.5, header.originY + 1.5, header.originZ + 3.5), [2, 1, 3]);
        assert.equal(header.cellAt(header.originX - 1, header.originY, header.originZ), null);
        assert.equal(header.cellAt(header.originX + 999, header.originY, header.originZ), null);
    });

    test('a naive (unrotated) world-to-grid conversion would be measurably wrong here', () => {
        // Sanity check that this fixture actually exercises the
        // convergence-angle correction and isn't accidentally testing a
        // near-zero-rotation case that would pass even with buggy math.
        const bearingDeviationDeg = Math.abs(REAL_HEADER_JSON.georeference.xAxisBearingDeg - 90);
        assert.ok(bearingDeviationDeg > 1, `fixture's convergence angle (${bearingDeviationDeg}°) is too small to be a meaningful test`);
    });
});
