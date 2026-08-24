/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  TruArc — Placed pins, stored locally                            ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Persists hole edits — a placed tee and basket, OB, mandos — to
 * localStorage, following the same try/catch-and-degrade convention as
 * discBag.js and calibrationOffset.js.
 *
 * ── WHY LOCAL AND NOT ONLY FIRESTORE ─────────────────────────────────
 * `src/firebase/courseEdits.js` already saves edits per signed-in user,
 * and edits were being written there and never read back — a save button
 * that produced no visible effect on the next visit.
 *
 * Closing that loop through Firestore alone would put a sign-in wall in
 * front of the app's most important action. Placing the real basket on a
 * hole is what turns it from `estimated` (288 of this app's 306 holes,
 * pins derived from tee + bearing + listed distance) into `measured`,
 * and only a measured hole gets a terrain reading. Gating that behind an
 * account means a new player's first experience is the "no pin" card and
 * no obvious way past it.
 *
 * So local storage is the primary home and Firestore is the sync on top
 * for anyone signed in — the same split, and the same reasoning, as the
 * disc bag.
 *
 * ── WHAT IS STORED ───────────────────────────────────────────────────
 * The EXPORT shape from courseEditExport.js, not the live reducer state
 * (which carries undo history and an in-progress polygon — neither is
 * meaningful across sessions). That shape is already validated on the
 * way back in by `importHoleEdit`, so a hand-mangled or
 * version-mismatched entry degrades to "no edit" instead of throwing
 * somewhere deep in the merge.
 */

import { importHoleEdit } from './courseEditExport.js';

const KEY = 'truarc_hole_edits_v1';
const OBSERVER_KEY = 'truarc_observer_id_v1';

/** `courseId:holeNum` — one entry per hole, latest placement wins. */
export function editKey(courseId, holeNum) {
    return `${courseId ?? ''}:${holeNum ?? ''}`;
}

function readAll() {
    try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
        // Private browsing, disabled storage, corrupt JSON. None of
        // these should cost the player the map.
        return {};
    }
}

function writeAll(map) {
    try {
        localStorage.setItem(KEY, JSON.stringify(map));
        return true;
    } catch {
        return false;
    }
}

/**
 * Every stored edit, keyed by `courseId:holeNum`, each already passed
 * through `importHoleEdit`. Entries that fail validation are dropped
 * rather than surfaced — a half-parsed pin is worse than none, because
 * it would merge into a hole and claim to be measured.
 */
export function loadEdits() {
    const raw = readAll();
    const out = {};
    for (const [key, value] of Object.entries(raw)) {
        try {
            const edit = importHoleEdit(value);
            if (edit) out[key] = edit;
        } catch {
            // Skip this one, keep the rest.
        }
    }
    return out;
}

/** The stored edit for one hole, or null. */
export function loadEdit(courseId, holeNum) {
    return loadEdits()[editKey(courseId, holeNum)] ?? null;
}

/**
 * Store one hole's edit. Takes the EXPORT shape (see the header).
 *
 * An edit carrying neither a tee nor a basket is stored as a deletion:
 * clearing a hole back to its published coordinates has to be possible,
 * and an empty entry that merges to a no-op would just accumulate.
 */
export function saveEdit(courseId, holeNum, exported) {
    const map = readAll();
    const key = editKey(courseId, holeNum);

    if (!exported?.tee && !exported?.basket) delete map[key];
    else map[key] = exported;

    return writeAll(map);
}

/** Forget one hole's placement. */
export function clearEdit(courseId, holeNum) {
    const map = readAll();
    delete map[editKey(courseId, holeNum)];
    return writeAll(map);
}

/** How many holes the player has placed pins on — for a progress hint. */
export function editedHoleCount(courseId = null) {
    const keys = Object.keys(loadEdits());
    if (courseId == null) return keys.length;
    return keys.filter((k) => k.startsWith(`${courseId}:`)).length;
}

/**
 * A stable anonymous id for this device, minted on first use.
 *
 * Pin consensus counts OBSERVERS, not placements — one person nudging
 * their own pin twice must not look like two people agreeing — so every
 * placement needs an identity attached, including for someone who has
 * never signed in. A signed-in user's uid is preferable when available
 * (it follows them across devices); this is the fallback that keeps the
 * feature working without an account.
 *
 * Not a security boundary. Anyone can clear it and mint another, so it
 * cannot stop a determined person from voting twice — that needs
 * server-side identity, and belongs with the shared-pool sync that does
 * not exist yet. What it does buy is correctness against the ordinary
 * case: honest repeat placements by the same person.
 */
export function localObserverId() {
    try {
        const existing = localStorage.getItem(OBSERVER_KEY);
        if (existing) return existing;
        const minted = `local-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
        localStorage.setItem(OBSERVER_KEY, minted);
        return minted;
    } catch {
        // Storage unavailable: a per-session id still keeps one person
        // from self-confirming within this session.
        return 'local-ephemeral';
    }
}
