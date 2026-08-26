/**
 * Tests for pin consensus — src/editor/pinConsensus.js
 *
 * These are weighted toward ATTACKS rather than happy paths, because
 * the module's entire job is to survive them. A placed basket flips a
 * hole to `measured` and unlocks a terrain reading, so a consensus that
 * can be fooled produces confident numbers about the wrong ground —
 * which looks exactly like correct output.
 *
 * The three that matter most: a single bad placement must not be
 * believed, a distant outlier must not drag the agreed position, and
 * one person must not be able to manufacture agreement alone.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
    AGREEMENT_RADIUS_FT, CONFIRMED_AT, VERIFIED_AT, PIN_STATUS,
    pinConsensus, pinIsTrusted, clusterPoints, centroid, describeConsensus,
} from '../../src/editor/pinConsensus.js';
import { groundDistanceFt } from '../../src/holes/holeTerrain.js';

const TEE = { lng: -118.1700, lat: 34.2000 };
const PIN = { lng: -118.1690, lat: 34.2010 };

const FT_PER_DEG_LAT = 364000;
/** A point `ft` north of `p` — the readable way to build test geometry. */
const north = (p, ft) => ({ lng: p.lng, lat: p.lat + ft / FT_PER_DEG_LAT });

/** One observation, `jitterFt` off the true pin. */
const obs = (observerId, jitterFt = 0, extra = {}) => ({
    observerId,
    tee: TEE,
    basket: north(PIN, jitterFt),
    placedAt: 1,
    ...extra,
});

describe('nothing to believe', () => {
    test('no observations reads as none, not as a pin at 0,0', () => {
        const c = pinConsensus([]);
        assert.equal(c.status, PIN_STATUS.NONE);
        assert.equal(c.basket, null);
        assert.equal(pinIsTrusted(c.status), false);
    });

    test('observations without a basket are ignored', () => {
        const c = pinConsensus([{ observerId: 'a', tee: TEE, basket: null }]);
        assert.equal(c.status, PIN_STATUS.NONE);
    });

    test('a non-finite coordinate cannot masquerade as a placement', () => {
        const c = pinConsensus([{ observerId: 'a', basket: { lng: NaN, lat: 34.2 } }]);
        assert.equal(c.status, PIN_STATUS.NONE);
    });
});

describe('a lone stranger is not believed', () => {
    test('one observation is unconfirmed and not trusted', () => {
        // The headline requirement: one person cannot make a hole
        // "measured" for everybody else.
        const c = pinConsensus([obs('stranger')], { selfId: 'me' });
        assert.equal(c.status, PIN_STATUS.UNCONFIRMED);
        assert.equal(pinIsTrusted(c.status), false);
    });

    test('its position is still carried, so the map can suggest it', () => {
        // Distrusted is not the same as discarded — showing it as an
        // unconfirmed suggestion is how it gets confirmed.
        const c = pinConsensus([obs('stranger')], { selfId: 'me' });
        assert.ok(c.basket, 'an unconfirmed pin should still expose its position');
    });
});

describe('agreement is proximity, not equality', () => {
    test('placements a few feet apart confirm each other', () => {
        // Two people who both stood at the basket will not produce
        // identical coordinates; requiring that would confirm nothing.
        const c = pinConsensus([obs('a', 0), obs('b', 12)], { selfId: 'me' });
        assert.equal(c.status, PIN_STATUS.CONFIRMED);
        assert.equal(c.agreeing, 2);
        assert.ok(pinIsTrusted(c.status));
    });

    test('a placement in the next fairway does not confirm anything', () => {
        const c = pinConsensus([obs('a', 0), obs('b', 300)], { selfId: 'me' });
        assert.equal(c.status, PIN_STATUS.UNCONFIRMED, 'two lone opinions are not a consensus');
        assert.equal(c.agreeing, 1);
    });

    test('the agreement radius is the boundary it claims to be', () => {
        const inside = pinConsensus([obs('a', 0), obs('b', AGREEMENT_RADIUS_FT - 5)]);
        const outside = pinConsensus([obs('a', 0), obs('b', AGREEMENT_RADIUS_FT + 15)]);
        assert.equal(inside.agreeing, 2);
        assert.equal(outside.agreeing, 1);
    });

    test('enough agreement promotes confirmed to verified', () => {
        const c = pinConsensus(
            Array.from({ length: VERIFIED_AT }, (_, i) => obs(`p${i}`, i * 4)),
            { selfId: 'me' },
        );
        assert.equal(c.status, PIN_STATUS.VERIFIED);
    });
});

describe('an outlier is excluded, never averaged in', () => {
    test('one wild placement does not move the agreed position', () => {
        // The failure a naive mean would have: the further the bad pin
        // is, the harder it pulls. Here it must not pull at all.
        const good = [obs('a', 0), obs('b', 8), obs('c', -6)];
        const clean = pinConsensus(good);
        const poisoned = pinConsensus([...good, obs('vandal', 2000)]);

        assert.equal(poisoned.status, PIN_STATUS.VERIFIED);
        const moved = groundDistanceFt(clean.basket, poisoned.basket);
        assert.ok(moved < 1, `the outlier dragged the consensus ${moved.toFixed(1)} ft`);
    });

    test('the outlier is not counted as agreement', () => {
        const c = pinConsensus([obs('a', 0), obs('b', 8), obs('vandal', 900)]);
        assert.equal(c.agreeing, 2);
        assert.equal(c.total, 3, 'it should still be counted as an observation');
    });

    test('several vandals agreeing with each other do not beat the real cluster', () => {
        // They can make it contested — see below — but they cannot
        // silently become the answer while a real cluster exists.
        const c = pinConsensus([
            obs('a', 0), obs('b', 6), obs('c', -5),
            obs('v1', 1500), obs('v2', 1506),
        ]);
        assert.notEqual(c.status, PIN_STATUS.VERIFIED);
        assert.equal(c.basket, null, 'a contested pin must not hand out a position');
        assert.equal(pinIsTrusted(c.status), false);
    });
});

