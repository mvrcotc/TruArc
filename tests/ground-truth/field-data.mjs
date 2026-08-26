/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  Ground truth — measured throws (Section 0, step 2)              ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Loads real throws from tests/ground-truth/field-data/*.json and turns
 * each into an absolute envelope the existing harness already knows how
 * to run.
 *
 * ── WHY THIS MATTERS MORE THAN ANOTHER CALIBRATION PASS ──────────────
 * Every target in flight-envelopes.mjs is expert judgement, not
 * measurement. Three of them have already been found wrong and
 * corrected (see docs/ACCURACY_ROADMAP.md §1), which is the honest
 * summary of how much a judgement-based target is worth.
 *
 * The 2026-08-23 recalibration then sharpened the problem: constrained
 * to physically-legal lift, the engine reaches only 4/23 envelopes, and
 * the misses concentrate where release speed is lowest — `leopard-rec`
 * −38 %, `destroyer-rec` −28 %. Missing kinetic energy cannot be
 * recovered through lift coefficients without leaving physical bounds.
 * So the remaining error lives in the RELEASE-SPEED MODEL
 * (`THROWER_TIERS` × `discReleaseFactor`) or in the targets themselves,
 * and no amount of fitting can say which.
 *
 * A measured row settles it, because it carries the release speed as
 * DATUM rather than as an assumption: `leopard-rec-flat` currently
 * *assumes* 34 mph and *expects* 195–255 ft. One TechDisc row saying
 * what speed a real Leopard actually left the hand at, next to where it
 * actually landed, decides whether the engine or the target is wrong.
 * That is the entire reason this loader exists.
 *
 * ── ROW FORMAT ───────────────────────────────────────────────────────
 * A file is one row or an array of rows (a session). Documented in
 * field-data/README.md; the authoritative validation is validateRow().
 *
 *   {
 *     "disc": "Destroyer",          // name, or {name,speed,glide,turn,fade}
 *     "releaseSpeedMph": 62,        // REQUIRED — the whole point
 *     "spinRpm": 1250,              // optional, see SPIN_PER_MPH
 *     "noseAngleDeg": 2,
 *     "hyzerDeg": 0,
 *     "measuredDistanceFt": 371,    // REQUIRED
 *     "lateralFinishFt": -28,       // optional
 *     "windMph": 0, "windFromDeg": 0,
 *     "supersedes": ["destroyer-adv-flat"],
 *     "notes": "3rd throw, calm", "date": "2026-08-09"
 *   }
 *
 * ── VALIDATION IS LOUD ON PURPOSE ────────────────────────────────────
 * These rows are hand-entered and few, and each one outranks a
 * synthesized target. A typo'd distance would not look like a bug — it
 * would look like a calibration result, and it would silently pull all
 * 19 parameters toward a throw that never happened. So a malformed row
 * throws rather than being skipped: a session you thought was loaded
 * but wasn't is the worst outcome available here.
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

import { DISC_DATABASE } from '../../src/data/discs.js';
import { THROWER_TIERS, releaseSpeedMphFor, FIELD_DATA_DIR } from './flight-envelopes.mjs';

/**
 * Tolerance on a measured distance. The README specifies ±10 %, which
 * is roughly one player's throw-to-throw spread — a single row is one
 * sample of a distribution, not a constant, and demanding the model hit
 * it exactly would be fitting to noise.
 */
export const DISTANCE_TOLERANCE = 0.10;

/**
 * Lateral finish gets the same 10 %, but ALSO an absolute floor.
 *
 * A percentage band is meaningless as the measured value approaches
 * zero: a throw that finished 2 ft right would demand ±0.2 ft, which no
 * model can hit and no human can measure. The floor is what makes a
 * straight throw a usable target instead of an impossible one. This is
 * a deliberate deviation from the README's flat ±10 %.
 */
export const LATERAL_TOLERANCE = 0.10;
export const LATERAL_FLOOR_FT = 15;

