/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  TruArc — Flight Physics Regression Harness (Section 0)         ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Asserts the flight simulator against the domain-judgment targets in
 * tests/ground-truth/flight-envelopes.mjs. Run with:
 *   npm run test:physics
 *
 * Engine under test is selected by TRUARC_ENGINE (see
 * ground-truth/adapters/index.mjs): `sixdof` (default, the Section 1
 * engine) or `current` (the legacy pseudo-force engine, retained only
 * so the baseline stays reproducible).
 *
 * Do not "fix" failing cases by loosening ranges in
 * flight-envelopes.mjs — fix the engine or its coefficient mapping, or
 * take it to the user if a target itself looks wrong.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ENVELOPES, COMPARATIVES } from './ground-truth/flight-envelopes.mjs';
import { runEnvelope, engineName } from './ground-truth/adapters/index.mjs';
import { extractMetrics, checkShape, checkInvariants } from './ground-truth/metrics.mjs';

// Cache so comparative assertions referencing an envelope id by string
// don't re-simulate it.
const cache = new Map();

function resultFor(envelope) {
    if (cache.has(envelope.id)) return cache.get(envelope.id);
    const result = runEnvelope(envelope);
    const metrics = extractMetrics(result);
    const record = { result, metrics };
    cache.set(envelope.id, record);
    return record;
}

function metricsForSide(side) {
    if (typeof side === 'string') {
        const envelope = ENVELOPES.find((e) => e.id === side);
        if (!envelope) throw new Error(`Comparative references unknown envelope id: "${side}"`);
        return resultFor(envelope).metrics;
    }
    // Inline {disc, thrower, throw, wind} — not cached, id is synthetic.
    const result = runEnvelope({ id: '(inline)', ...side });
    return extractMetrics(result);
}

describe('Flight envelopes — absolute targets', () => {
    for (const envelope of ENVELOPES) {
        test(envelope.id, () => {
            const { result, metrics } = resultFor(envelope);
            const failures = [];

            for (const [key, range] of Object.entries(envelope.expect)) {
                if (key === 'shape') continue;
                const [min, max] = range;
                const v = metrics[key];
                if (!(v >= min && v <= max)) {
                    failures.push(`${key}=${v.toFixed(1)} outside [${min}, ${max}]`);
                }
            }

            const shapeResult = checkShape(envelope.expect.shape, result.points, result.landingIndex, metrics);
            if (!shapeResult.pass) {
                failures.push(`shape '${envelope.expect.shape}' failed: ${shapeResult.detail}`);
            }

            const invariants = checkInvariants(result.points, result.landingIndex, result.flightTimeS);
            if (!invariants.pass) {
                failures.push(`invariants: ${invariants.problems.join('; ')}`);
            }

            assert.equal(
                failures.length,
                0,
                `\n  ${envelope.description}\n  ${envelope.rationale}\n  → ${failures.join('\n  → ')}`,
            );
        });
    }
});

describe('Comparative assertions — relative truths', () => {
    for (const c of COMPARATIVES) {
        test(c.id, () => {
            const va = metricsForSide(c.a)[c.metric];
            const vb = metricsForSide(c.b)[c.metric];
            const delta = va - vb;

            assert.ok(
                delta >= c.minDeltaFt,
                `\n  ${c.rationale}\n  → ${c.metric}: a=${va.toFixed(1)} b=${vb.toFixed(1)} `
                + `delta=${delta.toFixed(1)} (need ≥ ${c.minDeltaFt})`,
            );
        });
    }
});
