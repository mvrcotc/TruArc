/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  TruArc — Disc Bag Persistence                                   ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * The bag used to live only in React state, so every reload emptied it.
 * This module persists it to localStorage, following the same
 * try/catch-and-degrade convention as calibrationOffset.js.
 *
 * ── WHY localStorage AND NOT FIRESTORE ───────────────────────────────
 * The app has Firestore helpers (src/firebase/), but the bag must work
 * SIGNED OUT — it is the first thing a new user touches, long before
 * they have any reason to authenticate, and Firebase is optional
 * configuration this app runs fine without (`isFirebaseConfigured()`).
 * A per-user cloud bag is a reasonable later addition on top of this;
 * it is not a replacement for it. Deliberately not built here, since
 * this environment has no Firebase project to round-trip against and an
 * untested sync path is worse than none.
 *
 * ── WHY IDENTITY IS STORED, NOT THE WHOLE DISC ───────────────────────
 * Only `{brand, name}` is persisted; flight numbers are re-resolved
 * against DISC_DATABASE on load. If a disc's published numbers are ever
 * corrected in the database, every bag picks the correction up for free
 * — whereas a stored snapshot would keep simulating the old numbers
 * forever, silently, which is exactly the class of quiet staleness this
 * codebase tries to avoid.
 *
 * A disc that is no longer in the database keeps its stored snapshot IF
 * that snapshot carries complete, finite flight numbers. Dropping a disc
 * out of someone's bag without explanation is user-hostile, and a
 * complete snapshot is still simulatable. A snapshot that is incomplete
 * or corrupt is discarded, because `computeDiscProfile` (and the engine
 * itself) throw on non-finite flight numbers — restoring one would break
 * the disc panel rather than degrade it.
 */

import { DISC_DATABASE } from '../data/discs.js';

const BAG_KEY = 'truarc_disc_bag_v1';
const SELECTED_KEY = 'truarc_selected_disc_v1';

/** A disc is usable only if all four flight numbers are real numbers. */
export function isUsableDisc(d) {
    return !!d
        && typeof d.name === 'string' && d.name.length > 0
        && Number.isFinite(d.speed)
        && Number.isFinite(d.glide)
        && Number.isFinite(d.turn)
        && Number.isFinite(d.fade);
}

/** Bag identity — DiscSelector already treats brand+name as the key. */
export function discKey(d) {
    return `${d?.brand ?? ''}|${d?.name ?? ''}`;
}

/**
 * Turn whatever came out of storage into a clean, usable bag.
 *
 * Pure and database-injectable so it can be tested without a browser.
 * Storage is attacker-adjacent in the mundane sense — a stale schema, a
 * half-written value, a hand-edited devtools entry — so every entry is
 * validated rather than trusted.
 *
 * @param {unknown} raw - parsed JSON from localStorage (any shape)
 * @param {Array} [database] - disc database to resolve identities against
 * @returns {Array} validated, de-duplicated discs, input order preserved
 */
export function normalizeStoredBag(raw, database = DISC_DATABASE) {
    if (!Array.isArray(raw)) return [];

    const byKey = new Map();
    for (const d of database) byKey.set(discKey(d), d);

    const out = [];
    const seen = new Set();
    for (const entry of raw) {
        if (!entry || typeof entry !== 'object') continue;
        if (typeof entry.name !== 'string' || !entry.name) continue;

        const key = discKey(entry);
        if (seen.has(key)) continue; // storage can hold duplicates; the bag can't

        // Prefer the live database entry so corrected flight numbers
        // propagate; fall back to the stored snapshot only when it is
        // complete enough to actually simulate.
        const resolved = byKey.get(key) ?? (isUsableDisc(entry) ? entry : null);
        if (!resolved) continue;

        seen.add(key);
        out.push(resolved);
    }
    return out;
}

/**
 * Pick the disc to select on load: the persisted selection if it is
 * still in the bag, else the first disc in the bag, else null.
 *
 * Falling back to the first disc matters — a restored bag with nothing
 * selected would look broken (no disc panel, nothing to throw) even
 * though the restore worked.
 *
 * @param {unknown} rawSelected - parsed JSON from localStorage
 * @param {Array} bag - already-normalized bag
 */
export function resolveSelectedDisc(rawSelected, bag) {
    if (!Array.isArray(bag) || bag.length === 0) return null;
    if (rawSelected && typeof rawSelected === 'object') {
        const key = discKey(rawSelected);
        const match = bag.find((d) => discKey(d) === key);
        if (match) return match;
    }
    return bag[0];
}

// ─── STORAGE WRAPPERS ────────────────────────────────────────────────
//
// Thin by design: all the decisions live in the pure functions above, so
// these only have to not throw. localStorage can be absent (SSR), denied
// (Safari private mode), or full (quota) — every one of which should cost
// persistence, never the app.

function readJSON(key) {
    try {
        const stored = localStorage.getItem(key);
        return stored ? JSON.parse(stored) : null;
    } catch {
        return null;
    }
}

function writeJSON(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch {
        return false;
    }
}

/** @returns {Array} the persisted bag, validated. Empty array if none. */
export function loadBag() {
    return normalizeStoredBag(readJSON(BAG_KEY));
}

/** Persist the bag. Stores identity only — see the module header. */
export function saveBag(bag) {
    if (!Array.isArray(bag)) return false;
    return writeJSON(BAG_KEY, bag.map((d) => ({ brand: d.brand, name: d.name })));
}

/** @param {Array} bag - the already-loaded bag to resolve the selection within. */
export function loadSelectedDisc(bag) {
    return resolveSelectedDisc(readJSON(SELECTED_KEY), bag);
}

/** Persist the current selection (identity only). Null clears it. */
export function saveSelectedDisc(disc) {
    if (!disc) {
        try { localStorage.removeItem(SELECTED_KEY); return true; } catch { return false; }
    }
    return writeJSON(SELECTED_KEY, { brand: disc.brand, name: disc.name });
}
