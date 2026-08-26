/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  TruArc — In-App Course Editor: Hole Edit State (Section 5)      ║
 * ╚══════════════════════════════════════════════════════════════════╗
 *
 * A pure reducer for building up one hole's edit — tee/basket
 * placement, OB polygon drawing (click-to-add-vertex, then close),
 * mando points, dropzones — independent of Mapbox/React. The map-click
 * glue (MapCanvas.jsx, in 'edit' mode) only has to dispatch actions;
 * all the actual state logic — including undo — lives here where it's
 * testable without a GL context.
 *
 * This module does NOT know about Firestore or export/import JSON
 * shape — see courseEditExport.js for those, which both consume this
 * reducer's state shape (minus `history`/`activePolygon`, its two
 * purely-in-progress-editing-session fields).
 */

export const EDIT_ACTIONS = Object.freeze({
    SET_TEE: 'SET_TEE',
    SET_BASKET: 'SET_BASKET',
    START_OB_POLYGON: 'START_OB_POLYGON',
    ADD_OB_VERTEX: 'ADD_OB_VERTEX',
    FINISH_OB_POLYGON: 'FINISH_OB_POLYGON',
    CANCEL_OB_POLYGON: 'CANCEL_OB_POLYGON',
    REMOVE_OB_POLYGON: 'REMOVE_OB_POLYGON',
    ADD_MANDO: 'ADD_MANDO',
    REMOVE_MANDO: 'REMOVE_MANDO',
    ADD_DROPZONE: 'ADD_DROPZONE',
    REMOVE_DROPZONE: 'REMOVE_DROPZONE',
    UNDO: 'UNDO',
    RESET: 'RESET',
    LOAD: 'LOAD',
});

/**
 * @param {string} courseId
 * @param {number} holeNum
 * @param {object} [seed] - existing edit data to start from (e.g. a
 *   loaded Firestore doc or imported JSON) — {tee, basket, obPolygons,
 *   mandos, dropzones}. Defaults produce an empty edit.
 */
export function createEditState(courseId, holeNum, seed = {}) {
    return {
        courseId,
        holeNum,
        tee: seed.tee || null,
        basket: seed.basket || null,
        obPolygons: (seed.obPolygons || []).map((ring) => [...ring]),
        activePolygon: null,
        mandos: [...(seed.mandos || [])],
        dropzones: [...(seed.dropzones || [])],
        history: [],
    };
}

function snapshot(state) {
    const { history, ...rest } = state;
    return rest;
}

function pushHistory(state, changes) {
    return {
        ...state,
        ...changes,
        history: [...state.history, snapshot(state)],
    };
}

export function holeEditReducer(state, action) {
    switch (action.type) {
        case EDIT_ACTIONS.SET_TEE:
            return pushHistory(state, { tee: action.point });

        case EDIT_ACTIONS.SET_BASKET:
            return pushHistory(state, { basket: action.point });

        case EDIT_ACTIONS.START_OB_POLYGON:
            // Already drawing — a second START would silently discard
            // the in-progress vertices if it reset activePolygon, so
            // it's a no-op instead.
            if (state.activePolygon) return state;
            return pushHistory(state, { activePolygon: [] });

        case EDIT_ACTIONS.ADD_OB_VERTEX:
            if (!state.activePolygon) return state; // must START_OB_POLYGON first
            return pushHistory(state, { activePolygon: [...state.activePolygon, action.point] });

        case EDIT_ACTIONS.FINISH_OB_POLYGON: {
            if (!state.activePolygon || state.activePolygon.length < 3) return state;
            return pushHistory(state, {
                obPolygons: [...state.obPolygons, state.activePolygon],
                activePolygon: null,
            });
        }

        case EDIT_ACTIONS.CANCEL_OB_POLYGON:
            if (!state.activePolygon) return state;
            return pushHistory(state, { activePolygon: null });

        case EDIT_ACTIONS.REMOVE_OB_POLYGON:
            return pushHistory(state, {
                obPolygons: state.obPolygons.filter((_, i) => i !== action.index),
            });

        case EDIT_ACTIONS.ADD_MANDO:
            return pushHistory(state, {
                mandos: [...state.mandos, { point: action.point, direction: action.direction }],
            });

        case EDIT_ACTIONS.REMOVE_MANDO:
            return pushHistory(state, { mandos: state.mandos.filter((_, i) => i !== action.index) });

        case EDIT_ACTIONS.ADD_DROPZONE:
            return pushHistory(state, { dropzones: [...state.dropzones, action.point] });

        case EDIT_ACTIONS.REMOVE_DROPZONE:
            return pushHistory(state, { dropzones: state.dropzones.filter((_, i) => i !== action.index) });

        case EDIT_ACTIONS.UNDO: {
            if (state.history.length === 0) return state;
            const prev = state.history[state.history.length - 1];
            return { ...prev, history: state.history.slice(0, -1) };
        }

        case EDIT_ACTIONS.RESET:
            return createEditState(state.courseId, state.holeNum);

        case EDIT_ACTIONS.LOAD:
            return createEditState(state.courseId, state.holeNum, action.edit);

        default:
            return state;
    }
}
