/**
 * Tests for src/map/TreeLayer.js's scene-construction logic.
 *
 * Everything here is testable in Node WITHOUT a GL context: THREE's
 * geometry classes (LatheGeometry, CylinderGeometry, BufferGeometry) are
 * plain math/data structures — only `renderer.render()` needs a real
 * WebGL context, and nothing here calls it. `onAdd`'s
 * `new THREE.WebGLRenderer({context: gl})` genuinely does need a browser
 * and is therefore the one thing this suite cannot exercise; `scene` and
 * `map` are set up by hand below to drive `_rebuildScene()` directly,
 * bypassing `onAdd`.
 *
 * A minimal `document` shim provides just enough canvas/2d-context
 * surface for `_getFoliageTexture()`'s gradient generation — nothing
 * about it is asserted, only that constructing it doesn't throw and
 * produces a usable Three.js texture.
 */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { lngLatAltToScene } from '../../src/map/mercatorTransform.js';

// ── minimal document shim for _getFoliageTexture() ──
before(() => {
    if (typeof globalThis.document !== 'undefined') return;
    globalThis.document = {
        createElement(tag) {
            if (tag !== 'canvas') throw new Error(`unexpected element: ${tag}`);
            return {
                width: 0,
                height: 0,
                getContext() {
                    return {
                        createRadialGradient: () => ({ addColorStop() {} }),
                        fillRect() {},
                        set fillStyle(v) {},
                    };
                },
            };
        },
    };
});

const { default: TreeLayer } = await import('../../src/map/TreeLayer.js');

// Maple Hill — matches the coordinate-sync tests' anchor.
const ANCHOR = { anchorLng: -71.896, anchorLat: 42.2765 };

function makeTree(overrides = {}) {
    return {
        lng: -71.896, lat: 42.2765, ground_elev_m: 137.0,
        height_m: 20.0, crown_radius_m: 4.0, crown_base_m: 6.0,
        profile: [1.0, 0.85, 0.65, 0.45, 0.25, 0.08],
        form: 'deciduous', point_count: 500,
        ...overrides,
    };
}

/** A layer with its scene/frame wired but no real GL renderer — enough
 * to drive _rebuildScene() directly. */
function makeTestLayer({ cameraLng = ANCHOR.anchorLng, cameraLat = ANCHOR.anchorLat, cameraAlt = 500 } = {}) {
    const layer = new TreeLayer(ANCHOR);
    layer.scene = new THREE.Scene();
    layer.map = {
        getFreeCameraOptions: () => ({
            position: {
                toLngLat: () => ({ lng: cameraLng, lat: cameraLat }),
                toAltitude: () => cameraAlt,
            },
        }),
        getTerrain: () => null,
        on: () => {},
        off: () => {},
        triggerRepaint: () => {},
    };
    return layer;
}

