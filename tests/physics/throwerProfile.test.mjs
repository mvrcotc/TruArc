/**
 * Tests for the UI→engine bridge in src/physics/throwerProfile.js, and
 * for its use at the one call site that matters — flightEngine's
 * `buildMessage`.
 *
 * ── WHY buildMessage IS TESTED AND NOT JUST buildWindSpec ────────────
 * The bug these guard was a wrong CALL SITE, not a wrong helper. The
 * engine reads `wind.speedMps`/`wind.directionDeg`; the app's wind
 * object has always been `{speed, direction}` and was handed to the
 * 6-DOF engine unconverted, so `wind?.speedMps ?? 0` evaluated to 0 and
 * **the wind sliders did nothing on every 6-DOF throw** — the default
 * engine. Nothing caught it: the legacy engine reads `wind.speed`
 * directly and was fine, and the ground-truth suite's adapter targets
 * the legacy engine, so the broken path had no coverage at all.
 * A unit test of `buildWindSpec` alone would still have passed while
 * the app stayed broken, so the message-construction assertions below
 * are the ones actually doing the work.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
    buildWindSpec, buildThrowSpec, DEFAULT_THROWER, DEFAULT_THROW_SETTINGS,
} from '../../src/physics/throwerProfile.js';
import { __internals } from '../../src/physics/flightEngine.js';

const { buildMessage } = __internals;
const DISC = { name: 'Destroyer', speed: 12, glide: 5, turn: -1, fade: 3 };
const UI_THROW = { power: 80, aimAngle: 0, releaseAngle: 0, noseAngle: 2 };

// ─── buildWindSpec ───────────────────────────────────────────────────

describe('buildWindSpec', () => {
    test('renames the UI fields to the engine fields, values untouched', () => {
        assert.deepEqual(buildWindSpec({ speed: 7.5, direction: 135 }), {
            speedMps: 7.5,
            directionDeg: 135,
        });
    });

    test('defaults missing/absent wind to dead calm rather than NaN', () => {
        assert.deepEqual(buildWindSpec(undefined), { speedMps: 0, directionDeg: 0 });
        assert.deepEqual(buildWindSpec(null), { speedMps: 0, directionDeg: 0 });
        assert.deepEqual(buildWindSpec({}), { speedMps: 0, directionDeg: 0 });
    });

    test('does not read the engine-shaped fields — that would mask the bug', () => {
        // Handing it an already-converted object must NOT quietly work,
        // or a half-converted call site could survive unnoticed.
        assert.deepEqual(buildWindSpec({ speedMps: 9, directionDeg: 90 }), {
            speedMps: 0,
            directionDeg: 0,
        });
    });

    test('is a pure rename — it can never rotate the wind', () => {
        for (const direction of [0, 45, 90, 135, 180, 270, 359]) {
            assert.equal(buildWindSpec({ speed: 5, direction }).directionDeg, direction);
        }
    });
});

// ─── the call site ───────────────────────────────────────────────────

describe('flightEngine.buildMessage — wind reaches the engine in engine units', () => {
    test('the 6-DOF message carries speedMps/directionDeg, not speed/direction', () => {
        const msg = buildMessage(1, 'sixdof', DISC, UI_THROW, { speed: 6, direction: 45 }, null);
        assert.equal(msg.engine, 'sixdof');
        assert.equal(msg.wind.speedMps, 6, 'sixdof wind must be converted — 0 here means the sliders do nothing');
        assert.equal(msg.wind.directionDeg, 45);
        assert.equal(msg.wind.speed, undefined, 'UI-shaped fields must not survive into the engine message');
    });

    test('a real wind never arrives at the 6-DOF engine as dead calm', () => {
        // The failure mode stated as a property, independent of shape.
        const msg = buildMessage(1, 'sixdof', DISC, UI_THROW, { speed: 12, direction: 0 }, null);
        assert.ok(msg.wind.speedMps > 0, 'non-zero UI wind became calm in the engine message');
    });

    test('the LEGACY message keeps the UI shape, which is what that engine reads', () => {
        // flightPhysics.js reads `wind.speed`/`wind.direction`; converting
        // here would break the legacy path in the mirror-image way.
        const msg = buildMessage(1, 'legacy', DISC, UI_THROW, { speed: 6, direction: 45 }, null);
        assert.equal(msg.engine, 'legacy');
        assert.equal(msg.wind.speed, 6);
        assert.equal(msg.wind.direction, 45);
    });

    test('missing wind degrades to calm on both engines rather than throwing', () => {
        assert.equal(buildMessage(1, 'sixdof', DISC, UI_THROW, undefined, null).wind.speedMps, 0);
        assert.doesNotThrow(() => buildMessage(1, 'legacy', DISC, UI_THROW, undefined, null));
    });

    test('the 6-DOF message carries a built throwSpec, not the raw UI throw', () => {
        const msg = buildMessage(1, 'sixdof', DISC, UI_THROW, { speed: 0, direction: 0 }, null);
        assert.ok(Number.isFinite(msg.params.releaseSpeedMps));
        assert.ok(Number.isFinite(msg.params.spinRpm));
        assert.equal(msg.params.power, undefined, 'UI throw fields must not leak into the engine spec');
    });
});

// ─── DEFAULT_THROW_SETTINGS ──────────────────────────────────────────

describe('DEFAULT_THROW_SETTINGS', () => {
    test('carries every field the throw UI controls', () => {
        for (const k of ['power', 'aimAngle', 'releaseAngle', 'noseAngle']) {
            assert.ok(Number.isFinite(DEFAULT_THROW_SETTINGS[k]), `missing ${k}`);
        }
    });

    test('is frozen — Reset and initial state share one object', () => {
        // Both App.jsx's initial state and ThrowPanel's Reset button read
        // this. If a caller could mutate it, Reset would start returning
        // the player somewhere other than where they began.
        assert.throws(() => { 'use strict'; DEFAULT_THROW_SETTINGS.power = 999; });
    });

    test('builds a usable throw spec', () => {
        const spec = buildThrowSpec(DEFAULT_THROWER, DISC, {
            powerPct: DEFAULT_THROW_SETTINGS.power,
            hyzerDeg: DEFAULT_THROW_SETTINGS.releaseAngle,
            noseAngleDeg: DEFAULT_THROW_SETTINGS.noseAngle,
        });
        assert.ok(spec.releaseSpeedMps > 0);
        assert.ok(spec.spinRpm > 0);
    });
});
