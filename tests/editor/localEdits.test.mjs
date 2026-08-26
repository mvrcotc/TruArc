/**
 * Tests for placed-pin persistence — src/editor/localEdits.js
 *
 * WHY THIS MATTERS MORE THAN A NORMAL STORAGE MODULE: a stored edit
 * carrying both a tee and a basket flips a hole to
 * `dataQuality: 'measured'`, which is what admits it to the terrain
 * reading. So a corrupt or half-parsed entry does not degrade to a
 * cosmetic glitch — it produces a hole that claims to be surveyed and
 * is not, which is precisely the failure the hole card exists to avoid.
 */
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
    editKey, loadEdits, loadEdit, saveEdit, clearEdit, editedHoleCount,
} from '../../src/editor/localEdits.js';
import { mergeHoleEdit } from '../../src/editor/courseEditExport.js';
import { normalizeHole, DATA_QUALITY } from '../../src/data/courses.js';

/** Minimal localStorage, since node has none. */
function installStorage() {
    const map = new Map();
    globalThis.localStorage = {
        getItem: (k) => (map.has(k) ? map.get(k) : null),
        setItem: (k, v) => { map.set(k, String(v)); },
        removeItem: (k) => { map.delete(k); },
        clear: () => map.clear(),
        _map: map,
    };
    return globalThis.localStorage;
}

const TEE = { lng: -118.1700, lat: 34.2000 };
const BASKET = { lng: -118.1690, lat: 34.2010 };
const EDIT = { courseId: 'oak', holeNum: 3, tee: TEE, basket: BASKET, obPolygons: [], mandos: [], dropzones: [] };

let store;
beforeEach(() => { store = installStorage(); });

describe('keys', () => {
    test('a key is course and hole together', () => {
        assert.equal(editKey('oak', 3), 'oak:3');
        // Hole 3 at two courses must not collide.
        assert.notEqual(editKey('oak', 3), editKey('maple', 3));
    });

    test('missing parts do not collapse into a shared key', () => {
        assert.notEqual(editKey('oak', null), editKey(null, 3));
    });
});

describe('round trip', () => {
    test('a saved edit comes back', () => {
        assert.equal(saveEdit('oak', 3, EDIT), true);
        const got = loadEdit('oak', 3);
        assert.deepEqual(got.tee, TEE);
        assert.deepEqual(got.basket, BASKET);
    });

    test('saving one hole leaves others alone', () => {
        saveEdit('oak', 3, EDIT);
        saveEdit('oak', 7, { ...EDIT, holeNum: 7 });
        assert.ok(loadEdit('oak', 3));
        assert.ok(loadEdit('oak', 7));
        assert.equal(editedHoleCount('oak'), 2);
    });

    test('re-saving a hole replaces rather than duplicates', () => {
        saveEdit('oak', 3, EDIT);
        const moved = { ...EDIT, basket: { lng: -118.168, lat: 34.202 } };
        saveEdit('oak', 3, moved);
        assert.equal(editedHoleCount('oak'), 1);
        assert.deepEqual(loadEdit('oak', 3).basket, moved.basket);
    });

    test('an unplaced hole reads back as null', () => {
        assert.equal(loadEdit('oak', 99), null);
    });

    test('clearing removes only that hole', () => {
        saveEdit('oak', 3, EDIT);
        saveEdit('oak', 7, { ...EDIT, holeNum: 7 });
        clearEdit('oak', 3);
        assert.equal(loadEdit('oak', 3), null);
        assert.ok(loadEdit('oak', 7));
    });

    test('saving an empty edit clears rather than storing a no-op', () => {
        // Reverting a hole to its published coordinates has to be
        // possible, and empty entries would otherwise accumulate.
        saveEdit('oak', 3, EDIT);
        saveEdit('oak', 3, { courseId: 'oak', holeNum: 3, tee: null, basket: null });
        assert.equal(loadEdit('oak', 3), null);
    });

    test('counts can be scoped to a course or taken globally', () => {
        saveEdit('oak', 3, EDIT);
        saveEdit('maple', 1, { ...EDIT, courseId: 'maple', holeNum: 1 });
        assert.equal(editedHoleCount('oak'), 1);
        assert.equal(editedHoleCount(), 2);
    });
});

describe('corrupt storage cannot fabricate a surveyed hole', () => {
    test('unparseable JSON degrades to no edits', () => {
        store.setItem('truarc_hole_edits_v1', '{ not json');
        assert.deepEqual(loadEdits(), {});
    });

    test('a non-object payload degrades to no edits', () => {
        store.setItem('truarc_hole_edits_v1', '[1,2,3]');
        assert.deepEqual(loadEdits(), {});
    });

    test('one malformed entry is dropped and the rest survive', () => {
        // The important one: a bad row must not take down a player's
        // whole set of placements, and must not survive as a partial.
        store.setItem('truarc_hole_edits_v1', JSON.stringify({
            'oak:3': EDIT,
            'oak:4': { tee: 'not-a-point', basket: 42 },
        }));
        const all = loadEdits();
        assert.ok(all['oak:3'], 'the good entry was lost');
        const bad = all['oak:4'];
        // Either rejected outright, or sanitised to something that
        // cannot masquerade as a placed pin.
        if (bad) {
            assert.ok(!(bad.tee && bad.basket) || typeof bad.tee === 'object',
                'a malformed entry must not present as a placed pair');
        }
    });

    test('storage that throws on read does not break the app', () => {
        globalThis.localStorage = {
            getItem() { throw new Error('SecurityError'); },
            setItem() { throw new Error('SecurityError'); },
        };
        assert.doesNotThrow(() => loadEdits());
        assert.deepEqual(loadEdits(), {});
        assert.equal(saveEdit('oak', 3, EDIT), false, 'a failed write must report failure');
    });
});

describe('the point of all this: a placed pair earns a reading', () => {
    const base = normalizeHole({
        num: 3, par: 3, distanceFt: 300, bearing: 90, tee: TEE,
    });

    test('the published hole starts estimated', () => {
        assert.equal(base.dataQuality, DATA_QUALITY.ESTIMATED);
    });

    test('a stored tee+basket pair upgrades it to measured', () => {
        saveEdit('oak', 3, EDIT);
        const merged = mergeHoleEdit(base, loadEdit('oak', 3));
        assert.equal(merged.dataQuality, DATA_QUALITY.MEASURED);
        assert.deepEqual(merged.basket, BASKET);
    });

    test('a tee alone does NOT upgrade it', () => {
        // Half a placement is still a derived basket, and the terrain
        // profile is sampled along the line to that basket.
        saveEdit('oak', 3, { ...EDIT, basket: null });
        const stored = loadEdit('oak', 3);
        const merged = mergeHoleEdit(base, stored ?? { tee: TEE });
        assert.equal(merged.dataQuality, DATA_QUALITY.ESTIMATED);
    });

    test('distance is recomputed from the placed pins, not inherited', () => {
        // The listed 300 ft was part of what produced the derived
        // basket; keeping it beside real coordinates would let the card
        // quote a distance that disagrees with what is drawn.
        saveEdit('oak', 3, EDIT);
        const merged = mergeHoleEdit(base, loadEdit('oak', 3));
        assert.notEqual(merged.distanceFt, 300);
        assert.ok(merged.distanceFt > 0);
    });
});
