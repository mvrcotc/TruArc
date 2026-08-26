/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  Calibration Offset Utility                                    ║
 * ║  Manual nudge for LiDAR ↔ Mapbox satellite alignment           ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * LiDAR data often has slight CRS misalignment with satellite imagery.
 * This utility provides storage and application of manual offsets in
 * EPSG:4326 coordinates (lat/lng delta + elevation delta).
 */

const STORAGE_KEY = 'truarc_calibration_offsets';

/**
 * Get stored calibration offset for a course
 * @param {string} courseId
 * @returns {{ dLng: number, dLat: number, dElev: number }}
 */
export function getCalibrationOffset(courseId) {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) return { dLng: 0, dLat: 0, dElev: 0 };
        const offsets = JSON.parse(stored);
        return offsets[courseId] || { dLng: 0, dLat: 0, dElev: 0 };
    } catch {
        return { dLng: 0, dLat: 0, dElev: 0 };
    }
}

/**
 * Save calibration offset for a course
 */
export function setCalibrationOffset(courseId, offset) {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        const offsets = stored ? JSON.parse(stored) : {};
        offsets[courseId] = { ...offset };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(offsets));
    } catch (e) {
        console.error('Failed to save calibration offset:', e);
    }
}

/**
 * Apply calibration offset to a single WGS84 coordinate
 */
export function applyOffset(coord, offset) {
    return {
        lng: coord.lng + (offset.dLng || 0),
        lat: coord.lat + (offset.dLat || 0),
        elevation: (coord.elevation || 0) + (offset.dElev || 0),
    };
}

/**
 * Apply calibration offset to a GeoJSON feature collection
 */
export function applyOffsetToGeoJSON(geojson, offset) {
    if (!geojson || !geojson.features) return geojson;

    return {
        ...geojson,
        features: geojson.features.map((feature) => {
            const geom = feature.geometry;
            if (!geom || !geom.coordinates) return feature;

            let newCoords;
            if (geom.type === 'Point') {
                newCoords = [
                    geom.coordinates[0] + (offset.dLng || 0),
                    geom.coordinates[1] + (offset.dLat || 0),
                    (geom.coordinates[2] || 0) + (offset.dElev || 0),
                ];
            } else if (geom.type === 'MultiPoint' || geom.type === 'LineString') {
                newCoords = geom.coordinates.map((c) => [
                    c[0] + (offset.dLng || 0),
                    c[1] + (offset.dLat || 0),
                    (c[2] || 0) + (offset.dElev || 0),
                ]);
            } else {
                newCoords = geom.coordinates;
            }

            return {
                ...feature,
                geometry: { ...geom, coordinates: newCoords },
            };
        }),
    };
}

/**
 * Apply a calibration offset to Section 2 TreeRecord-shaped objects
 * (lng, lat, ground_elev_m — not GeoJSON), used by TreeLayer.
 */
export function applyOffsetToTrees(trees, offset) {
    if (!trees) return trees;
    return trees.map((t) => {
        const shifted = applyOffset({ lng: t.lng, lat: t.lat, elevation: t.ground_elev_m }, offset);
        return { ...t, lng: shifted.lng, lat: shifted.lat, ground_elev_m: shifted.elevation };
    });
}

/**
 * Apply a calibration offset to a decoded point cloud (the shape
 * src/map/pointCloudFormat.js's `decodePointCloud` returns —
 * {count, lng, lat, altitudeM, classification} typed arrays), used by
 * PointCloudLayer. Offsetting after decode rather than threading the
 * offset through the binary decoder keeps that decoder a pure format
 * translation with nothing else to verify.
 */
export function applyOffsetToPointCloud(decoded, offset) {
    if (!decoded) return decoded;
    const dLng = offset?.dLng || 0;
    const dLat = offset?.dLat || 0;
    const dElev = offset?.dElev || 0;
    if (dLng === 0 && dLat === 0 && dElev === 0) return decoded;

    const lng = decoded.lng.slice();
    const lat = decoded.lat.slice();
    const altitudeM = decoded.altitudeM.slice();
    for (let i = 0; i < decoded.count; i++) {
        lng[i] += dLng;
        lat[i] += dLat;
        altitudeM[i] += dElev;
    }
    return { ...decoded, lng, lat, altitudeM };
}

/**
 * Apply a calibration offset to a voxel-grid header JSON
 * (voxelgrid.py's `write_voxel_grid` output — origin/dims/cellM plus a
 * `georeference` block; see src/physics/voxelGridFormat.js). Shifts the
 * SAME (dLng, dLat, dElev) applied to trees/point-cloud, so a hit-tested
 * flight trajectory (which is never itself calibration-shifted — it
 * comes from a real map click, not derived LiDAR) lines up with
 * wherever the calibrated trees actually render.
 *
 * Only `georeference.originLng/originLat` (used by `worldToGridXY` to
 * convert a real-world lng/lat into grid-local metres) and `origin[2]`
 * (the grid's absolute-altitude Z origin, the same quantity
 * `ground_elev_m` represents for trees) need shifting — the working-CRS
 * `origin[0]/origin[1]` metres and the axis bearings are untouched: they
 * only fix collision-space's numeric frame and the grid's rotation, both
 * independent of where in true lng/lat/altitude that frame sits.
 */
export function applyOffsetToVoxelHeader(headerJson, offset) {
    if (!headerJson) return headerJson;
    const dLng = offset?.dLng || 0;
    const dLat = offset?.dLat || 0;
    const dElev = offset?.dElev || 0;
    if (dLng === 0 && dLat === 0 && dElev === 0) return headerJson;

    const [ox, oy, oz] = headerJson.origin;
    return {
        ...headerJson,
        origin: [ox, oy, oz + dElev],
        georeference: {
            ...headerJson.georeference,
            originLng: headerJson.georeference.originLng + dLng,
            originLat: headerJson.georeference.originLat + dLat,
        },
    };
}

/**
 * Nudge offset by a step size (meters → degrees conversion)
 * @param {Object} currentOffset - Current offset
 * @param {'lng'|'lat'|'elev'} axis
 * @param {number} metersStep - Step in meters
 * @param {number} refLat - Reference latitude for lng conversion
 * @returns {Object} New offset
 */
export function nudgeOffset(currentOffset, axis, metersStep, refLat = 40) {
    const newOffset = { ...currentOffset };
    const METERS_PER_DEG_LAT = 111320;
    const metersPerDegLng = METERS_PER_DEG_LAT * Math.cos((refLat * Math.PI) / 180);

    if (axis === 'lng') newOffset.dLng += metersStep / metersPerDegLng;
    else if (axis === 'lat') newOffset.dLat += metersStep / METERS_PER_DEG_LAT;
    else if (axis === 'elev') newOffset.dElev += metersStep;

    return newOffset;
}
