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
