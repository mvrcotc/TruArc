/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  TruArc — 6-DOF Engine Invariants                               ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Properties of the ENGINE, independent of how well it is calibrated.
 * flight-envelopes.test.mjs asks "does it match reality?"; this file
 * asks "is it the physics we think it is?" — and these must pass even
 * mid-calibration, so a sign flip or a broken frame is caught the
 * moment it is introduced rather than being absorbed into a fit.
 *
 *   npm run test:physics-invariants
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { simulateFlight, mphToMps, spinSignFor } from '../src/physics/sixDof.js';
import { discToCoefficients, ACTIVE_MAPPING } from '../src/physics/discCoefficients.js';

const M_TO_FT = 3.28084;

const DESTROYER = { speed: 12, glide: 5, turn: -1, fade: 3 };
const FIREBIRD = { speed: 9, glide: 3, turn: 0, fade: 4 };
const LEOPARD = { speed: 6, glide: 5, turn: -2, fade: 1 };

function fly(disc, { mph = 60, rpm = 1200, nose = 3, hyzer = 0, dt = 0.002, hand = 'RH', style = 'BH', wind } = {}) {
    const r = simulateFlight(
        disc,
        {
            releaseSpeedMps: mphToMps(mph),
            spinRpm: rpm,
            noseAngleDeg: nose,
            hyzerDeg: hyzer,
            launchAngleDeg: ACTIVE_MAPPING.launchAngleDeg,
            releaseHeightM: 1.4,
            hand,
            style,
        },
        wind ?? {},
        () => 0,
        { coefficients: discToCoefficients(disc), dt },
    );
    const land = r.points[r.landingIndex];
    let maxRight = 0;
    let maxLeft = 0;
    for (let i = 0; i <= r.landingIndex; i++) {
        maxRight = Math.max(maxRight, r.points[i].x);
        maxLeft = Math.min(maxLeft, r.points[i].x);
    }
    return {
        distanceFt: r.totalDistance * M_TO_FT,
        finishFt: land.x * M_TO_FT,
        maxRightFt: maxRight * M_TO_FT,
        maxLeftFt: maxLeft * M_TO_FT,
        apexFt: r.maxHeight * M_TO_FT,
        timeS: r.flightTimeS,
        raw: r,
    };
}

/** Lateral offset (m) at a given forward distance (m), interpolated. */
function lateralAtForward(result, forwardM) {
    const pts = result.points;
    for (let i = 1; i <= result.landingIndex; i++) {
        if (pts[i].z >= forwardM) {
            const span = pts[i].z - pts[i - 1].z;
            const f = span > 1e-9 ? (forwardM - pts[i - 1].z) / span : 0;
            return pts[i - 1].x + (pts[i].x - pts[i - 1].x) * f;
        }
    }
    return pts[result.landingIndex].x;
}

describe('Integration', () => {
    test('is timestep-converged (validates the axisymmetric formulation)', () => {
        // The engine integrates n̂/ω_t/s rather than a quaternion precisely
        // so that dt need not resolve the ~1200 rpm spin phase. If this
        // ever fails, someone has reintroduced a fast mode into the state.
        const ref = fly(DESTROYER, { dt: 0.001 });
        for (const dt of [0.002, 0.004, 0.008]) {
            const got = fly(DESTROYER, { dt });
            assert.ok(
                Math.abs(got.distanceFt - ref.distanceFt) < 1.0,
                `dt=${dt}: distance ${got.distanceFt.toFixed(1)} vs ${ref.distanceFt.toFixed(1)} ft`,
            );
            assert.ok(
                Math.abs(got.finishFt - ref.finishFt) < 1.0,
                `dt=${dt}: finish ${got.finishFt.toFixed(1)} vs ${ref.finishFt.toFixed(1)} ft`,
            );
        }
    });

    test('produces finite trajectories with a real landing', () => {
        const r = fly(DESTROYER).raw;
        assert.ok(r.landingIndex > 10, 'landing index suspiciously early');
        for (const p of r.points) {
            assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z));
        }
        assert.ok(r.points[r.landingIndex].y <= 0.01, 'disc did not reach the ground');
    });
});

describe('Sign conventions', () => {
    test('RHBH spin is negative about the top normal', () => {
        assert.equal(spinSignFor('RH', 'BH'), -1);
        assert.equal(spinSignFor('LH', 'FH'), -1);
        assert.equal(spinSignFor('RH', 'FH'), 1);
        assert.equal(spinSignFor('LH', 'BH'), 1);
    });

    test('an overstable disc never crosses right of the aim line (RHBH)', () => {
        // Firebird: turn 0 / fade 4. If this ever drifts right, the
        // pitching-moment sign has inverted.
        const r = fly(FIREBIRD, { mph: 60 });
        assert.ok(r.maxRightFt < 5, `Firebird drifted ${r.maxRightFt.toFixed(1)} ft right`);
        assert.ok(r.finishFt < 0, `Firebird finished ${r.finishFt.toFixed(1)} ft (should be left)`);
    });

    // Release-angle assertions compare the two LINES at a common forward
    // distance, not at landing. Landing lateral is confounded by flight
    // length — a steep hyzer lands much shorter, so it can finish less
    // far left while being unambiguously left of the flat line the whole
    // way. Comparing at equal reach isolates the release angle's effect.

    test('a hyzer release flies left of a flat one', () => {
        const flat = fly(FIREBIRD, { mph: 60, hyzer: 0 });
        const hyzer = fly(FIREBIRD, { mph: 60, hyzer: -20 });
        const reach = Math.min(flat.raw.points[flat.raw.landingIndex].z, hyzer.raw.points[hyzer.raw.landingIndex].z) * 0.9;
        assert.ok(
            lateralAtForward(hyzer.raw, reach) < lateralAtForward(flat.raw, reach),
            `at ${(reach * M_TO_FT).toFixed(0)} ft out: hyzer ${(lateralAtForward(hyzer.raw, reach) * M_TO_FT).toFixed(1)} `
            + `not left of flat ${(lateralAtForward(flat.raw, reach) * M_TO_FT).toFixed(1)}`,
        );
    });

    test('an anhyzer release flies right of a flat one', () => {
        const flat = fly(LEOPARD, { mph: 55 });
        const anhyzer = fly(LEOPARD, { mph: 55, hyzer: 15 });
        const reach = Math.min(flat.raw.points[flat.raw.landingIndex].z, anhyzer.raw.points[anhyzer.raw.landingIndex].z) * 0.9;
        assert.ok(
            lateralAtForward(anhyzer.raw, reach) > lateralAtForward(flat.raw, reach),
            `at ${(reach * M_TO_FT).toFixed(0)} ft out: anhyzer ${(lateralAtForward(anhyzer.raw, reach) * M_TO_FT).toFixed(1)} `
            + `not right of flat ${(lateralAtForward(flat.raw, reach) * M_TO_FT).toFixed(1)}`,
        );
    });
});

