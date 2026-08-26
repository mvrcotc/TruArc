/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  TruArc — Voxel Grid Decoder & Georeferencing (Section 4)        ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Decodes `{course}_voxels.bin` + its header JSON
 * (tools/lidar_pipeline/voxelgrid.py's `pack_voxel_grid`/
 * `write_voxel_grid`) and converts real-world lng/lat into the grid's
 * own local (x, y) metres — the coordinate space collision.js traverses.
 *
 * Binary format, verified byte-for-byte against real Python-packed
 * output (see tests/physics/voxelGridFormat.test.mjs, which decodes a
 * fixture captured from the actual packer): 4-byte magic "TVOX", uint8
 * version, uint32 bit-count (all little-endian), then the packed bits
 * themselves — `numpy.packbits`' default convention: row-major
 * (C-order) flatten of the (nx, ny, nz) array with Z varying fastest,
 * and within each byte, the first bit of the sequence is the byte's
 * MOST significant bit (confirmed empirically against numpy, not
 * assumed from documentation).
 *
 * ── WHY GEOREFERENCE, NOT JUST ORIGIN + CELL SIZE ───────────────────
 * The grid's `origin`/`cellM` are in `workingCrs` metres (a UTM zone,
 * typically) — but that CRS's +X/+Y axes are NOT exactly east/north.
 * They're rotated from true north by the projection's convergence
 * angle, which grows with distance from the projection's central
 * meridian. At Maple Hill's longitude this is about 2° — small-sounding,
 * but ~10 m of lateral error over a 300 m fairway if ignored, well past
 * a tree's crown radius. `voxelgrid.compute_georeference()` measures
 * this exactly (as a bearing, using the SAME flat-earth convention as
 * the rest of the app) and ships it in the header, so this module never
 * needs a reprojection library — only bearing + distance math, exactly
 * like mercatorTransform.js and flightPhysics.js already do.
 */

const METERS_PER_DEG_LAT = 111320;
const DEG_TO_RAD = Math.PI / 180;

function metersPerDegLng(latDeg) {
    return METERS_PER_DEG_LAT * Math.cos(latDeg * DEG_TO_RAD);
}

// ─── HEADER ────────────────────────────────────────────────────────

/**
 * @param {object} json Parsed `{course}_voxels_header.json`.
 * @returns Parsed header with a ready-to-use `worldToGrid(lng, lat)` fn.
 */
export function parseVoxelGridHeader(json) {
    const [originX, originY, originZ] = json.origin;
    const [nx, ny, nz] = json.dims;
    const geo = json.georeference;
    if (!geo) {
        throw new Error('parseVoxelGridHeader: missing "georeference" — regenerate with the current pipeline (voxelgrid.write_voxel_grid)');
    }

    // Grid axis unit vectors expressed in local east/north metres (the
    // SAME bearing convention as bearing_deg in geometry.py / the rest
    // of this app: 0=north, clockwise). xAxis ≈ (1,0)-ish (east),
    // yAxis ≈ (0,1)-ish (north), but not exactly — that's the whole
    // point of measuring them.
    const xBearing = geo.xAxisBearingDeg * DEG_TO_RAD;
    const yBearing = geo.yAxisBearingDeg * DEG_TO_RAD;
    const xAxisEN = [Math.sin(xBearing), Math.cos(xBearing)];
    const yAxisEN = [Math.sin(yBearing), Math.cos(yBearing)];

    // Invert the 2x2 basis [xAxisEN | yAxisEN] once, so worldToGrid is
    // a cheap matrix-vector multiply per trajectory point rather than a
    // linear solve every call.
    const det = xAxisEN[0] * yAxisEN[1] - yAxisEN[0] * xAxisEN[1];
    if (Math.abs(det) < 1e-9) {
        throw new Error('parseVoxelGridHeader: degenerate grid axes (xAxisBearingDeg and yAxisBearingDeg are parallel)');
    }
    const inv = [
        [yAxisEN[1] / det, -yAxisEN[0] / det],
        [-xAxisEN[1] / det, xAxisEN[0] / det],
    ];

    const header = {
        originX, originY, originZ,
        cellM: json.cellM,
        nx, ny, nz,
        workingCrs: json.workingCrs,
        georeference: geo,

        /**
         * Convert a real-world (lng, lat) into the grid's own local
         * (x, y) metres from its origin — the space `origin`/`cellM`
         * are defined in, correctly accounting for axis rotation.
         */
        worldToGridXY(lng, lat) {
            const latMid = (geo.originLat + lat) / 2;
            const east = (lng - geo.originLng) * metersPerDegLng(latMid);
            const north = (lat - geo.originLat) * METERS_PER_DEG_LAT;
            return {
                x: inv[0][0] * east + inv[0][1] * north,
                y: inv[1][0] * east + inv[1][1] * north,
            };
        },

        /** Grid cell [ix,iy,iz] containing local (x,y,z), or null if outside. */
        cellAt(x, y, z) {
            const ix = Math.floor((x - originX) / json.cellM);
            const iy = Math.floor((y - originY) / json.cellM);
            const iz = Math.floor((z - originZ) / json.cellM);
            if (ix < 0 || ix >= nx || iy < 0 || iy >= ny || iz < 0 || iz >= nz) return null;
            return [ix, iy, iz];
        },
    };
    return header;
}

// ─── BINARY DECODING ─────────────────────────────────────────────────

const MAGIC = 'TVOX';
const VERSION = 1;
const HEADER_BYTES = 9;

/**
 * @param {ArrayBuffer} buffer
 * @returns {{bitCount: number, bytes: Uint8Array}} `bytes` is the raw
 *   packed body — callers query it via `isOccupied()`, no full unpack,
 *   so memory stays at the packed size even for a multi-million-cell grid.
 */
export function decodeVoxelGridBinary(buffer) {
    const view = new DataView(buffer);
    const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
    if (magic !== MAGIC) throw new Error(`decodeVoxelGridBinary: bad magic "${magic}", expected "${MAGIC}"`);
    const version = view.getUint8(4);
    if (version !== VERSION) throw new Error(`decodeVoxelGridBinary: unsupported version ${version}`);
    const bitCount = view.getUint32(5, true);

    const expectedBytes = HEADER_BYTES + Math.ceil(bitCount / 8);
    if (buffer.byteLength !== expectedBytes) {
        throw new Error(`decodeVoxelGridBinary: buffer is ${buffer.byteLength} bytes, expected ${expectedBytes} for ${bitCount} bits`);
    }

    return { bitCount, bytes: new Uint8Array(buffer, HEADER_BYTES) };
}

/**
 * True if grid cell (ix, iy, iz) is occupied. Matches numpy.packbits'
 * flatten order exactly: flatIndex = ix*ny*nz + iy*nz + iz (Z fastest),
 * MSB-first within each byte.
 */
export function isOccupied(decoded, header, ix, iy, iz) {
    if (ix < 0 || ix >= header.nx || iy < 0 || iy >= header.ny || iz < 0 || iz >= header.nz) return false;
    const flatIndex = ix * header.ny * header.nz + iy * header.nz + iz;
    const byteIndex = flatIndex >> 3;
    const bitInByte = flatIndex & 7;
    return (decoded.bytes[byteIndex] & (0x80 >> bitInByte)) !== 0;
}
