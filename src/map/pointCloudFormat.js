/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  TruArc — Point Cloud Binary Decoder (Section 3, step 4)         ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Decodes `{course}_points.bin` — the "true view" export from
 * tools/lidar_pipeline/pointcloud_export.py's `pack_point_cloud()`.
 *
 * Header (9 bytes): 4-byte magic "TPTS", uint8 version, uint32 count
 * (all little-endian).
 * Per point (13 bytes): int32 lng-microdegrees, int32 lat-microdegrees,
 * uint8 classification, float32 altitude (metres) — little-endian,
 * unpadded (Python packs with struct format "<iiBf").
 *
 * Verified byte-for-byte against real Python-packed output, not just
 * against the struct format string — see
 * tests/map/pointCloudFormat.test.mjs, which decodes a fixture generated
 * by pack_point_cloud() itself.
 */

const MAGIC = 'TPTS';
const VERSION = 1;
const MICRODEG = 1_000_000;
const HEADER_BYTES = 9;
const POINT_STRIDE = 13;

/**
 * @param {ArrayBuffer} buffer
 * @returns {{count, lng: Float64Array, lat: Float64Array, altitudeM: Float32Array, classification: Uint8Array}}
 */
export function decodePointCloud(buffer) {
    const view = new DataView(buffer);
    const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
    if (magic !== MAGIC) {
        throw new Error(`decodePointCloud: bad magic "${magic}", expected "${MAGIC}"`);
    }
    const version = view.getUint8(4);
    if (version !== VERSION) {
        throw new Error(`decodePointCloud: unsupported version ${version}`);
    }
    const count = view.getUint32(5, true);

    const expectedBytes = HEADER_BYTES + count * POINT_STRIDE;
    if (buffer.byteLength !== expectedBytes) {
        throw new Error(`decodePointCloud: buffer is ${buffer.byteLength} bytes, expected ${expectedBytes} for ${count} points`);
    }

    const lng = new Float64Array(count);
    const lat = new Float64Array(count);
    const altitudeM = new Float32Array(count);
    const classification = new Uint8Array(count);

    for (let i = 0; i < count; i++) {
        const off = HEADER_BYTES + i * POINT_STRIDE;
        lng[i] = view.getInt32(off, true) / MICRODEG;
        lat[i] = view.getInt32(off + 4, true) / MICRODEG;
        classification[i] = view.getUint8(off + 8);
        altitudeM[i] = view.getFloat32(off + 9, true);
    }

    return { count, lng, lat, altitudeM, classification };
}