/**
 * Fallback spin when a row has no `spinRpm` — a rangefinder session has
 * no way to measure it, only a launch monitor does.
 *
 * Anchored to the ground-truth tiers, which pair 60 mph with 1200 rpm
 * and 70 with 1400: both give 20 rpm per mph, and the rec tier's 40/800
 * agrees. Spin and arm speed genuinely do scale together, so this is a
 * reasonable stand-in — but it IS an assumption, and a row that carries
 * a measured value should always be preferred.
 *
 * ── IT DOES NOT MATCH THE TIER MODEL, AND CANNOT ─────────────────────
 * Those tier pairs key spin to the thrower's DRIVER speed, and the tier
 * then hands the same spin to every disc regardless of mold — a rec
 * player's Leopard gets 800 rpm even though it leaves the hand at
 * 34 mph. This fallback keys off the row's own release speed instead
 * (34 → 680 rpm), because a field row records what one disc did and
 * carries no driver-speed reference to key from.
 *
 * The two therefore disagree by ~15 % on slower discs, which is enough
 * to change a flight. That is a real limitation of a spin-less row, not
 * a bug to paper over: it is why `spinAssumed` is set, and why a
 * launch-monitor session (which measures spin directly) is worth more
 * than a rangefinder session by more than the extra column suggests.
 */
export const SPIN_PER_MPH = 20;

/** Release-speed agreement required before a row supersedes an envelope. */
export const RELEASE_MATCH_PCT = 0.08;

const DISC_BY_NAME = new Map(DISC_DATABASE.map((d) => [d.name.toLowerCase(), d]));

function fail(source, message) {
    throw new Error(`[field-data] ${source}: ${message}`);
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * Resolve `disc` to flight numbers. A bare name is looked up in the
 * app's own 260-disc database rather than the 13-disc ground-truth
 * table, so a session can use whatever was actually in the bag.
 */
export function resolveDisc(disc, source) {
    if (typeof disc === 'string') {
        const found = DISC_BY_NAME.get(disc.toLowerCase());
        if (!found) fail(source, `unknown disc "${disc}" — not in src/data/discs.js`);
        return found;
    }
    if (disc && typeof disc === 'object') {
        for (const k of ['speed', 'glide', 'turn', 'fade']) {
            if (!isNum(disc[k])) fail(source, `inline disc is missing a numeric "${k}"`);
        }
        return { name: disc.name ?? 'custom', ...disc };
    }
    return fail(source, '"disc" must be a name or an object with flight numbers');
}

/**
 * Check one row hard enough that a surviving row can be trusted to
 * outrank a synthesized target. Ranges are sanity bounds, not physics —
 * they exist to catch unit slips (metres entered as feet, km/h as mph),
 * which is the realistic hand-entry failure.
 */
export function validateRow(row, source) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
        fail(source, 'row must be an object');
    }

    if (!isNum(row.releaseSpeedMph)) fail(source, 'releaseSpeedMph is required and must be a number');
    if (row.releaseSpeedMph < 10 || row.releaseSpeedMph > 90) {
        fail(source, `releaseSpeedMph ${row.releaseSpeedMph} outside 10–90 — units wrong? (km/h vs mph)`);
    }

    if (!isNum(row.measuredDistanceFt)) fail(source, 'measuredDistanceFt is required and must be a number');
    if (row.measuredDistanceFt < 10 || row.measuredDistanceFt > 800) {
        fail(source, `measuredDistanceFt ${row.measuredDistanceFt} outside 10–800 — metres entered as feet?`);
    }

    if (row.lateralFinishFt !== undefined) {
        if (!isNum(row.lateralFinishFt)) fail(source, 'lateralFinishFt must be a number when present');
        if (Math.abs(row.lateralFinishFt) > 300) {
            fail(source, `lateralFinishFt ${row.lateralFinishFt} outside ±300`);
        }
    }

    if (row.spinRpm !== undefined) {
        if (!isNum(row.spinRpm)) fail(source, 'spinRpm must be a number when present');
        if (row.spinRpm < 100 || row.spinRpm > 3000) fail(source, `spinRpm ${row.spinRpm} outside 100–3000`);
    }

    for (const k of ['noseAngleDeg', 'hyzerDeg', 'windMph', 'windFromDeg']) {
        if (row[k] !== undefined && !isNum(row[k])) fail(source, `${k} must be a number when present`);
    }
    if (row.supersedes !== undefined && !Array.isArray(row.supersedes)) {
        fail(source, 'supersedes must be an array of envelope ids');
    }

    return true;
}