describe('one person cannot manufacture a consensus', () => {
    test('re-placing your own pin counts once, not twice', () => {
        // The cheapest possible attack: place, nudge, place again.
        const c = pinConsensus([
            { ...obs('a', 0), placedAt: 1 },
            { ...obs('a', 5), placedAt: 2 },
        ], { selfId: 'someone-else' });

        assert.equal(c.total, 1);
        assert.equal(c.status, PIN_STATUS.UNCONFIRMED);
    });

    test('the latest of a repeat observer is the one that counts', () => {
        const c = pinConsensus([
            { ...obs('a', 0), placedAt: 1 },
            { ...obs('a', 20), placedAt: 5 },
            obs('b', 20),
        ]);
        // The corrected placement agrees with b; the stale one did not.
        assert.equal(c.agreeing, 2);
    });
});

describe('disagreement is reported, not resolved', () => {
    test('two real clusters read as contested', () => {
        // Courses genuinely move baskets between pin positions, so
        // picking a winner would delete a real feature of the course.
        const c = pinConsensus([
            obs('a', 0), obs('b', 7),
            obs('c', 400), obs('d', 407),
        ]);
        assert.equal(c.status, PIN_STATUS.CONTESTED);
        assert.equal(c.basket, null, 'we do not know which pin is in play today');
        assert.equal(pinIsTrusted(c.status), false);
    });

    test('a single dissenter is an outlier, not a contest', () => {
        const c = pinConsensus([obs('a', 0), obs('b', 6), obs('c', -4), obs('d', 500)]);
        assert.equal(c.status, PIN_STATUS.VERIFIED);
    });
});

describe('your own placement', () => {
    test('is trusted immediately — you were standing there', () => {
        // Requiring two strangers to ratify what you saw would make the
        // feature useless on any course nobody else has visited.
        const c = pinConsensus([obs('me')], { selfId: 'me' });
        assert.equal(c.status, PIN_STATUS.SELF);
        assert.ok(pinIsTrusted(c.status));
    });

    test('wins over the crowd, but the disagreement is surfaced', () => {
        const c = pinConsensus([
            { ...obs('me', 0), observerId: 'me' },
            obs('a', 600), obs('b', 606),
        ], { selfId: 'me' });

        assert.equal(c.status, PIN_STATUS.SELF);
        assert.equal(c.othersDisagree, true, 'a possible mistake must be visible');
        assert.ok(groundDistanceFt(c.basket, PIN) < 1, 'your own position is what you see');
    });

    test('no false alarm when you agree with everyone', () => {
        const c = pinConsensus([obs('me', 0), obs('a', 8), obs('b', -6)], { selfId: 'me' });
        assert.equal(c.status, PIN_STATUS.SELF);
        assert.equal(c.othersDisagree, false);
    });
});

describe('the consensus position beats any single placement', () => {
    test('averaging agreeing observations reduces random error', () => {
        // Independent errors cancel; this is the payoff for clustering
        // rather than just picking the first placement.
        const c = pinConsensus([obs('a', 18), obs('b', -16), obs('c', 4)]);
        const consensusErr = groundDistanceFt(c.basket, PIN);
        const singleErr = groundDistanceFt(north(PIN, 18), PIN);
        assert.ok(consensusErr < singleErr,
            `consensus ${consensusErr.toFixed(1)} ft vs single ${singleErr.toFixed(1)} ft`);
    });

    test('a tee is averaged only across observers who supplied one', () => {
        const c = pinConsensus([
            obs('a', 0),
            { ...obs('b', 6), tee: null },
        ]);
        assert.ok(c.tee, 'the one supplied tee should survive');
        assert.ok(groundDistanceFt(c.tee, TEE) < 1, 'a missing tee must not drag the average');
    });
});

describe('clustering internals', () => {
    test('cluster identity does not depend on input order', () => {
        // Seeding from the first member rather than the running centroid
        // would make results depend on the order rows arrive in.
        const pts = [0, 12, 24, 36].map((ft) => ({ point: north(PIN, ft) }));
        const forward = clusterPoints(pts).map((c) => c.members.length);
        const backward = clusterPoints([...pts].reverse()).map((c) => c.members.length);
        assert.deepEqual(forward, backward);
    });

    test('clusters come back largest first', () => {
        const pts = [0, 5, 10, 900].map((ft) => ({ point: north(PIN, ft) }));
        const sizes = clusterPoints(pts).map((c) => c.members.length);
        assert.deepEqual(sizes, [3, 1]);
    });

    test('centroid of nothing is null, not a point at the origin', () => {
        assert.equal(centroid([]), null);
        assert.equal(centroid([null, undefined]), null);
    });
});

describe('what the player is told', () => {
    test('an unconfirmed pin is never described as verified', () => {
        const s = describeConsensus(pinConsensus([obs('a')], { selfId: 'me' }));
        assert.match(s, /not yet confirmed/i);
        assert.ok(!/verified/i.test(s));
    });

    test('counts in the message match the agreeing count', () => {
        const c = pinConsensus([obs('a', 0), obs('b', 5), obs('c', -5), obs('v', 900)]);
        assert.match(describeConsensus(c), new RegExp(`${c.agreeing} players`));
    });

    test('every status produces a sentence', () => {
        for (const status of Object.values(PIN_STATUS)) {
            const s = describeConsensus({ status, agreeing: 2 });
            assert.ok(typeof s === 'string' && s.length > 0, `no message for ${status}`);
        }
    });
});
