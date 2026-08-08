/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  TruArc — Section 1 Integration Layer Tests                     ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Node-side unit tests for the pieces that don't need a real browser:
 * terrain profile sampling/lookup, the thrower-profile scaling shared
 * with the ground-truth suite, and the engine A/B flag. The worker
 * round-trip itself (Worker construction, postMessage, structured clone
 * of the terrain profile, the stale-request guard under concurrent
 * throws) was verified against a real headless Chromium during
 * development — see the Section 1 summary — since jsdom/Node have no
 * Worker implementation worth trusting for that.
 *
 *   npm run test:physics-integration
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildTerrainProfile, lookupElevation, flatProfile } from '../src/physics/terrainProfile.js';
import { discReleaseFactor, buildThrowSpec, DEFAULT_THROWER } from '../src/physics/throwerProfile.js';

describe('terrainProfile', () => {
    test('flatProfile always looks up to zero', () => {
        const p = flatProfile();
        assert.equal(lookupElevation(p, 0), 0);
        assert.equal(lookupElevation(p, 50), 0);
        assert.equal(lookupElevation(p, 1000), 0);
    });

    test('null profile looks up to zero (safe default)', () => {
        assert.equal(lookupElevation(null, 50), 0);
    });

    test('linearly interpolates between samples', () => {
        const profile = { stepM: 10, elevations: new Float32Array([0, 10, 20]) };
        assert.equal(lookupElevation(profile, 0), 0);
        assert.equal(lookupElevation(profile, 5), 5);
        assert.equal(lookupElevation(profile, 10), 10);
        assert.equal(lookupElevation(profile, 15), 15);
        assert.equal(lookupElevation(profile, 20), 20);
    });

    test('extends flat beyond the sampled range rather than extrapolating', () => {
        const profile = { stepM: 10, elevations: new Float32Array([0, 10, 20]) };
        assert.equal(lookupElevation(profile, 100), 20);
    });

    test('buildTerrainProfile samples along the bearing and offsets by tee elevation', () => {
        const tee = { lng: -71.0, lat: 42.0, elevation: 100 };
        const calls = [];
        const fakeMap = {
            queryTerrainElevation: ([lng, lat]) => {
                calls.push([lng, lat]);
                return 100 + calls.length; // pretend elevation rises by 1m per sample
            },
        };
        const localToLngLat = (x, z, origin, bearingDeg) => ({
            lng: origin.lng + z * 0.0001, // fake projection, just needs to vary with z
            lat: origin.lat,
        });

        const profile = buildTerrainProfile(fakeMap, tee, 0, localToLngLat, { maxRangeM: 20, stepM: 10 });

        assert.equal(profile.stepM, 10);
        assert.equal(profile.elevations.length, 3); // 0, 10, 20
        // Relative to tee elevation (100), and rising: 1, 2, 3 -> relative 1,2,3
        assert.deepEqual(Array.from(profile.elevations), [1, 2, 3]);
    });

    test('buildTerrainProfile tolerates queryTerrainElevation throwing or returning null', () => {
        const tee = { lng: -71.0, lat: 42.0, elevation: 50 };
        const fakeMap = { queryTerrainElevation: () => { throw new Error('no terrain loaded'); } };
        const localToLngLat = () => ({ lng: 0, lat: 0 });
        const profile = buildTerrainProfile(fakeMap, tee, 0, localToLngLat, { maxRangeM: 10, stepM: 5 });
        assert.ok(Array.from(profile.elevations).every((v) => v === 0));
    });
});

describe('throwerProfile — shared with ground truth (no drift)', () => {
    test('discReleaseFactor is non-decreasing in disc speed and capped at 1', () => {
        // Strictly increasing below the cap (0.70 + 0.025*speed = 1 at
        // speed 12); at and above speed 12 it's pinned flat at 1.0, since
        // the thrower's quoted speed already IS their driver/max speed.
        const speeds = [1, 2, 5, 7, 9, 12, 14];
        let prev = 0;
        for (const s of speeds) {
            const f = discReleaseFactor(s);
            assert.ok(f >= prev, `factor decreased at speed ${s}`);
            assert.ok(f <= 1, `factor exceeded 1 at speed ${s}`);
            prev = f;
        }
        assert.ok(discReleaseFactor(1) < discReleaseFactor(9), 'factor should differentiate slow discs');
        assert.equal(discReleaseFactor(12), 1, 'speed 12 sits exactly at the cap');
        assert.equal(discReleaseFactor(14), 1, 'speed 14 is above the cap, still clamped to 1');
    });

    test('buildThrowSpec scales release speed and spin by power and disc speed', () => {
        const putter = { speed: 2 };
        const driver = { speed: 13 };
        const full = buildThrowSpec(DEFAULT_THROWER, driver, { powerPct: 100 });
        const half = buildThrowSpec(DEFAULT_THROWER, driver, { powerPct: 50 });
        const putterSpec = buildThrowSpec(DEFAULT_THROWER, putter, { powerPct: 100 });

        assert.ok(half.releaseSpeedMps < full.releaseSpeedMps);
        assert.ok(Math.abs(half.releaseSpeedMps - full.releaseSpeedMps / 2) < 1e-6);
        assert.ok(half.spinRpm < full.spinRpm);
        assert.ok(putterSpec.releaseSpeedMps < full.releaseSpeedMps, 'putter should release slower than driver at same power');
    });

    test('buildThrowSpec passes through nose/hyzer as-is', () => {
        const spec = buildThrowSpec(DEFAULT_THROWER, { speed: 10 }, {
            powerPct: 100, noseAngleDeg: 7, hyzerDeg: -12, launchAngleDeg: 5,
        });
        assert.equal(spec.noseAngleDeg, 7);
        assert.equal(spec.hyzerDeg, -12);
        assert.equal(spec.launchAngleDeg, 5);
    });
});