/** A stable, human-traceable id so a failing case points at its file. */
export function fieldEnvelopeId(row, source, index) {
    const disc = (typeof row.disc === 'string' ? row.disc : row.disc?.name ?? 'disc')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-');
    return `field:${basename(source, '.json')}:${disc}-${index}`;
}

/**
 * One measured row → one absolute envelope.
 *
 * The `measured` block is what makes this different from every other
 * envelope: it pins release speed and spin to what was observed, so the
 * case does NOT route through `releaseSpeedMphFor`. That is the point —
 * these rows are the evidence by which the tier model is judged, so
 * they must not be expressed in its terms.
 */
export function rowToEnvelope(row, source = 'inline', index = 0) {
    validateRow(row, source);
    const disc = resolveDisc(row.disc, source);

    const expect = {};
    const d = row.measuredDistanceFt;
    expect.distanceFt = [d * (1 - DISTANCE_TOLERANCE), d * (1 + DISTANCE_TOLERANCE)];

    if (row.lateralFinishFt !== undefined) {
        const lat = row.lateralFinishFt;
        const band = Math.max(Math.abs(lat) * LATERAL_TOLERANCE, LATERAL_FLOOR_FT);
        expect.finishLateralFt = [lat - band, lat + band];
    }

    return {
        id: fieldEnvelopeId(row, source, index),
        description: `Measured throw${row.date ? ` (${row.date})` : ''}: ${disc.name} at ${row.releaseSpeedMph} mph.`,
        rationale: row.notes ?? 'Measured field data — outranks synthesized targets.',
        source,
        field: true,
        disc,
        // No tier: a measured throw is not a tier estimate. The adapter
        // reads `measured` instead.
        thrower: null,
        measured: {
            releaseSpeedMph: row.releaseSpeedMph,
            spinRpm: row.spinRpm ?? row.releaseSpeedMph * SPIN_PER_MPH,
            spinAssumed: row.spinRpm === undefined,
        },
        throw: {
            powerPct: 100,
            noseAngleDeg: row.noseAngleDeg ?? 0,
            releaseAngleDeg: row.hyzerDeg ?? 0,
        },
        wind: {
            speedMps: (row.windMph ?? 0) * 0.44704,
            directionDeg: row.windFromDeg ?? 0,
        },
        supersedes: row.supersedes ?? null,
        expect,
    };
}

/**
 * Read every *.json in `dir`. Missing directory is not an error — the
 * normal state of this repo is "no field data yet", and the harness has
 * to run regardless.
 */
export function loadFieldEnvelopes(dir = FIELD_DATA_DIR) {
    if (!existsSync(dir)) return [];

    const out = [];
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
        const path = join(dir, file);
        let parsed;
        try {
            parsed = JSON.parse(readFileSync(path, 'utf8'));
        } catch (e) {
            fail(file, `not valid JSON — ${e.message}`);
        }
        const rows = Array.isArray(parsed) ? parsed : [parsed];
        rows.forEach((row, i) => out.push(rowToEnvelope(row, file, i)));
    }
    return out;
}

/** What release speed a synthesized envelope assumes for its disc. */
function impliedReleaseMph(env) {
    const tier = THROWER_TIERS[env.thrower];
    if (!tier) return null;
    return releaseSpeedMphFor(tier, env.disc, env.throw?.powerPct ?? 100);
}

