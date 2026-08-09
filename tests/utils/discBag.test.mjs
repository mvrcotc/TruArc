/**
 * Tests for src/utils/discBag.js — the bag persistence added because the
 * bag lived only in React state and every reload emptied it.
 *
 * Only the PURE functions are tested here (`normalizeStoredBag`,
 * `resolveSelectedDisc`, `isUsableDisc`, `discKey`). The localStorage
 * wrappers around them are deliberately thin enough to be uninteresting
 * — all they do is try/catch a read or write — and node has no
 * localStorage to test them against without a shim that would only
 * prove the shim works.
 *
 * The load path is the one that matters. Storage is not trustworthy
 * input: it holds whatever an older build wrote, whatever a half-
 * completed write left behind, and whatever someone typed into devtools.
 * A restored disc missing its flight numbers would throw inside
 * `computeDiscProfile` (which rejects non-finite numbers by design), so
 * "validate on load" is a correctness requirement, not defensiveness.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
    normalizeStoredBag, resolveSelectedDisc, isUsableDisc, discKey,
} from '../../src/utils/discBag.js';
import { DISC_DATABASE } from '../../src/data/discs.js';

const DB = [
    { name: 'Destroyer', speed: 12, glide: 5, turn: -1, fade: 3, type: 'Distance Driver', brand: 'Innova' },
    { name: 'Buzzz', speed: 5, glide: 4, turn: -1, fade: 1, type: 'Midrange', brand: 'Discraft' },
    { name: 'Aviar', speed: 2, glide: 3, turn: 0, fade: 1, type: 'Putter', brand: 'Innova' },
];

// ─── isUsableDisc / discKey ──────────────────────────────────────────

describe('isUsableDisc', () => {
    test('accepts a disc with all four finite flight numbers', () => {
        assert.equal(isUsableDisc(DB[0]), true);
    });

    test('rejects a disc missing any flight number', () => {
        assert.equal(isUsableDisc({ name: 'X', brand: 'Y', speed: 9, glide: 5, turn: -1 }), false);
        assert.equal(isUsableDisc({ name: 'X', brand: 'Y', glide: 5, turn: -1, fade: 2 }), false);
    });

    test('rejects NaN/null flight numbers rather than passing them to the engine', () => {
        assert.equal(isUsableDisc({ name: 'X', brand: 'Y', speed: NaN, glide: 5, turn: -1, fade: 2 }), false);
        assert.equal(isUsableDisc({ name: 'X', brand: 'Y', speed: null, glide: 5, turn: -1, fade: 2 }), false);
    });

    test('rejects a nameless disc and non-objects', () => {
        assert.equal(isUsableDisc({ speed: 9, glide: 5, turn: -1, fade: 2 }), false);
        assert.equal(isUsableDisc(null), false);
        assert.equal(isUsableDisc(undefined), false);
    });

    test('turn of 0 is usable — 0 is a real flight number, not "missing"', () => {
        // The bug a truthiness check would introduce: every dead-straight
        // disc (turn 0) silently dropped from the bag.
        assert.equal(isUsableDisc({ name: 'Firebird', brand: 'Innova', speed: 9, glide: 3, turn: 0, fade: 4 }), true);
    });
});

describe('discKey', () => {
    test('keys on brand+name, matching how the bag already de-duplicates', () => {
        assert.equal(discKey({ brand: 'Innova', name: 'Destroyer' }), 'Innova|Destroyer');
    });

    test('distinguishes same-named discs from different brands', () => {
        assert.notEqual(discKey({ brand: 'Innova', name: 'Wraith' }), discKey({ brand: 'Latitude 64', name: 'Wraith' }));
    });
});

// ─── normalizeStoredBag ──────────────────────────────────────────────

describe('normalizeStoredBag', () => {
    test('restores stored identities to full discs from the database', () => {
        const bag = normalizeStoredBag([{ brand: 'Innova', name: 'Destroyer' }], DB);
        assert.equal(bag.length, 1);
        assert.equal(bag[0].name, 'Destroyer');
        assert.equal(bag[0].speed, 12);
        assert.equal(bag[0].type, 'Distance Driver');
    });

    test('preserves the stored order', () => {
        const bag = normalizeStoredBag(
            [{ brand: 'Innova', name: 'Aviar' }, { brand: 'Innova', name: 'Destroyer' }, { brand: 'Discraft', name: 'Buzzz' }],
            DB,
        );
        assert.deepEqual(bag.map((d) => d.name), ['Aviar', 'Destroyer', 'Buzzz']);
    });

    test('database numbers WIN over a stale stored snapshot', () => {
        // The whole reason identity is stored rather than the disc: a
        // corrected flight number must reach existing bags. If this ever
        // reverses, every saved bag silently simulates old numbers.
        const stale = [{ brand: 'Innova', name: 'Destroyer', speed: 99, glide: 99, turn: 99, fade: 99 }];
        const bag = normalizeStoredBag(stale, DB);
        assert.equal(bag[0].speed, 12, 'stored snapshot must not override the database');
        assert.equal(bag[0].fade, 3);
    });

    test('keeps a disc no longer in the database IF its snapshot is complete', () => {
        // Silently vanishing a disc from someone's bag is user-hostile,
        // and a complete snapshot is still simulatable.
        const retired = [{ brand: 'Innova', name: 'Retired Mold', speed: 9, glide: 4, turn: -2, fade: 1 }];
        const bag = normalizeStoredBag(retired, DB);
        assert.equal(bag.length, 1);
        assert.equal(bag[0].name, 'Retired Mold');
        assert.equal(bag[0].speed, 9);
    });

    test('drops a disc that is neither in the database nor completely specified', () => {
        // This is the entry that would throw inside computeDiscProfile.
        const bad = [{ brand: 'Ghost', name: 'Unknown', speed: 9 }];
        assert.deepEqual(normalizeStoredBag(bad, DB), []);
    });

    test('de-duplicates repeated entries', () => {
        const dupes = [
            { brand: 'Innova', name: 'Destroyer' },
            { brand: 'Innova', name: 'Destroyer' },
            { brand: 'Discraft', name: 'Buzzz' },
        ];
        assert.deepEqual(normalizeStoredBag(dupes, DB).map((d) => d.name), ['Destroyer', 'Buzzz']);
    });

    test('survives corrupt storage of every shape without throwing', () => {
        // Everything localStorage can realistically hand back.
        for (const raw of [null, undefined, 0, 'not an array', {}, NaN, true]) {
            assert.deepEqual(normalizeStoredBag(raw, DB), [], `failed for ${String(raw)}`);
        }
    });

    test('skips junk entries but keeps the good ones around them', () => {
        const mixed = [
            null,
            { brand: 'Innova', name: 'Destroyer' },
            'garbage',
            42,
            { noName: true },
            { brand: 'Discraft', name: 'Buzzz' },
        ];
        assert.deepEqual(normalizeStoredBag(mixed, DB).map((d) => d.name), ['Destroyer', 'Buzzz']);
    });

    test('an empty stored bag stays empty', () => {
        assert.deepEqual(normalizeStoredBag([], DB), []);
    });

    test('resolves against the real shipped database, not just the fixture', () => {
        const bag = normalizeStoredBag(
            [{ brand: 'Innova', name: 'Destroyer' }, { brand: 'Discraft', name: 'Zone' }],
            DISC_DATABASE,
        );
        assert.equal(bag.length, 2);
        for (const d of bag) assert.ok(isUsableDisc(d), `${d.name} came back unusable`);
    });

    test('every disc in the shipped database round-trips through save→load', () => {
        // Guards the identity contract end to end: if any shipped disc
        // has a brand/name that does not survive keying, it would drop
        // out of a bag that contained it.
        const stored = DISC_DATABASE.map((d) => ({ brand: d.brand, name: d.name }));
        const bag = normalizeStoredBag(stored, DISC_DATABASE);
        // Duplicates in the database itself would legitimately collapse;
        // compare against the de-duplicated expectation.
        const expected = new Set(DISC_DATABASE.map(discKey));
        assert.equal(bag.length, expected.size, 'a shipped disc failed to round-trip');
    });
});

// ─── resolveSelectedDisc ─────────────────────────────────────────────

describe('resolveSelectedDisc', () => {
    const bag = normalizeStoredBag(
        [{ brand: 'Innova', name: 'Destroyer' }, { brand: 'Discraft', name: 'Buzzz' }],
        DB,
    );

    test('restores the persisted selection when it is still in the bag', () => {
        const sel = resolveSelectedDisc({ brand: 'Discraft', name: 'Buzzz' }, bag);
        assert.equal(sel.name, 'Buzzz');
    });

    test('returns the identical object from the bag, not a copy', () => {
        // React identity: DiscSelector highlights the active disc, and a
        // detached copy would leave nothing looking selected.
        const sel = resolveSelectedDisc({ brand: 'Discraft', name: 'Buzzz' }, bag);
        assert.equal(sel, bag[1]);
    });

    test('falls back to the first disc when the selection is no longer in the bag', () => {
        // A restored bag with nothing selected looks broken — no disc
        // panel, nothing to throw — even though the restore worked.
        const sel = resolveSelectedDisc({ brand: 'Innova', name: 'Removed' }, bag);
        assert.equal(sel.name, 'Destroyer');
    });

    test('falls back to the first disc when nothing was persisted', () => {
        assert.equal(resolveSelectedDisc(null, bag).name, 'Destroyer');
        assert.equal(resolveSelectedDisc(undefined, bag).name, 'Destroyer');
    });

    test('returns null for an empty bag rather than inventing a disc', () => {
        assert.equal(resolveSelectedDisc({ brand: 'Innova', name: 'Destroyer' }, []), null);
        assert.equal(resolveSelectedDisc(null, []), null);
    });

    test('tolerates a corrupt persisted selection', () => {
        for (const raw of ['garbage', 42, true, []]) {
            const sel = resolveSelectedDisc(raw, bag);
            assert.equal(sel.name, 'Destroyer', `failed for ${String(raw)}`);
        }
    });

    test('tolerates a non-array bag', () => {
        assert.equal(resolveSelectedDisc(null, null), null);
        assert.equal(resolveSelectedDisc(null, 'nope'), null);
    });
});