describe('Emergent stability behaviour', () => {
    test('the same disc turns more as arm speed rises', () => {
        // The core claim of the rebuild: turn is a function of the disc's
        // aerodynamic state, not a scripted phase. Faster throw → lower α
        // → further below trim → more right excursion.
        const slow = fly(DESTROYER, { mph: 40, rpm: 800 });
        const fast = fly(DESTROYER, { mph: 70, rpm: 1400 });
        assert.ok(
            fast.maxRightFt > slow.maxRightFt,
            `70mph right excursion ${fast.maxRightFt.toFixed(1)} not greater than 40mph ${slow.maxRightFt.toFixed(1)}`,
        );
    });

    test('an understable disc thrown below its speed demand acts overstable', () => {
        // The beginner meat-hook, and the single behaviour the old
        // pseudo-force engine could not express at all.
        const slow = fly(DESTROYER, { mph: 38, rpm: 760 });
        assert.ok(slow.maxRightFt < 5, `slow Destroyer turned ${slow.maxRightFt.toFixed(1)} ft right`);
        assert.ok(slow.finishFt < 0, 'slow Destroyer should hook left');
    });

    test('headwind makes a disc act less stable, tailwind more stable', () => {
        // Asserted on turn magnitude and apex — both direct readouts of
        // the disc's aerodynamic state. Landing lateral is deliberately
        // NOT used here: a tailwind flight is shorter, so it can fade
        // harder per second yet finish less far left. (The envelope
        // suite does assert landing lateral, which is the stricter and
        // more product-relevant claim.)
        const calm = fly(DESTROYER, { mph: 60 });
        const head = fly(DESTROYER, { mph: 60, wind: { speedMps: 5, directionDeg: 0 } });
        const tail = fly(DESTROYER, { mph: 60, wind: { speedMps: 5, directionDeg: 180 } });
        assert.ok(
            head.maxRightFt > calm.maxRightFt,
            `headwind right excursion ${head.maxRightFt.toFixed(1)} ≤ calm ${calm.maxRightFt.toFixed(1)}`,
        );
        assert.ok(
            tail.maxRightFt <= calm.maxRightFt + 0.1,
            `tailwind right excursion ${tail.maxRightFt.toFixed(1)} > calm ${calm.maxRightFt.toFixed(1)}`,
        );
        assert.ok(
            tail.apexFt < calm.apexFt,
            `tailwind apex ${tail.apexFt.toFixed(1)} not below calm ${calm.apexFt.toFixed(1)}`,
        );
    });
});

describe('Handedness', () => {
    test('LHBH mirrors RHBH exactly', () => {
        // Forehand and left-handed play come free from the spin sign; if
        // this ever fails, some lateral term has been hardcoded for RHBH.
        const rh = fly(DESTROYER, { mph: 60, hand: 'RH', style: 'BH' });
        const lh = fly(DESTROYER, { mph: 60, hand: 'LH', style: 'BH' });
        assert.ok(
            Math.abs(rh.distanceFt - lh.distanceFt) < 0.5,
            `distances differ: RH ${rh.distanceFt.toFixed(1)} vs LH ${lh.distanceFt.toFixed(1)}`,
        );
        assert.ok(
            Math.abs(rh.finishFt + lh.finishFt) < 0.5,
            `finishes not mirrored: RH ${rh.finishFt.toFixed(1)} vs LH ${lh.finishFt.toFixed(1)}`,
        );
    });
});

describe('Energy sanity', () => {
    test('the disc never gains ground speed while climbing under its own power', () => {
        // The "Anti-Gravity Rocket" regression from the old engine: a
        // feedback loop that let aerodynamic forces add energy.
        const r = fly(DESTROYER, { mph: 60 }).raw;
        const apexIdx = r.points.reduce((best, p, i) => (p.y > r.points[best].y ? i : best), 0);
        const speedAt = (i) => {
            const a = r.points[i - 1];
            const b = r.points[i];
            return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
        };
        // Up to the apex the disc is climbing, so speed must be falling.
        assert.ok(apexIdx > 2, 'no climb phase found');
        assert.ok(
            speedAt(apexIdx) < speedAt(2) * 1.02,
            'disc gained speed while climbing — energy is being created',
        );
    });
});
