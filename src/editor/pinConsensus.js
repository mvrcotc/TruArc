/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  TruArc — Whose pin do we believe?                               ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * A placed basket turns a hole from `estimated` to `measured`, and only
 * a measured hole gets a terrain reading. That makes placement the most
 * load-bearing input in the app — and it comes from strangers.
 *
 * One person placing a pin in the wrong fairway (careless, mistaken
 * about which hole, or malicious) would otherwise produce a card full
 * of confident numbers about the wrong ground, indistinguishable from a
 * correct one. This module decides when a placement has earned belief.
 *
 * ── AGREEMENT IS PROXIMITY, NOT EQUALITY ─────────────────────────────
 * Two people placing the same basket never produce identical
 * coordinates. Satellite imagery is off by a few feet, they click
 * different sides of the pole, phone GPS drifts. So "confirmed" cannot
 * mean matching coordinates; it means observations tight enough to be
 * the same object. Everything below clusters rather than compares.
 *
 * ── AND OUTLIERS ARE EXCLUDED, NOT AVERAGED ──────────────────────────
 * The obvious implementation — average every placement — is exactly
 * wrong: it lets one pin dropped in the car park drag the consensus
 * hundreds of feet, and the more wrong it is the more it pulls. Bad
 * observations must fall OUT of the cluster, not be blended into it.
 *
 * Once outliers are gone, averaging what remains is strictly better
 * than trusting any single placement: independent errors are roughly
 * random, so the centroid of three agreeing observations is closer to
 * the real basket than any one of them.
 *
 * ── A DISAGREEMENT IS NOT AUTOMATICALLY A LIE ────────────────────────
 * Two tight clusters 80 ft apart usually means the basket MOVED —
 * courses run multiple pin positions, and the schema has a
 * `pinPositions` field for exactly that. Picking the bigger cluster and
 * calling the other fraud would quietly delete a real feature of the
 * course. So a genuine split reports `contested` and defers, rather
 * than inventing an answer.
 *
 * ── WHAT IS NOT HERE ─────────────────────────────────────────────────
 * Fetching other players' observations needs a shared backend.
 * `src/firebase/courseEdits.js` stores edits per user
 * (`users/{uid}/courseEdits/...`), which is the wrong shape for a
 * shared pool, and this repo has no Firebase project to round-trip
 * against. Following discBag.js's stated rule — an untested sync path
 * is worse than none — the sync is left as a documented seam and every
 * rule below is exercised against in-memory observations instead.
 */

import { groundDistanceFt } from '../holes/holeTerrain.js';

/**
 * How close two placements must be to be the same basket.
 *
 * A basket is about 2 ft across, so this is dominated by observation
 * error rather than target size: consumer GPS lands within roughly
 * 10–20 ft under open sky, and satellite imagery carries its own
 * registration offset. 25 ft accepts honest variation between two
 * people who both stood at the pin, and rejects a placement in the next
 * fairway — which is the discrimination that matters.
 */
export const AGREEMENT_RADIUS_FT = 25;

/** Corroborating observations needed before a stranger's pin is used. */
export const CONFIRMED_AT = 2;

/** Where a pin stops being merely corroborated and becomes settled. */
export const VERIFIED_AT = 3;

/**
 * A dissenting cluster needs this many observations before it makes a
 * pin contested. One person disagreeing with three is an outlier; two
 * agreeing with each other is a second opinion, and on a course that
 * usually means an alternate pin position.
 */
export const CONTEST_AT = 2;

export const PIN_STATUS = Object.freeze({
    NONE: 'none',                 // nobody has placed this hole
    SELF: 'self',                 // you placed it; trusted for you
    UNCONFIRMED: 'unconfirmed',   // one stranger, nobody corroborating
    CONFIRMED: 'confirmed',       // independent observers agree
    VERIFIED: 'verified',         // enough agreement to be settled
    CONTESTED: 'contested',       // two real clusters — likely a moved pin
});

/**
 * Statuses whose position is good enough to read terrain against.
 *
 * `UNCONFIRMED` is deliberately absent: that is precisely the single
 * unverified stranger's placement this module exists to distrust.
 * `CONTESTED` is absent because we do not know WHICH pin is in play
 * today, and guessing would produce a confident reading of the wrong
 * green.
 */
const TRUSTED = new Set([PIN_STATUS.SELF, PIN_STATUS.CONFIRMED, PIN_STATUS.VERIFIED]);

export function pinIsTrusted(status) {
    return TRUSTED.has(status);
}

const isPoint = (p) => !!p && Number.isFinite(p.lng) && Number.isFinite(p.lat);

/**
 * Group placements that are close enough to be the same pin.
 *
 * Single-link agglomeration against the cluster's running centroid,
 * not against the first member: seeding from one arbitrary observation
 * would let the cluster's identity depend on input order. Sorted by
 * size so the leading cluster is the prevailing opinion.
 */
export function clusterPoints(points, radiusFt = AGREEMENT_RADIUS_FT) {
    const clusters = [];

    for (const item of points) {
        if (!isPoint(item.point)) continue;

        const home = clusters.find(
            (c) => groundDistanceFt(centroid(c.members.map((m) => m.point)), item.point) <= radiusFt,
        );
        if (home) home.members.push(item);
        else clusters.push({ members: [item] });
    }

    return clusters
        .map((c) => ({
            members: c.members,
            center: centroid(c.members.map((m) => m.point)),
            spreadFt: spread(c.members.map((m) => m.point)),
        }))
        .sort((a, b) => b.members.length - a.members.length);
}

