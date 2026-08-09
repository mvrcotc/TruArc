import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
    createEditState, holeEditReducer, EDIT_ACTIONS,
} from '../../src/editor/holeEditState.js';

const P = (lng, lat) => ({ lng, lat });

describe('createEditState', () => {
    test('empty by default', () => {
        const s = createEditState('maple-hill-gold', 2);
        assert.equal(s.courseId, 'maple-hill-gold');
        assert.equal(s.holeNum, 2);
        assert.equal(s.tee, null);
        assert.equal(s.basket, null);
        assert.deepEqual(s.obPolygons, []);
        assert.equal(s.activePolygon, null);
        assert.deepEqual(s.mandos, []);
        assert.deepEqual(s.dropzones, []);
        assert.deepEqual(s.history, []);
    });

    test('hydrates from a seed without aliasing the seed\'s arrays', () => {
        const seed = { tee: P(1, 2), obPolygons: [[P(1, 1), P(2, 2), P(3, 3)]], mandos: [{ point: P(0, 0), direction: 'left' }] };
        const s = createEditState('c', 1, seed);
        assert.deepEqual(s.tee, seed.tee);
        assert.deepEqual(s.obPolygons, seed.obPolygons);
        s.obPolygons[0].push(P(9, 9));
        assert.equal(seed.obPolygons[0].length, 3, 'mutating the state leaked back into the seed');
    });
});

describe('holeEditReducer — tee/basket', () => {
    test('SET_TEE and SET_BASKET place points', () => {
        let s = createEditState('c', 1);
        s = holeEditReducer(s, { type: EDIT_ACTIONS.SET_TEE, point: P(-71, 42) });
        assert.deepEqual(s.tee, P(-71, 42));
        s = holeEditReducer(s, { type: EDIT_ACTIONS.SET_BASKET, point: P(-71.001, 42.001) });
        assert.deepEqual(s.basket, P(-71.001, 42.001));
    });

    test('SET_TEE again moves (not adds to) the tee', () => {
        let s = createEditState('c', 1);
        s = holeEditReducer(s, { type: EDIT_ACTIONS.SET_TEE, point: P(1, 1) });
        s = holeEditReducer(s, { type: EDIT_ACTIONS.SET_TEE, point: P(2, 2) });
        assert.deepEqual(s.tee, P(2, 2));
    });
});

describe('holeEditReducer — OB polygon drawing', () => {
    test('the full draw sequence: start, add vertices, finish', () => {
        let s = createEditState('c', 1);
        s = holeEditReducer(s, { type: EDIT_ACTIONS.START_OB_POLYGON });
        assert.deepEqual(s.activePolygon, []);
        s = holeEditReducer(s, { type: EDIT_ACTIONS.ADD_OB_VERTEX, point: P(0, 0) });
        s = holeEditReducer(s, { type: EDIT_ACTIONS.ADD_OB_VERTEX, point: P(1, 0) });
        s = holeEditReducer(s, { type: EDIT_ACTIONS.ADD_OB_VERTEX, point: P(1, 1) });
        assert.equal(s.activePolygon.length, 3);
        s = holeEditReducer(s, { type: EDIT_ACTIONS.FINISH_OB_POLYGON });
        assert.equal(s.activePolygon, null);
        assert.equal(s.obPolygons.length, 1);
        assert.deepEqual(s.obPolygons[0], [P(0, 0), P(1, 0), P(1, 1)]);
    });

    test('ADD_OB_VERTEX without START is a no-op (does not crash, does not create a polygon)', () => {
        const s0 = createEditState('c', 1);
        const s1 = holeEditReducer(s0, { type: EDIT_ACTIONS.ADD_OB_VERTEX, point: P(0, 0) });
        assert.equal(s1, s0, 'expected the exact same state reference for a no-op');
    });

    test('FINISH_OB_POLYGON with fewer than 3 vertices is a no-op', () => {
        let s = createEditState('c', 1);
        s = holeEditReducer(s, { type: EDIT_ACTIONS.START_OB_POLYGON });
        s = holeEditReducer(s, { type: EDIT_ACTIONS.ADD_OB_VERTEX, point: P(0, 0) });
        s = holeEditReducer(s, { type: EDIT_ACTIONS.ADD_OB_VERTEX, point: P(1, 0) });
        const before = s;
        s = holeEditReducer(s, { type: EDIT_ACTIONS.FINISH_OB_POLYGON });
        assert.equal(s, before, 'a 2-vertex polygon should not have been finished');
        assert.equal(s.obPolygons.length, 0);
    });

    test('START_OB_POLYGON while already drawing does not discard in-progress vertices', () => {
        let s = createEditState('c', 1);
        s = holeEditReducer(s, { type: EDIT_ACTIONS.START_OB_POLYGON });
        s = holeEditReducer(s, { type: EDIT_ACTIONS.ADD_OB_VERTEX, point: P(5, 5) });
        const before = s;
        s = holeEditReducer(s, { type: EDIT_ACTIONS.START_OB_POLYGON });
        assert.equal(s, before);
        assert.deepEqual(s.activePolygon, [P(5, 5)]);
    });

    test('CANCEL_OB_POLYGON discards the in-progress polygon without touching completed ones', () => {
        let s = createEditState('c', 1);
        s = holeEditReducer(s, { type: EDIT_ACTIONS.START_OB_POLYGON });
        s = holeEditReducer(s, { type: EDIT_ACTIONS.ADD_OB_VERTEX, point: P(0, 0) });
        s = holeEditReducer(s, { type: EDIT_ACTIONS.CANCEL_OB_POLYGON });
        assert.equal(s.activePolygon, null);
        assert.equal(s.obPolygons.length, 0);
    });

    test('REMOVE_OB_POLYGON removes only the targeted polygon', () => {
        let s = createEditState('c', 1, { obPolygons: [[P(0, 0), P(1, 0), P(1, 1)], [P(2, 2), P(3, 2), P(3, 3)]] });
        s = holeEditReducer(s, { type: EDIT_ACTIONS.REMOVE_OB_POLYGON, index: 0 });
        assert.equal(s.obPolygons.length, 1);
        assert.deepEqual(s.obPolygons[0], [P(2, 2), P(3, 2), P(3, 3)]);
    });
});

