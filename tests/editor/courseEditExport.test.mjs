import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { exportHoleEdit, importHoleEdit, mergeHoleEdit } from '../../src/editor/courseEditExport.js';
import { createEditState, holeEditReducer, EDIT_ACTIONS } from '../../src/editor/holeEditState.js';
import { normalizeHole, validateHole, DATA_QUALITY } from '../../src/data/courses.js';

const P = (lng, lat) => ({ lng, lat });

describe('exportHoleEdit', () => {
    test('strips history and activePolygon, keeps everything else', () => {
        let s = createEditState('maple-hill-gold', 2);
        s = holeEditReducer(s, { type: EDIT_ACTIONS.SET_TEE, point: P(-71.895, 42.276) });
        s = holeEditReducer(s, { type: EDIT_ACTIONS.START_OB_POLYGON });
        s = holeEditReducer(s, { type: EDIT_ACTIONS.ADD_OB_VERTEX, point: P(0, 0) });

        const exported = exportHoleEdit(s);
        assert.equal(exported.history, undefined);
        assert.equal(exported.activePolygon, undefined);
        assert.equal(exported.courseId, 'maple-hill-gold');
        assert.equal(exported.holeNum, 2);
        assert.deepEqual(exported.tee, P(-71.895, 42.276));
    });

    test('an unfinished OB polygon is dropped, not saved as course data', () => {
        let s = createEditState('c', 1);
        s = holeEditReducer(s, { type: EDIT_ACTIONS.START_OB_POLYGON });
        s = holeEditReducer(s, { type: EDIT_ACTIONS.ADD_OB_VERTEX, point: P(0, 0) });
        s = holeEditReducer(s, { type: EDIT_ACTIONS.ADD_OB_VERTEX, point: P(1, 1) });
        // never FINISH_OB_POLYGON'd
        const exported = exportHoleEdit(s);
        assert.deepEqual(exported.obPolygons, []);
    });
});

describe('importHoleEdit', () => {
    test('round-trips a real export exactly', () => {
        let s = createEditState('maple-hill-gold', 2);
        s = holeEditReducer(s, { type: EDIT_ACTIONS.SET_TEE, point: P(-71.895, 42.276) });
        s = holeEditReducer(s, { type: EDIT_ACTIONS.SET_BASKET, point: P(-71.893, 42.277) });
        s = holeEditReducer(s, { type: EDIT_ACTIONS.ADD_MANDO, point: P(-71.894, 42.2765), direction: 'right' });

        const json = JSON.parse(JSON.stringify(exportHoleEdit(s)));
        const imported = importHoleEdit(json);
        assert.deepEqual(imported, exportHoleEdit(s));
    });

    test('rejects missing courseId or holeNum', () => {
        assert.throws(() => importHoleEdit({ holeNum: 1 }), /courseId/);
        assert.throws(() => importHoleEdit({ courseId: 'c' }), /holeNum/);
    });

    test('rejects a malformed tee/basket rather than passing NaN through', () => {
        assert.throws(
            () => importHoleEdit({ courseId: 'c', holeNum: 1, tee: { lng: 'nope', lat: 0 } }),
            /tee.*finite/,
        );
    });

    test('defaults missing array fields to empty rather than throwing', () => {
        const imported = importHoleEdit({ courseId: 'c', holeNum: 1 });
        assert.deepEqual(imported.obPolygons, []);
        assert.deepEqual(imported.mandos, []);
        assert.deepEqual(imported.dropzones, []);
        assert.equal(imported.tee, null);
        assert.equal(imported.basket, null);
    });

    test('rejects non-object input', () => {
        assert.throws(() => importHoleEdit(null));
        assert.throws(() => importHoleEdit('not an object'));
    });
});

describe('mergeHoleEdit', () => {
    const baseHole = normalizeHole({
        num: 2, par: 3, distanceFt: 380, tee: { lng: -71.8952, lat: 42.2764 }, bearing: 110,
    });

    test('an edit with both tee and basket produces a MEASURED hole with recomputed distance/bearing', () => {
        const edit = { tee: P(-71.8952, 42.2764), basket: P(-71.8930, 42.2770) };
        const merged = mergeHoleEdit(baseHole, edit);
        assert.equal(merged.dataQuality, DATA_QUALITY.MEASURED);
        assert.deepEqual(merged.tee, edit.tee);
        assert.deepEqual(merged.basket, edit.basket);
        assert.ok(merged.distanceFt > 0);
        assert.ok(Number.isFinite(merged.bearing));
    });

    test('an edit that only adds an OB polygon does NOT upgrade dataQuality to measured', () => {
        // baseHole was built via basketFromTee -> estimated.
        assert.equal(baseHole.dataQuality, DATA_QUALITY.ESTIMATED);
        const edit = { obPolygons: [[P(0, 0), P(1, 0), P(1, 1)]] };
        const merged = mergeHoleEdit(baseHole, edit);
        assert.equal(merged.dataQuality, DATA_QUALITY.ESTIMATED, 'adding an OB polygon silently claimed the basket was measured');
        assert.deepEqual(merged.obPolygons, edit.obPolygons);
        // tee/basket/distance/bearing must be untouched since neither was edited.
        assert.deepEqual(merged.tee, baseHole.tee);
        assert.deepEqual(merged.basket, baseHole.basket);
        assert.equal(merged.distanceFt, baseHole.distanceFt);
    });

    test('editing only the tee (basket unchanged) does not claim measured either', () => {
        const edit = { tee: P(-71.8955, 42.2766) };
        const merged = mergeHoleEdit(baseHole, edit);
        assert.equal(merged.dataQuality, DATA_QUALITY.ESTIMATED);
        assert.deepEqual(merged.tee, edit.tee);
        assert.deepEqual(merged.basket, baseHole.basket);
        // distance/bearing DO get recomputed even for a partial move.
        assert.notEqual(merged.distanceFt, baseHole.distanceFt);
    });

    test('an already-measured base hole stays measured when only an OB polygon is added', () => {
        const measuredBase = normalizeHole({
            num: 1, par: 3, distanceFt: 269, tee: { lng: -118.17608, lat: 34.19325 }, basket: { lng: -118.17695, lat: 34.19340 },
        });
        assert.equal(measuredBase.dataQuality, DATA_QUALITY.MEASURED);
        const merged = mergeHoleEdit(measuredBase, { mandos: [{ point: P(0, 0), direction: 'left' }] });
        assert.equal(merged.dataQuality, DATA_QUALITY.MEASURED);
    });

    test('an empty edit is a no-op merge (base hole passes through unchanged)', () => {
        const merged = mergeHoleEdit(baseHole, {});
        assert.deepEqual(merged.tee, baseHole.tee);
        assert.deepEqual(merged.basket, baseHole.basket);
        assert.equal(merged.dataQuality, baseHole.dataQuality);
        assert.equal(merged.distanceFt, baseHole.distanceFt);
    });

    test('the merged hole is a valid, normalized hole (passes validateHole)', () => {
        const edit = { tee: P(-71.8952, 42.2764), basket: P(-71.8930, 42.2770) };
        const merged = mergeHoleEdit(baseHole, edit);
        // par/num are inherited from baseHole, present -> should validate cleanly.
        assert.equal(merged.num, baseHole.num);
        assert.equal(merged.par, baseHole.par);
        assert.doesNotThrow(() => validateHole(merged));
    });
});