/**
 * Decide whether a measured row displaces a synthesized target.
 *
 * Two envelopes conflict when they claim to describe the SAME THROW:
 * same mold, effectively the same release speed, and the same release
 * angles. Wind is required to match as calm-vs-calm because a windy
 * measurement and a calm estimate are simply different cases, not
 * competing claims about one.
 *
 * Matching on implied release speed rather than on tier name is
 * deliberate. The tier's speed is exactly the assumption under
 * suspicion, so a row earns the right to displace an envelope by
 * landing where that envelope's own assumption said it would.
 */
export function supersedes(fieldEnv, synthEnv) {
    if (Array.isArray(fieldEnv.supersedes)) return fieldEnv.supersedes.includes(synthEnv.id);

    if (fieldEnv.disc?.name?.toLowerCase() !== synthEnv.disc?.name?.toLowerCase()) return false;

    const implied = impliedReleaseMph(synthEnv);
    if (implied === null) return false;
    const measured = fieldEnv.measured.releaseSpeedMph;
    if (Math.abs(implied - measured) / measured > RELEASE_MATCH_PCT) return false;

    const near = (a, b, tol) => Math.abs((a ?? 0) - (b ?? 0)) <= tol;
    if (!near(fieldEnv.throw.releaseAngleDeg, synthEnv.throw?.releaseAngleDeg, 5)) return false;
    if (!near(fieldEnv.throw.noseAngleDeg, synthEnv.throw?.noseAngleDeg, 3)) return false;

    // Both calm, or neither.
    const windy = (e) => (e.wind?.speedMps ?? 0) > 0.5;
    return windy(fieldEnv) === windy(synthEnv);
}

/**
 * Merge measured rows into the synthesized set, dropping any target a
 * measurement displaces.
 *
 * ── WHY THE SUPERSEDED ENVELOPE IS REMOVED, NOT PATCHED ──────────────
 * A tempting cheaper design is to keep the synthesized envelope and
 * swap only its `expect` ranges for the measured ones. That would
 * preserve every id and need no remapping — but it would also keep
 * running the case at the TIER'S ASSUMED release speed, and that
 * assumption is the main thing under suspicion (see the header). A row
 * measuring 34 mph and 225 ft can only discriminate "the engine is
 * wrong" from "the tier is wrong" if the simulation actually uses
 * 34 mph. So the measured envelope replaces the synthesized one whole.
 *
 * ── WHICH BREAKS COMPARATIVES, SO THEY ARE REMAPPED ──────────────────
 * COMPARATIVES reference envelopes by id string (`b: 'destroyer-adv-flat'`),
 * and removing one makes those throw "unknown envelope id". `idMap`
 * carries old → new so callers can rewrite those references. A
 * comparative asserts a RELATIVE truth ("a driver out-throws a mid"),
 * which stays exactly as meaningful when the driver's target came from
 * a rangefinder instead of from judgement.
 *
 * @returns {{envelopes, replaced, idMap}} `replaced` names what was
 *          dropped and by which row, so a run can say so out loud
 *          rather than quietly changing what it is testing.
 */
export function mergeFieldEnvelopes(synthesized, field) {
    if (!field.length) return { envelopes: synthesized, replaced: [], idMap: new Map() };

    const replaced = [];
    const idMap = new Map();

    const kept = synthesized.filter((synth) => {
        const by = field.find((f) => supersedes(f, synth));
        if (by) {
            replaced.push({ id: synth.id, by: by.id });
            idMap.set(synth.id, by.id);
        }
        return !by;
    });

    return { envelopes: [...kept, ...field], replaced, idMap };
}

/**
 * Rewrite COMPARATIVES so string references follow superseded ids.
 * Inline sides (`{disc, thrower, throw}`) are left alone — they name no
 * envelope and so cannot dangle.
 */
export function remapComparatives(comparatives, idMap) {
    if (!idMap?.size) return comparatives;
    const move = (side) => (typeof side === 'string' && idMap.has(side) ? idMap.get(side) : side);
    return comparatives.map((c) => ({ ...c, a: move(c.a), b: move(c.b) }));
}