/** Mean position. Only ever called on an already-agreeing cluster. */
export function centroid(points) {
    const valid = points.filter(isPoint);
    if (!valid.length) return null;
    return {
        lng: valid.reduce((s, p) => s + p.lng, 0) / valid.length,
        lat: valid.reduce((s, p) => s + p.lat, 0) / valid.length,
    };
}

/** Farthest any member sits from the cluster's centre, in feet. */
function spread(points) {
    const c = centroid(points);
    if (!c) return 0;
    return points.reduce((m, p) => Math.max(m, groundDistanceFt(c, p)), 0);
}

/**
 * Decide what to believe about one hole's pin.
 *
 * @param {Array<{observerId, tee, basket, placedAt?}>} observations
 * @param {{selfId?: string, radiusFt?: number}} opts
 *
 * ── WHY YOUR OWN PLACEMENT OUTRANKS THE CROWD ────────────────────────
 * You stood at the basket. Making you wait for two strangers to ratify
 * what you saw would make the feature useless on any course nobody else
 * has visited — which is most of them, and exactly where this is worth
 * the most. Disagreement is still surfaced (`othersDisagree`) so a
 * genuine mistake is visible, but it does not override you.
 */
export function pinConsensus(observations = [], opts = {}) {
    const { selfId = null, radiusFt = AGREEMENT_RADIUS_FT } = opts;

    // One observation per observer — the latest. Someone refining their
    // own placement twice is one opinion, not two, and letting it count
    // twice would be the cheapest possible way to fake a consensus.
    const latest = new Map();
    for (const o of observations) {
        if (!isPoint(o?.basket)) continue;
        const prior = latest.get(o.observerId);
        if (!prior || (o.placedAt ?? 0) >= (prior.placedAt ?? 0)) latest.set(o.observerId, o);
    }
    const unique = [...latest.values()];

    if (!unique.length) {
        return { status: PIN_STATUS.NONE, tee: null, basket: null, agreeing: 0, total: 0 };
    }

    const clusters = clusterPoints(
        unique.map((o) => ({ point: o.basket, observation: o })),
        radiusFt,
    );
    const leading = clusters[0];
    const runnerUp = clusters[1] ?? null;
    const agreeing = leading.members.length;

    const mine = selfId ? unique.find((o) => o.observerId === selfId) : null;
    const othersDisagree = !!mine
        && groundDistanceFt(mine.basket, leading.center) > radiusFt
        && agreeing >= CONFIRMED_AT;

    const base = {
        total: unique.length,
        agreeing,
        spreadFt: leading.spreadFt,
        clusters: clusters.length,
        othersDisagree,
    };

    // Your own placement wins for you, disagreement noted.
    if (mine) {
        return {
            ...base,
            status: PIN_STATUS.SELF,
            tee: mine.tee ?? null,
            basket: mine.basket,
        };
    }

    // A real second opinion — most often a moved pin, not a bad actor.
    if (runnerUp && runnerUp.members.length >= CONTEST_AT) {
        return { ...base, status: PIN_STATUS.CONTESTED, tee: null, basket: null };
    }

    if (agreeing >= VERIFIED_AT) {
        return { ...base, status: PIN_STATUS.VERIFIED, ...consensusPoints(leading) };
    }
    if (agreeing >= CONFIRMED_AT) {
        return { ...base, status: PIN_STATUS.CONFIRMED, ...consensusPoints(leading) };
    }

    // Exactly one stranger. Position is carried so the map can show it
    // as a suggestion, but `pinIsTrusted` refuses it for terrain.
    return {
        ...base,
        status: PIN_STATUS.UNCONFIRMED,
        tee: leading.members[0].observation.tee ?? null,
        basket: leading.members[0].observation.basket,
    };
}

/**
 * The agreed position: the centroid of everyone in the cluster, which
 * beats any single member once outliers are already excluded.
 *
 * Tees are averaged only across members who supplied one, so an
 * observer who placed a basket but no tee does not drag the tee toward
 * a point they never claimed.
 */
function consensusPoints(cluster) {
    const tees = cluster.members
        .map((m) => m.observation.tee)
        .filter(isPoint);
    return {
        tee: tees.length ? centroid(tees) : null,
        basket: cluster.center,
    };
}

/**
 * One line for the UI.
 *
 * Never says "verified" about something merely placed: the whole point
 * is that a player can tell a corroborated pin from a lone claim at a
 * glance, and softening that language would undo the module.
 */
export function describeConsensus(c) {
    switch (c?.status) {
        case PIN_STATUS.SELF:
            return c.othersDisagree
                ? 'Your placement — others have this pin elsewhere'
                : 'Your placement';
        case PIN_STATUS.VERIFIED:
            return `Verified by ${c.agreeing} players`;
        case PIN_STATUS.CONFIRMED:
            return `Confirmed by ${c.agreeing} players`;
        case PIN_STATUS.UNCONFIRMED:
            return 'Placed by one player, not yet confirmed';
        case PIN_STATUS.CONTESTED:
            return 'Players disagree — the basket may have moved';
        default:
            return 'No pin placed';
    }
}
