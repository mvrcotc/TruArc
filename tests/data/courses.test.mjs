/**
 * Tests for src/data/courses.js's Schema v2 additions (Section 5,
 * docs/ACCURACY_ROADMAP.md) — normalizeHole, validateHole, and that
 * every course already in COURSE_DATABASE ends up correctly flagged
 * (measured vs. estimated) after normalization.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
    COURSE_DATABASE, normalizeHole, validateHole, DATA_QUALITY, SCHEMA_VERSION,
} from '../../src/data/courses.js';

describe('normalizeHole', () => {
    test('a hole with only tee + distanceFt + bearing gets a DERIVED basket, flagged estimated', () => {
        const hole = {
            num: 1, par: 3, distanceFt: 328.084, tee: { lng: -71.0, lat: 42.0 }, bearing: 90,
        };
        const normalized = normalizeHole(hole);
        assert.equal(normalized.dataQuality, DATA_QUALITY.ESTIMATED);
        // bearing 90 (due east) at 100m -> lng increases, lat unchanged.
        assert.ok(normalized.basket.lng > hole.tee.lng);
        assert.ok(Math.abs(normalized.basket.lat - hole.tee.lat) < 1e-6);
    });

    test('a hole with an explicit basket is trusted as measured, and its basket is untouched', () => {
        const hole = {
            num: 2, par: 3, distanceFt: 250, tee: { lng: -71.0, lat: 42.0 }, basket: { lng: -71.001, lat: 42.001 },
        };
        const normalized = normalizeHole(hole);
        assert.equal(normalized.dataQuality, DATA_QUALITY.MEASURED);
        assert.deepEqual(normalized.basket, hole.basket);
    });

    test("a hole's own explicit dataQuality wins over the measured/estimated default", () => {
        const hole = {
            num: 3, par: 3, distanceFt: 250, tee: { lng: -71.0, lat: 42.0 }, basket: { lng: -71.001, lat: 42.0 }, dataQuality: 'partial',
        };
        assert.equal(normalizeHole(hole).dataQuality, 'partial');
    });

    test('is idempotent — normalizing twice produces the same result', () => {
        const hole = {
            num: 4, par: 4, distanceFt: 500, tee: { lng: -71.0, lat: 42.0 }, bearing: 45,
        };
        const once = normalizeHole(hole);
        const twice = normalizeHole(once);
        assert.deepEqual(once, twice);
    });

    test('fills schema v2 optional fields with empty/absent defaults when not provided', () => {
        const hole = {
            num: 5, par: 3, distanceFt: 300, tee: { lng: -71.0, lat: 42.0 }, bearing: 0,
        };
        const normalized = normalizeHole(hole);
        assert.deepEqual(normalized.obPolygons, []);
        assert.deepEqual(normalized.mandos, []);
        assert.deepEqual(normalized.dropzones, []);
        assert.equal(normalized.pinPositions, null);
        assert.equal(normalized.fairway, null);
    });

    test('preserves caller-supplied schema v2 fields rather than overwriting them with defaults', () => {
        const hole = {
            num: 6, par: 3, distanceFt: 300, tee: { lng: -71.0, lat: 42.0 }, bearing: 0,
            obPolygons: [[{ lng: -71.001, lat: 42.001 }]],
            mandos: [{ point: { lng: -71.0005, lat: 42.0005 }, direction: 'left' }],
        };
        const normalized = normalizeHole(hole);
        assert.deepEqual(normalized.obPolygons, hole.obPolygons);
        assert.deepEqual(normalized.mandos, hole.mandos);
    });
});

describe('validateHole', () => {
    test('accepts a well-formed normalized hole', () => {
        assert.doesNotThrow(() => validateHole(normalizeHole({
            num: 1, par: 3, distanceFt: 300, tee: { lng: -71.0, lat: 42.0 }, bearing: 0,
        })));
    });

    test('rejects a hole missing num/par/distanceFt', () => {
        assert.throws(() => validateHole({ tee: { lng: 0, lat: 0 }, basket: { lng: 1, lat: 1 } }), /num must be/);
    });

    test('rejects a hole with a malformed tee or basket', () => {
        assert.throws(
            () => validateHole({
                num: 1, par: 3, distanceFt: 300, tee: { lng: 'nope', lat: 0 }, basket: { lng: 1, lat: 1 },
            }),
            /tee must be/,
        );
        assert.throws(
            () => validateHole({
                num: 1, par: 3, distanceFt: 300, tee: { lng: 0, lat: 0 }, basket: null,
            }),
            /basket must be/,
        );
    });

    test('the thrown message names the hole number when identifiable', () => {
        assert.throws(
            () => validateHole({
                num: 7, par: 'x', distanceFt: 300, tee: { lng: 0, lat: 0 }, basket: { lng: 1, lat: 1 },
            }),
            /hole 7/,
        );
    });
});

describe('COURSE_DATABASE after Schema v2 normalization', () => {
    test('every hole in every course validates and carries a dataQuality flag', () => {
        for (const course of COURSE_DATABASE) {
            for (const hole of course.holes) {
                assert.doesNotThrow(
                    () => validateHole(hole),
                    `${course.id} hole ${hole.num} failed validation`,
                );
                assert.ok(
                    Object.values(DATA_QUALITY).includes(hole.dataQuality),
                    `${course.id} hole ${hole.num} has an unrecognized dataQuality: ${hole.dataQuality}`,
                );
            }
        }
    });

    test('Oak Grove (real UDisc GPS baskets) is flagged measured, not estimated', () => {
        const oakGrove = COURSE_DATABASE.find((c) => c.id === 'oak-grove');
        assert.ok(oakGrove, 'oak-grove course not found');
        for (const hole of oakGrove.holes) {
            assert.equal(hole.dataQuality, DATA_QUALITY.MEASURED, `hole ${hole.num}`);
        }
    });

    test('courses computing baskets from tee+bearing+distance are flagged estimated, honestly', () => {
        const mapleHill = COURSE_DATABASE.find((c) => c.id === 'maple-hill-gold');
        assert.ok(mapleHill, 'maple-hill-gold course not found');
        for (const hole of mapleHill.holes) {
            assert.equal(hole.dataQuality, DATA_QUALITY.ESTIMATED, `hole ${hole.num}`);
        }
    });

    test('SCHEMA_VERSION is exported and is the expected v2', () => {
        assert.equal(SCHEMA_VERSION, 2);
    });
});
