/**
 * Tests for the measured-throw loader — tests/ground-truth/field-data.mjs
 *
 * WHAT IS AT STAKE: every row loaded here outranks an expert-authored
 * target and feeds all 19 parameters of `npm run calibrate`. A row that
 * loads when it should have been rejected does not look like a bug — it
 * looks like a calibration result. So the validation tests below matter
 * more than the happy path, and several deliberately assert that bad
 * input THROWS rather than being skipped.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
    DISTANCE_TOLERANCE, LATERAL_FLOOR_FT, SPIN_PER_MPH,
    resolveDisc, validateRow, rowToEnvelope, loadFieldEnvelopes,
    supersedes, mergeFieldEnvelopes,
} from './field-data.mjs';
import { ENVELOPES } from './flight-envelopes.mjs';
import { runEnvelope } from './adapters/sixDof.mjs';
import { extractMetrics } from './metrics.mjs';

const ROW = {
    disc: 'Destroyer',
    releaseSpeedMph: 60,
    spinRpm: 1200,
    measuredDistanceFt: 380,
    lateralFinishFt: -30,
};

/** A throwaway field-data directory, so tests never touch the real one. */
function withDir(files, fn) {
    const dir = mkdtempSync(join(tmpdir(), 'truarc-field-'));
    try {
        for (const [name, content] of Object.entries(files)) {
            writeFileSync(join(dir, name), typeof content === 'string' ? content : JSON.stringify(content));
        }
        return fn(dir);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

describe('disc resolution', () => {
    test('a name resolves against the app database, case-insensitively', () => {
        assert.equal(resolveDisc('Destroyer', 't').name, 'Destroyer');
        assert.equal(resolveDisc('dEsTrOyEr', 't').name, 'Destroyer');
    });

    test('an unknown disc name throws rather than silently vanishing', () => {
        assert.throws(() => resolveDisc('Frisbeeee', 't'), /unknown disc/);
    });

    test('an inline disc must carry all four flight numbers', () => {
        assert.ok(resolveDisc({ name: 'X', speed: 9, glide: 4, turn: -1, fade: 3 }, 't'));
        assert.throws(() => resolveDisc({ name: 'X', speed: 9, glide: 4, turn: -1 }, 't'), /fade/);
    });
});

describe('row validation rejects the realistic mistakes', () => {
    test('a good row passes', () => {
        assert.equal(validateRow(ROW, 't'), true);
    });

    test('release speed is required — it is the reason this format exists', () => {
        const { releaseSpeedMph, ...without } = ROW;
        assert.throws(() => validateRow(without, 't'), /releaseSpeedMph is required/);
    });

    test('km/h entered as mph is caught', () => {
        // 97 km/h is a normal drive; as "mph" it is nonsense.
        assert.throws(() => validateRow({ ...ROW, releaseSpeedMph: 97 }, 't'), /units wrong/);
    });

    test('metres entered as feet is caught', () => {
        // A 380 ft drive logged as 116 m would otherwise become a
        // perfectly plausible-looking 116 ft target.
        assert.throws(() => validateRow({ ...ROW, measuredDistanceFt: 4 }, 't'), /outside 10–800/);
    });

    test('a measured distance is required', () => {
        const { measuredDistanceFt, ...without } = ROW;
        assert.throws(() => validateRow(without, 't'), /measuredDistanceFt is required/);
    });

    test('non-numeric values are rejected, not coerced', () => {
        assert.throws(() => validateRow({ ...ROW, measuredDistanceFt: '380' }, 't'), /must be a number/);
        assert.throws(() => validateRow({ ...ROW, lateralFinishFt: null }, 't'), /must be a number/);
    });

    test('lateral finish is optional — a rangefinder session may not have it', () => {
        const { lateralFinishFt, ...without } = ROW;
        assert.equal(validateRow(without, 't'), true);
    });
});

describe('row → envelope', () => {
    test('the distance band is the measurement ±10%', () => {
        const env = rowToEnvelope(ROW, 'f.json', 0);
        assert.deepEqual(env.expect.distanceFt, [380 * 0.9, 380 * 1.1]);
        assert.equal(DISTANCE_TOLERANCE, 0.10);
    });

    test('a near-straight throw gets an absolute lateral band, not a useless one', () => {
        // The reason LATERAL_FLOOR_FT exists: ±10% of 2 ft is ±0.2 ft,
        // which is below what anyone can measure or any model can hit.
        const env = rowToEnvelope({ ...ROW, lateralFinishFt: 2 }, 'f.json', 0);
        const [lo, hi] = env.expect.finishLateralFt;
        assert.equal(hi - lo, LATERAL_FLOOR_FT * 2);
        assert.ok(lo < 0 && hi > 0, 'a straight throw must admit both signs');
    });

    test('a big lateral finish scales past the floor', () => {
        const env = rowToEnvelope({ ...ROW, lateralFinishFt: -200 }, 'f.json', 0);
        const [lo, hi] = env.expect.finishLateralFt;
        assert.equal(hi - lo, 40, '10% of 200, doubled');
    });

    test('no lateral measurement means no lateral assertion', () => {
        const { lateralFinishFt, ...without } = ROW;
        const env = rowToEnvelope(without, 'f.json', 0);
        assert.ok(!('finishLateralFt' in env.expect));
        assert.ok('distanceFt' in env.expect);
    });

    test('spin is derived from release speed when unmeasured, and flagged', () => {
        const { spinRpm, ...without } = ROW;
        const env = rowToEnvelope(without, 'f.json', 0);
        assert.equal(env.measured.spinRpm, 60 * SPIN_PER_MPH);
        assert.equal(env.measured.spinAssumed, true, 'an assumption must be marked as one');
        assert.equal(rowToEnvelope(ROW, 'f.json', 0).measured.spinAssumed, false);
    });

    test('the envelope carries measured release speed, not a tier', () => {
        // The whole point: these rows judge the tier model, so they must
        // not be expressed in its terms.
        const env = rowToEnvelope(ROW, 'f.json', 0);
        assert.equal(env.thrower, null);
        assert.equal(env.measured.releaseSpeedMph, 60);
    });

    test('ids trace back to the file they came from', () => {
        assert.match(rowToEnvelope(ROW, 'session-a.json', 2).id, /^field:session-a:destroyer-2$/);
    });
});

describe('loading a directory', () => {
    test('a missing directory is not an error — it is the normal state', () => {
        assert.deepEqual(loadFieldEnvelopes('/nonexistent/path/xyz'), []);
    });

    test('single objects and arrays both load', () => {
        withDir({ 'one.json': ROW, 'many.json': [ROW, { ...ROW, measuredDistanceFt: 350 }] }, (dir) => {
            assert.equal(loadFieldEnvelopes(dir).length, 3);
        });
    });

    test('malformed JSON names the file it failed on', () => {
        withDir({ 'broken.json': '{ not json' }, (dir) => {
            assert.throws(() => loadFieldEnvelopes(dir), /broken\.json.*not valid JSON/s);
        });
    });

    test('one bad row fails the load instead of being skipped', () => {
        // A session you believe is loaded but is not is the worst
        // outcome here — it looks like a calibration result.
        withDir({ 'a.json': [ROW, { ...ROW, measuredDistanceFt: 9999 }] }, (dir) => {
            assert.throws(() => loadFieldEnvelopes(dir), /outside 10–800/);
        });
    });

    test('non-JSON files are ignored', () => {
        withDir({ 'README.md': '# notes', 'a.json': ROW }, (dir) => {
            assert.equal(loadFieldEnvelopes(dir).length, 1);
        });
    });
});

describe('precedence over synthesized targets', () => {
    const destroyerAdv = ENVELOPES.find((e) => e.id === 'destroyer-adv-flat');

    test('a matching measurement supersedes the synthesized target', () => {
        // destroyer-adv-flat assumes 60 mph; a real 60 mph Destroyer
        // throw is a claim about the same case and outranks it.
        const field = rowToEnvelope(ROW, 'f.json', 0);
        assert.equal(supersedes(field, destroyerAdv), true);
    });

    test('a different disc does not supersede', () => {
        const field = rowToEnvelope({ ...ROW, disc: 'Buzzz' }, 'f.json', 0);
        assert.equal(supersedes(field, destroyerAdv), false);
    });

    test('a different release speed does not supersede', () => {
        // A 40 mph Destroyer is a different case, not a competing claim
        // about the 60 mph one.
        const field = rowToEnvelope({ ...ROW, releaseSpeedMph: 40 }, 'f.json', 0);
        assert.equal(supersedes(field, destroyerAdv), false);
    });

    test('a windy measurement does not supersede a calm target', () => {
        const field = rowToEnvelope({ ...ROW, windMph: 15 }, 'f.json', 0);
        assert.equal(supersedes(field, destroyerAdv), false);
    });

    test('a hyzer measurement does not supersede a flat target', () => {
        const field = rowToEnvelope({ ...ROW, hyzerDeg: 20 }, 'f.json', 0);
        assert.equal(supersedes(field, destroyerAdv), false);
    });

    test('an explicit supersedes list wins over the automatic match', () => {
        const field = rowToEnvelope({ ...ROW, disc: 'Buzzz', supersedes: ['destroyer-adv-flat'] }, 'f.json', 0);
        assert.equal(supersedes(field, destroyerAdv), true);
        assert.equal(supersedes(field, ENVELOPES.find((e) => e.id === 'roc-adv-flat')), false);
    });

    test('merging drops the superseded target and reports the swap', () => {
        const field = [rowToEnvelope(ROW, 'f.json', 0)];
        const { envelopes, replaced } = mergeFieldEnvelopes(ENVELOPES, field);

        assert.ok(!envelopes.some((e) => e.id === 'destroyer-adv-flat'), 'superseded target still present');
        assert.ok(envelopes.some((e) => e.id === field[0].id), 'measured row missing');
        assert.equal(envelopes.length, ENVELOPES.length, 'one out, one in');
        assert.deepEqual(replaced, [{ id: 'destroyer-adv-flat', by: field[0].id }]);
    });

    test('no field data leaves the synthesized set untouched', () => {
        const { envelopes, replaced } = mergeFieldEnvelopes(ENVELOPES, []);
        assert.equal(envelopes, ENVELOPES, 'must be the same array, not a copy');
        assert.deepEqual(replaced, []);
    });
});

describe('a measured envelope actually runs', () => {
    test('the adapter honours the measured release speed', () => {
        // End-to-end: the row must reach the engine as a real throw. If
        // this passes, a field session has somewhere to land.
        const slow = rowToEnvelope({ ...ROW, releaseSpeedMph: 40 }, 'f.json', 0);
        const fast = rowToEnvelope({ ...ROW, releaseSpeedMph: 70 }, 'f.json', 1);

        const dSlow = extractMetrics(runEnvelope(slow)).distanceFt;
        const dFast = extractMetrics(runEnvelope(fast)).distanceFt;

        assert.ok(Number.isFinite(dSlow) && dSlow > 0);
        assert.ok(dFast > dSlow + 50, `70 mph flew ${dFast.toFixed(0)} ft vs 40 mph at ${dSlow.toFixed(0)} ft`);
    });

    test('synthesized envelopes still route through the tier model', () => {
        // The adapter change must not have disturbed the existing path.
        const m = extractMetrics(runEnvelope(ENVELOPES.find((e) => e.id === 'destroyer-adv-flat')));
        assert.ok(Number.isFinite(m.distanceFt) && m.distanceFt > 0);
    });
});