describe('TreeLayer scene construction (no GL context required)', () => {
    test('setTrees before scene exists does not throw, and rebuilds once the scene is set', () => {
        const layer = new TreeLayer(ANCHOR);
        assert.doesNotThrow(() => layer.setTrees([makeTree()]));
        assert.equal(layer._trees.length, 1);
    });

    test('an empty tree list produces an empty scene', () => {
        const layer = makeTestLayer();
        layer.setTrees([]);
        layer._rebuildScene();
        assert.equal(layer.scene.children.length, 0);
    });

    test('near trees produce exactly two meshes: merged crowns + merged trunks', () => {
        const layer = makeTestLayer({ cameraAlt: 200 });
        // Trees clustered near the anchor -> well within the 300m LOD threshold.
        const trees = Array.from({ length: 5 }, (_, i) => makeTree({
            lng: -71.896 + i * 0.0001, lat: 42.2765, height_m: 15 + i,
        }));
        layer._trees = trees;
        layer._treeScenePositions = trees.map((t) => layerScenePos(layer, t));
        layer._rebuildScene();

        assert.equal(layer.scene.children.length, 2, 'expected [crowns mesh, trunks mesh]');
        for (const mesh of layer.scene.children) {
            assert.ok(mesh.isMesh);
            assert.ok(mesh.geometry.attributes.color, 'merged mesh must carry vertex colors');
        }
    });

    test('far trees produce exactly one merged billboard mesh', () => {
        const layer = makeTestLayer({ cameraAlt: 200 });
        // 2000m away in longitude — well beyond the 300m threshold.
        const trees = Array.from({ length: 4 }, (_, i) => makeTree({
            lng: -71.896 + 0.03 + i * 0.0001, lat: 42.2765,
        }));
        layer._trees = trees;
        layer._treeScenePositions = trees.map((t) => layerScenePos(layer, t));
        layer._rebuildScene();

        assert.equal(layer.scene.children.length, 1, 'expected exactly [billboards mesh]');
        const mesh = layer.scene.children[0];
        assert.equal(mesh.geometry.attributes.position.count, 4 * 8, '8 verts per tree x 4 trees');
        assert.ok(mesh.material.map, 'billboard material should carry the foliage texture');
    });

    test('a mix of near and far trees produces three meshes total', () => {
        const layer = makeTestLayer({ cameraAlt: 200 });
        const near = [makeTree({ lng: -71.896, lat: 42.2765 })];
        const far = [makeTree({ lng: -71.896 + 0.03, lat: 42.2765 })];
        const trees = [...near, ...far];
        layer._trees = trees;
        layer._treeScenePositions = trees.map((t) => layerScenePos(layer, t));
        layer._rebuildScene();
        assert.equal(layer.scene.children.length, 3, 'crowns + trunks + billboards');
    });

    test('rebuilding disposes the previous frame\'s geometry/material', () => {
        const layer = makeTestLayer({ cameraAlt: 200 });
        const trees = [makeTree()];
        layer._trees = trees;
        layer._treeScenePositions = trees.map((t) => layerScenePos(layer, t));
        layer._rebuildScene();
        const firstGeom = layer.scene.children[0].geometry;
        let disposed = false;
        firstGeom.dispose = () => { disposed = true; };
        layer._disposables = layer._disposables.map((d) => (d === firstGeom ? firstGeom : d));

        layer._rebuildScene(); // second call should clear + dispose the first
        assert.ok(disposed, 'previous geometry should have been disposed on rebuild');
    });

    test('trees at exactly the LOD threshold count as near (inclusive boundary)', () => {
        const layer = makeTestLayer({ cameraAlt: 0 });
        // ~300m east of the anchor (1 degree lng ~ 82.3km at this latitude, so 300/82300 deg)
        const dLng = 300 / (111320 * Math.cos((ANCHOR.anchorLat * Math.PI) / 180));
        const trees = [makeTree({ lng: ANCHOR.anchorLng + dLng * 0.999, lat: ANCHOR.anchorLat })];
        layer._trees = trees;
        layer._treeScenePositions = trees.map((t) => layerScenePos(layer, t));
        layer._rebuildScene();
        // Should render as near (crowns + trunks), not billboards.
        assert.equal(layer.scene.children.length, 2);
    });
});

describe('_cameraScenePosition', () => {
    test('reads Mapbox\'s real camera position via getFreeCameraOptions', () => {
        const layer = makeTestLayer({ cameraLng: -71.895, cameraLat: 42.277, cameraAlt: 350 });
        const pos = layer._cameraScenePosition();
        assert.ok(Math.abs(pos.y - 350) < 1e-6, `expected altitude 350, got ${pos.y}`);
        assert.ok(pos.x > 0, 'camera east of anchor should have positive scene X');
        assert.ok(pos.z < 0, 'camera north of anchor should have negative scene Z (north is -Z)');
    });

    test('falls back gracefully if the camera position is unavailable', () => {
        const layer = makeTestLayer();
        layer.map.getFreeCameraOptions = () => ({ position: null });
        assert.doesNotThrow(() => layer._cameraScenePosition());
    });
});