describe('holeEditReducer — mandos and dropzones', () => {
    test('ADD_MANDO / REMOVE_MANDO', () => {
        let s = createEditState('c', 1);
        s = holeEditReducer(s, { type: EDIT_ACTIONS.ADD_MANDO, point: P(0, 0), direction: 'left' });
        assert.deepEqual(s.mandos, [{ point: P(0, 0), direction: 'left' }]);
        s = holeEditReducer(s, { type: EDIT_ACTIONS.REMOVE_MANDO, index: 0 });
        assert.deepEqual(s.mandos, []);
    });

    test('ADD_DROPZONE / REMOVE_DROPZONE', () => {
        let s = createEditState('c', 1);
        s = holeEditReducer(s, { type: EDIT_ACTIONS.ADD_DROPZONE, point: P(0, 0) });
        assert.deepEqual(s.dropzones, [P(0, 0)]);
        s = holeEditReducer(s, { type: EDIT_ACTIONS.REMOVE_DROPZONE, index: 0 });
        assert.deepEqual(s.dropzones, []);
    });
});

describe('holeEditReducer — UNDO', () => {
    test('undoes a single action back to the prior state', () => {
        let s = createEditState('c', 1);
        s = holeEditReducer(s, { type: EDIT_ACTIONS.SET_TEE, point: P(1, 1) });
        s = holeEditReducer(s, { type: EDIT_ACTIONS.UNDO });
        assert.equal(s.tee, null);
        assert.deepEqual(s.history, []);
    });

    test('undoes multiple actions in reverse order', () => {
        let s = createEditState('c', 1);
        s = holeEditReducer(s, { type: EDIT_ACTIONS.SET_TEE, point: P(1, 1) });
        s = holeEditReducer(s, { type: EDIT_ACTIONS.SET_TEE, point: P(2, 2) });
        s = holeEditReducer(s, { type: EDIT_ACTIONS.SET_BASKET, point: P(3, 3) });

        s = holeEditReducer(s, { type: EDIT_ACTIONS.UNDO });
        assert.deepEqual(s.tee, P(2, 2));
        assert.equal(s.basket, null);

        s = holeEditReducer(s, { type: EDIT_ACTIONS.UNDO });
        assert.deepEqual(s.tee, P(1, 1));

        s = holeEditReducer(s, { type: EDIT_ACTIONS.UNDO });
        assert.equal(s.tee, null);
    });

    test('UNDO on an empty history is a no-op', () => {
        const s0 = createEditState('c', 1);
        const s1 = holeEditReducer(s0, { type: EDIT_ACTIONS.UNDO });
        assert.equal(s1, s0);
    });

    test('undo/redo-style round trip returns to the exact original snapshot (minus history bookkeeping)', () => {
        const s0 = createEditState('c', 1);
        let s = s0;
        s = holeEditReducer(s, { type: EDIT_ACTIONS.SET_TEE, point: P(1, 1) });
        s = holeEditReducer(s, { type: EDIT_ACTIONS.ADD_DROPZONE, point: P(9, 9) });
        s = holeEditReducer(s, { type: EDIT_ACTIONS.UNDO });
        s = holeEditReducer(s, { type: EDIT_ACTIONS.UNDO });
        assert.deepEqual(s, s0);
    });

    test('a no-op action (e.g. ADD_OB_VERTEX without START) does not create an undoable history entry', () => {
        let s = createEditState('c', 1);
        s = holeEditReducer(s, { type: EDIT_ACTIONS.ADD_OB_VERTEX, point: P(0, 0) }); // no-op
        assert.deepEqual(s.history, []);
    });
});

describe('holeEditReducer — RESET and LOAD', () => {
    test('RESET clears all edit data but keeps courseId/holeNum', () => {
        let s = createEditState('c', 5);
        s = holeEditReducer(s, { type: EDIT_ACTIONS.SET_TEE, point: P(1, 1) });
        s = holeEditReducer(s, { type: EDIT_ACTIONS.RESET });
        assert.equal(s.courseId, 'c');
        assert.equal(s.holeNum, 5);
        assert.equal(s.tee, null);
        assert.deepEqual(s.history, []);
    });

    test('LOAD replaces the entire edit with the given data, discarding any in-progress polygon', () => {
        let s = createEditState('c', 5);
        s = holeEditReducer(s, { type: EDIT_ACTIONS.START_OB_POLYGON });
        s = holeEditReducer(s, { type: EDIT_ACTIONS.ADD_OB_VERTEX, point: P(0, 0) });
        s = holeEditReducer(s, {
            type: EDIT_ACTIONS.LOAD,
            edit: { tee: P(10, 10), basket: P(11, 11) },
        });
        assert.deepEqual(s.tee, P(10, 10));
        assert.deepEqual(s.basket, P(11, 11));
        assert.equal(s.activePolygon, null);
        assert.deepEqual(s.history, []);
    });
});
