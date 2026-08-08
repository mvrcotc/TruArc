/**
 * A/B flag between the Section 1 6-DOF engine and the legacy
 * pseudo-force engine, for a rollout comparison period. Defaults to
 * the new engine. Delete this file, `src/utils/flightPhysics.js`, and
 * the 'legacy' branches in worker.js / flightEngine.js together once
 * the rollout is complete — see docs/ACCURACY_ROADMAP.md §1.
 */
const KEY = 'truarc:engine';
const VALID = new Set(['sixdof', 'legacy']);
const DEFAULT = 'sixdof';

export function getEngineChoice() {
    try {
        const v = window.localStorage.getItem(KEY);
        return VALID.has(v) ? v : DEFAULT;
    } catch {
        return DEFAULT;
    }
}

export function setEngineChoice(choice) {
    if (!VALID.has(choice)) return;
    try {
        window.localStorage.setItem(KEY, choice);
    } catch {
        /* storage unavailable (private mode, SSR) — flag just won't persist */
    }
}

export function toggleEngineChoice() {
    const next = getEngineChoice() === 'sixdof' ? 'legacy' : 'sixdof';
    setEngineChoice(next);
    return next;
}