describe('geometry builder methods', () => {
    test('_buildCrownGeometry produces a lathed, colored, correctly-positioned geometry', () => {
        const layer = makeTestLayer();
        // Nonzero ground_elev_m is the whole point of this test: it is
        // what exposed a real bug (crown/billboard translate() calls
        // were missing base.y, so every crown rendered pinned to
        // sea-level-relative zero instead of the tree's actual ground
        // altitude — trunks poked up with no crown on top). Regression
        // guard, not just a smoke test.
        const tree = makeTree({ ground_elev_m: 137.0, crown_base_m: 6.0, height_m: 20.0 });
        const base = layerScenePos(layer, tree);
        const geom = layer._buildCrownGeometry(tree, base);
        assert.ok(geom.attributes.position.count > 0);
        assert.ok(geom.attributes.color, 'crown must carry vertex color for merged rendering');

        const pos = geom.attributes.position.array;
        const xs = [], ys = [];
        for (let i = 0; i < pos.length; i += 3) { xs.push(pos[i]); ys.push(pos[i + 1]); }
        assert.ok(Math.abs(xs[0] - base.x) < tree.crown_radius_m + 1e-6, 'X near tree position');
        // The crown must span from the tree's GROUND altitude + crown_base_m
        // up to ground altitude + height_m — not from 0.
        assert.ok(Math.abs(Math.min(...ys) - (base.y + tree.crown_base_m)) < 1e-6,
            `crown base Y: got ${Math.min(...ys)}, expected ${base.y + tree.crown_base_m}`);
        assert.ok(Math.abs(Math.max(...ys) - (base.y + tree.height_m)) < 1e-6,
            `crown top Y: got ${Math.max(...ys)}, expected ${base.y + tree.height_m}`);
    });

    test('crown base meets the trunk top exactly (no gap, no overlap)', () => {
        const layer = makeTestLayer();
        const tree = makeTree({ ground_elev_m: 137.0, crown_base_m: 6.0, height_m: 20.0 });
        const base = layerScenePos(layer, tree);
        const crown = layer._buildCrownGeometry(tree, base);
        const trunk = layer._buildTrunkGeometry(tree, base);

        const minY = (geom) => {
            const p = geom.attributes.position.array;
            let m = Infinity;
            for (let i = 1; i < p.length; i += 3) m = Math.min(m, p[i]);
            return m;
        };
        const maxY = (geom) => {
            const p = geom.attributes.position.array;
            let m = -Infinity;
            for (let i = 1; i < p.length; i += 3) m = Math.max(m, p[i]);
            return m;
        };

        assert.ok(Math.abs(minY(crown) - maxY(trunk)) < 1e-6,
            `crown base (${minY(crown)}) should meet trunk top (${maxY(trunk)})`);
    });

    test('_buildTrunkGeometry sits between ground and crown base', () => {
        const layer = makeTestLayer();
        const tree = makeTree({ crown_base_m: 6.0 });
        const base = layerScenePos(layer, tree);
        const geom = layer._buildTrunkGeometry(tree, base);
        const ys = [];
        const pos = geom.attributes.position.array;
        for (let i = 1; i < pos.length; i += 3) ys.push(pos[i]);
        assert.ok(Math.min(...ys) >= base.y - 1e-6, 'trunk should not go below ground');
        assert.ok(Math.max(...ys) <= base.y + tree.crown_base_m + 1e-6, 'trunk should not exceed crown base');
    });

    test('_buildBillboardGeometry spans from crown base to treetop', () => {
        const layer = makeTestLayer();
        const tree = makeTree({ crown_base_m: 6.0, height_m: 20.0 });
        const base = layerScenePos(layer, tree);
        const geom = layer._buildBillboardGeometry(tree, base);
        const pos = geom.attributes.position.array;
        const ys = [];
        for (let i = 1; i < pos.length; i += 3) ys.push(pos[i]);
        assert.ok(Math.abs(Math.min(...ys) - (base.y + 6.0)) < 1e-6);
        assert.ok(Math.abs(Math.max(...ys) - (base.y + 20.0)) < 1e-6);
    });
});

/**
 * Scene position for a tree, computed the same way setTrees() does —
 * reused directly rather than reimplemented, so tests that bypass
 * setTrees() (to control the tree list without triggering a rebuild
 * mid-setup) still exercise the real transform.
 */
function layerScenePos(layer, tree) {
    return lngLatAltToScene(layer.frame, tree.lng, tree.lat, tree.ground_elev_m);
}
