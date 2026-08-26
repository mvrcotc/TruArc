/**
 * Tests for src/map/treeGeometry.js — the pure crown/trunk/billboard
 * math consumed by TreeLayer.js. No GL context needed.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
    crownLatheProfile, trunkRadiusM, clamp,
    formBaseColor, jitteredTreeColorHSL,
    billboardQuadGeometry, lodTierForDistance,
} from '../../src/map/treeGeometry.js';

describe('crownLatheProfile', () => {
    const CONIFER_PROFILE = [1.0, 0.85, 0.65, 0.45, 0.25, 0.08];
    const DECIDUOUS_PROFILE = [0.3, 0.7, 1.0, 0.95, 0.6, 0.25];

    test('produces one point per profile slice plus a closing apex point', () => {
        const pts = crownLatheProfile(CONIFER_PROFILE, 4.0, 6.0, 20.0);
        assert.equal(pts.length, CONIFER_PROFILE.length + 1);
    });

    test('y values are strictly increasing (a valid lathe profile)', () => {
        const pts = crownLatheProfile(DECIDUOUS_PROFILE, 4.0, 8.0, 22.0);
        for (let i = 1; i < pts.length; i++) {
            assert.ok(pts[i].y > pts[i - 1].y, `y not increasing at index ${i}: ${pts[i - 1].y} -> ${pts[i].y}`);
        }
    });

    test('first point sits exactly at the true crown base', () => {
        const pts = crownLatheProfile(CONIFER_PROFILE, 4.0, 6.0, 20.0);
        assert.equal(pts[0].y, 6.0);
    });

    test('last point closes to a point at the true treetop', () => {
        const pts = crownLatheProfile(CONIFER_PROFILE, 4.0, 6.0, 20.0);
        const last = pts[pts.length - 1];
        assert.equal(last.y, 20.0);
        assert.equal(last.radius, 0);
    });

    test('interior points fall strictly between base and top', () => {
        const pts = crownLatheProfile(CONIFER_PROFILE, 4.0, 6.0, 20.0);
        for (let i = 1; i < pts.length - 1; i++) {
            assert.ok(pts[i].y > 6.0 && pts[i].y < 20.0);
        }
    });

    test('radii scale linearly with crownRadiusM', () => {
        const a = crownLatheProfile(DECIDUOUS_PROFILE, 4.0, 8.0, 22.0);
        const b = crownLatheProfile(DECIDUOUS_PROFILE, 8.0, 8.0, 22.0);
        for (let i = 0; i < a.length - 1; i++) { // skip the closing apex (always 0)
            assert.ok(Math.abs(b[i].radius - 2 * a[i].radius) < 1e-9, `slice ${i}`);
        }
    });

    test('conifer profile tapers monotonically toward the point', () => {
        const pts = crownLatheProfile(CONIFER_PROFILE, 4.0, 6.0, 20.0);
        for (let i = 1; i < pts.length; i++) {
            assert.ok(pts[i].radius <= pts[i - 1].radius + 1e-9, `not tapering at index ${i}`);
        }
    });

    test('deciduous profile is widest strictly inside the crown, not at the base', () => {
        const pts = crownLatheProfile(DECIDUOUS_PROFILE, 4.0, 8.0, 22.0);
        const radii = pts.map((p) => p.radius);
        const maxIdx = radii.indexOf(Math.max(...radii));
        assert.ok(maxIdx > 0 && maxIdx < radii.length - 1, `widest point at index ${maxIdx}, expected interior`);
    });

    test('negative profile values are clamped to zero radius, not negative', () => {
        const pts = crownLatheProfile([-0.1, 0.5, 1.0, 0.8, 0.3, 0.1], 4.0, 6.0, 20.0);
        assert.equal(pts[0].radius, 0);
        assert.ok(pts.every((p) => p.radius >= 0));
    });

    test('rejects a profile with fewer than 2 slices', () => {
        assert.throws(() => crownLatheProfile([1.0], 4.0, 6.0, 20.0));
    });

    test('rejects heightM <= crownBaseM', () => {
        assert.throws(() => crownLatheProfile([1, 1, 1, 1, 1, 1], 4.0, 20.0, 20.0));
        assert.throws(() => crownLatheProfile([1, 1, 1, 1, 1, 1], 4.0, 25.0, 20.0));
    });

    test('works with a non-6-slice profile (schema mandates 6, but the function does not hardcode it)', () => {
        const pts = crownLatheProfile([1.0, 0.5, 0.1], 4.0, 5.0, 15.0);
        assert.equal(pts.length, 4);
    });
});

describe('trunkRadiusM', () => {
    test('increases with tree height', () => {
        assert.ok(trunkRadiusM(25) > trunkRadiusM(10));
    });

    test('stays within a plausible bound for any realistic golf-course tree', () => {
        for (const h of [3, 8, 15, 22, 35, 50]) {
            const r = trunkRadiusM(h);
            assert.ok(r >= 0.08 && r <= 0.45, `height ${h} -> radius ${r}`);
        }
    });

    test('is always smaller than a reasonable crown radius (visually plugs the base, does not dominate)', () => {
        for (const h of [5, 15, 30]) {
            assert.ok(trunkRadiusM(h) < 1.0);
        }
    });
});

describe('clamp', () => {
    test('clamps below, within, and above range', () => {
        assert.equal(clamp(-5, 0, 10), 0);
        assert.equal(clamp(5, 0, 10), 5);
        assert.equal(clamp(15, 0, 10), 10);
    });
});

describe('color', () => {
    test('conifer and deciduous get visibly different base hues', () => {
        const c = formBaseColor('conifer');
        const d = formBaseColor('deciduous');
        assert.notEqual(c.h, d.h);
    });

    test('jitter is deterministic for the same position (stable across rebuilds)', () => {
        const a = jitteredTreeColorHSL('deciduous', 123.4, -56.7);
        const b = jitteredTreeColorHSL('deciduous', 123.4, -56.7);
        assert.deepEqual(a, b);
    });

    test('jitter differs for different positions (not a flat repeated color)', () => {
        const a = jitteredTreeColorHSL('deciduous', 10, 10);
        const b = jitteredTreeColorHSL('deciduous', 200, -300);
        assert.notDeepEqual(a, b);
    });

    test('jittered values stay in valid HSL ranges', () => {
        for (const [x, z] of [[0, 0], [1000, -500], [-3, 999]]) {
            const c = jitteredTreeColorHSL('conifer', x, z);
            assert.ok(c.s >= 0 && c.s <= 1);
            assert.ok(c.l >= 0 && c.l <= 1);
        }
    });
});

describe('billboardQuadGeometry', () => {
    test('produces two quads (8 vertices, 12 indices)', () => {
        const g = billboardQuadGeometry(6.0, 18.0, 0);
        assert.equal(g.positions.length, 8 * 3);
        assert.equal(g.uvs.length, 8 * 2);
        assert.equal(g.indices.length, 12);
    });

    test('quads are centred on the vertical axis and span the requested width', () => {
        const g = billboardQuadGeometry(6.0, 18.0, 0);
        const xs = [g.positions[0], g.positions[3]];
        assert.ok(Math.abs(xs[0] + 3) < 1e-9 && Math.abs(xs[1] - 3) < 1e-9);
    });

    test('quads span from baseY to baseY + heightM', () => {
        const g = billboardQuadGeometry(6.0, 18.0, 137.0);
        const ys = g.positions.filter((_, i) => i % 3 === 1);
        assert.ok(Math.min(...ys) === 137.0);
        assert.ok(Math.max(...ys) === 155.0);
    });

    test('the two quads are perpendicular (one in X-Y, one in Z-Y)', () => {
        const g = billboardQuadGeometry(4.0, 10.0, 0);
        // Quad 1 vertices (indices 0-3): all z == 0
        for (let i = 0; i < 4; i++) assert.equal(g.positions[i * 3 + 2], 0);
        // Quad 2 vertices (indices 4-7): all x == 0
        for (let i = 4; i < 8; i++) assert.equal(g.positions[i * 3 + 0], 0);
    });
});

describe('lodTierForDistance', () => {
    test('near tier at or below the threshold', () => {
        assert.equal(lodTierForDistance(0), 'near');
        assert.equal(lodTierForDistance(299), 'near');
        assert.equal(lodTierForDistance(300), 'near');
    });

    test('far tier beyond the threshold', () => {
        assert.equal(lodTierForDistance(301), 'far');
        assert.equal(lodTierForDistance(5000), 'far');
    });

    test('threshold is configurable', () => {
        assert.equal(lodTierForDistance(150, 100), 'far');
        assert.equal(lodTierForDistance(150, 200), 'near');
    });
});
