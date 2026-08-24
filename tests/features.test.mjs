/**
 * Guards on src/features.js — what the app is willing to show.
 *
 * WHY THIS FILE EXISTS: a feature flag that is only honoured in some of
 * the places it needs to be is worse than no flag, because it reads as
 * handled. Flight simulation reaches the UI through four separate doors
 * — a toolbar button, a keyboard shortcut, a panel, and an engine A/B
 * switch — and closing three of them still strands a player in a mode
 * with no panel.
 *
 * These tests read the source rather than trusting the comments in it,
 * for the same reason tests/map/mapStyles.test.mjs reads MapCanvas: a
 * convention nobody checks is a convention that rots.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { FLIGHT_SIM_ENABLED, BAG_ANALYSIS_ENABLED } from '../src/features.js';

const src = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');

describe('feature flags', () => {
    test('both are real booleans, not truthy strings', () => {
        // `export const X = 'false'` would be permanently ON and look OFF.
        assert.equal(typeof FLIGHT_SIM_ENABLED, 'boolean');
        assert.equal(typeof BAG_ANALYSIS_ENABLED, 'boolean');
    });

    test('the flag file explains why, not just what', () => {
        // This file is the record of which parts of the app can be
        // believed. A bare `= false` tells a future reader nothing about
        // what would have to be true to flip it.
        const s = src('features.js');
        assert.match(s, /4 of 23|4\/23/, 'must cite the actual envelope score');
        assert.match(s, /field-data/, 'must say how the flag comes back');
    });
});

describe('every door into flight simulation is gated', () => {
    test('the toolbar button is conditional on the flag', () => {
        assert.match(
            src('components/Toolbar.jsx'),
            /FLIGHT_SIM_ENABLED \?\s*\[\{\s*id: 'throw'/,
            'the Throw mode button must be behind the flag',
        );
    });

    test('the keyboard shortcut cannot reach a hidden mode', () => {
        // The subtlest door: with the button gone but 't' live, a player
        // lands in a mode with no panel and no obvious way out.
        assert.match(
            src('App.jsx'),
            /case 't':[^\n]*FLIGHT_SIM_ENABLED[^\n]*setMode\('throw'\)/,
            "the 't' shortcut must check the flag",
        );
    });

    test('the throw panel is gated, not merely mode-hidden', () => {
        assert.match(
            src('App.jsx'),
            /FLIGHT_SIM_ENABLED && mode === 'throw'/,
            'ThrowPanel visibility must depend on the flag',
        );
    });

    test('the engine A/B switch is gated with it', () => {
        // It chooses between two simulators, neither of which is shown.
        assert.match(src('components/Toolbar.jsx'), /FLIGHT_SIM_ENABLED && <EngineToggle/);
    });
});

describe('what stays visible', () => {
    test('measure mode is untouched — it is geometry, not simulation', () => {
        const s = src('components/Toolbar.jsx');
        assert.match(s, /id: 'measure'/);
        assert.ok(!/FLIGHT_SIM_ENABLED \?[^\n]*'measure'/.test(s), 'measure must not be gated');
    });

    test('the hole card is untouched — it reads survey data', () => {
        const s = src('App.jsx');
        assert.match(s, /<HoleCard/);
        assert.ok(!/FLIGHT_SIM_ENABLED[^\n]*HoleCard/.test(s), 'HoleCard must not be gated');
    });

    test('the physics engine and its tests are still present', () => {
        // The flag hides a feature; it must not have been used as cover
        // for deleting work that a field session would revive.
        assert.ok(src('physics/sixDof.js').length > 1000);
        assert.ok(src('physics/discCoefficients.js').length > 1000);
    });
});
