/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  TruArc — In-App Course Editor: Export/Import/Merge (Section 5)  ║
 * ╚══════════════════════════════════════════════════════════════════╗
 *
 * Turns a holeEditState.js reducer state into portable JSON (export),
 * turns portable JSON back into loadable edit data (import), and merges
 * an edit onto a base COURSE_DATABASE hole to produce the hole the rest
 * of the app actually renders/simulates against (merge).
 */

import {
    normalizeHole, getHoleBearing, DATA_QUALITY,
} from '../data/courses.js';
import { measure3DDistance } from '../utils/flightPhysics.js';

/**
 * Strips the reducer's in-progress-only fields (`history`,
 * `activePolygon`) — an unfinished OB polygon the user never closed
 * shouldn't be saved as course data.
 */
export function exportHoleEdit(state) {
    const {
        courseId, holeNum, tee, basket, obPolygons, mandos, dropzones,
    } = state;
    return {
        courseId, holeNum, tee, basket, obPolygons, mandos, dropzones,
    };
}

/**
 * Validates and normalizes an imported/loaded edit's shape. Throws on
 * structurally invalid input (missing courseId/holeNum, a tee/basket
 * that isn't a real {lng,lat} pair) rather than letting a malformed
 * import reach the reducer and produce NaN map coordinates. Array
 * fields default to empty rather than throwing when absent — an export
 * from before this session's editor existed, or a hand-written partial
 * JSON, shouldn't be rejected just for omitting OB/mando/dropzone data.
 */
export function importHoleEdit(json) {
    if (!json || typeof json !== 'object') {
        throw new Error('importHoleEdit: expected an object');
    }
    if (json.courseId == null || typeof json.courseId !== 'string') {
        throw new Error('importHoleEdit: missing or invalid "courseId"');
    }
    if (!Number.isFinite(json.holeNum)) {
        throw new Error('importHoleEdit: missing or invalid "holeNum"');
    }
    for (const key of ['tee', 'basket']) {
        const p = json[key];
        if (p != null && (!Number.isFinite(p.lng) || !Number.isFinite(p.lat))) {
            throw new Error(`importHoleEdit: "${key}" must be {lng, lat} with finite coordinates`);
        }
    }

    return {
        courseId: json.courseId,
        holeNum: json.holeNum,
        tee: json.tee || null,
        basket: json.basket || null,
        obPolygons: Array.isArray(json.obPolygons) ? json.obPolygons : [],
        mandos: Array.isArray(json.mandos) ? json.mandos : [],
        dropzones: Array.isArray(json.dropzones) ? json.dropzones : [],
    };
}

/**
 * Merges an edit onto a base (already-normalized) hole, returning a new
 * normalized hole — the shape the rest of the app (FlightStats,
 * MapCanvas, courseToGeoJSON) already knows how to render.
 *
 * `dataQuality` becomes `measured` ONLY when this edit supplies BOTH a
 * tee and a basket — a real placed pair, not an inference from
 * `basket` merely being present (it always is, inherited from the base
 * hole otherwise). An edit that only adds an OB polygon to an
 * otherwise-estimated hole must NOT silently upgrade that hole's
 * basket to "measured" — it didn't measure the basket, it drew a
 * polygon. `distanceFt`/`bearing` are recomputed from whichever
 * tee/basket ends up in effect whenever either one changed, so they
 * can't drift out of sync with the coordinates actually rendered.
 */
export function mergeHoleEdit(baseHole, edit) {
    const tee = edit.tee || baseHole.tee;
    const basket = edit.basket || baseHole.basket;
    const bothEdited = !!(edit.tee && edit.basket);
    const eitherChanged = !!(edit.tee || edit.basket);

    const candidate = {
        ...baseHole,
        tee,
        basket,
        obPolygons: edit.obPolygons?.length ? edit.obPolygons : baseHole.obPolygons,
        mandos: edit.mandos?.length ? edit.mandos : baseHole.mandos,
        dropzones: edit.dropzones?.length ? edit.dropzones : baseHole.dropzones,
        // Preserve the base hole's existing quality unless this edit
        // placed a full tee+basket pair — see the doc comment above for
        // why this must not be left to normalizeHole's own
        // basket-presence-implies-measured default.
        dataQuality: bothEdited ? DATA_QUALITY.MEASURED : baseHole.dataQuality,
    };

    if (eitherChanged) {
        candidate.distanceFt = measure3DDistance(tee, basket).distanceFt;
        candidate.bearing = getHoleBearing({ tee, basket });
    }

    return normalizeHole(candidate);
}
