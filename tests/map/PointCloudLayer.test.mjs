/**
 * Tests for src/map/PointCloudLayer.js's scene-construction logic.
 * Same rationale as TreeLayer.test.mjs: THREE's geometry/Points classes
 * are plain data structures, testable without a GL context; only
 * `renderer.render()` genuinely needs a browser.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import PointCloudLayer from '../../src/map/PointCloudLayer.js';
import { lngLatAltToScene } from '../../src/map/mercatorTransform.js';

const ANCHOR = { anchorLng: -71.896, anchorLat: 42.2765 };

function makeTestLayer() {
    const layer = new PointCloudLayer(ANCHOR);
    layer.scene = new THREE.Scene();
    return layer;
}

// Minimal fake decoded point cloud, bypassing the binary decoder (which
// has its own dedicated tests against real Python bytes).
function fakeDecoded(points) {
    return {
        count: points.length,
        lng: Float64Array.from(points.map((p) => p.lng)),
        lat: Float64Array.from(points.map((p) => p.lat)),
        altitudeM: Float32Array.from(points.map((p) => p.alt)),
        classification: Uint8Array.from(points.map((p) => p.cls)),
    };
}

describe('PointCloudLayer scene construction (no GL context required)', () => {
    test('setting _points before onAdd does not throw (no renderer yet)', () => {
        const layer = new PointCloudLayer(ANCHOR);
        // No scene yet — just confirm decode + storage doesn't throw.
        layer._points = fakeDecoded([{ lng: -71.896, lat: 42.2765, alt: 137, cls: 5 }]);
        assert.equal(layer._points.count, 1);
    });

    test('an empty point cloud produces no mesh', () => {
        const layer = makeTestLayer();
        layer._points = fakeDecoded([]);
        layer._buildMesh();
        assert.equal(layer.scene.children.length, 0);
    });

    test('a nonempty point cloud produces exactly one THREE.Points mesh', () => {
        const layer = makeTestLayer();
        layer._points = fakeDecoded([
            { lng: -71.896, lat: 42.2765, alt: 137, cls: 5 },
            { lng: -71.8958, lat: 42.2767, alt: 140, cls: 2 },
        ]);
        layer._buildMesh();
        assert.equal(layer.scene.children.length, 1);
        assert.ok(layer.scene.children[0].isPoints);
    });

    test('positions match the verified coordinate transform', () => {
        const layer = makeTestLayer();
        const pt = { lng: -71.8955, lat: 42.277, alt: 150 };
        layer._points = fakeDecoded([{ ...pt, cls: 5 }]);
        layer._buildMesh();
        const pos = layer.scene.children[0].geometry.attributes.position.array;
        const expected = lngLatAltToScene(layer.frame, pt.lng, pt.lat, pt.alt);
        // Position buffers are intentionally Float32Array (GPU-native) —
        // the tolerance reflects float32 precision at these coordinate
        // magnitudes (~1cm), not the float64 precision of the transform
        // itself (which mercatorTransform.test.mjs verifies separately).
        assert.ok(Math.abs(pos[0] - expected.x) < 0.01, `x: ${pos[0]} vs ${expected.x}`);
        assert.ok(Math.abs(pos[1] - expected.y) < 0.01, `y: ${pos[1]} vs ${expected.y}`);
        assert.ok(Math.abs(pos[2] - expected.z) < 0.01, `z: ${pos[2]} vs ${expected.z}`);
    });

    test('vertex colors differ between ground and vegetation classifications', () => {
        const layer = makeTestLayer();
        layer._points = fakeDecoded([
            { lng: -71.896, lat: 42.2765, alt: 137, cls: 2 }, // ground
            { lng: -71.896, lat: 42.2765, alt: 137, cls: 5 }, // high veg
        ]);
        layer._buildMesh();
        const colors = layer.scene.children[0].geometry.attributes.color.array;
        const groundColor = [colors[0], colors[1], colors[2]];
        const vegColor = [colors[3], colors[4], colors[5]];
        assert.notDeepEqual(groundColor, vegColor);
    });

    test('rebuilding disposes the previous mesh', () => {
        const layer = makeTestLayer();
        layer._points = fakeDecoded([{ lng: -71.896, lat: 42.2765, alt: 137, cls: 5 }]);
        layer._buildMesh();
        const first = layer.scene.children[0];
        let disposed = false;
        first.geometry.dispose = () => { disposed = true; };
        layer._buildMesh();
        assert.ok(disposed);
        assert.equal(layer.scene.children.length, 1, 'should not accumulate meshes across rebuilds');
    });

    test('setVisible(false) suppresses rendering without touching the scene', () => {
        const layer = makeTestLayer();
        layer._points = fakeDecoded([{ lng: -71.896, lat: 42.2765, alt: 137, cls: 5 }]);
        layer._buildMesh();
        layer.map = { triggerRepaint: () => {} };
        layer.setVisible(false);
        assert.equal(layer._visible, false);
        assert.equal(layer.scene.children.length, 1, 'mesh should remain built, just not rendered');
        // render() must no-op when invisible and not throw despite no renderer.
        assert.doesNotThrow(() => layer.render(null, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]));
    });

    test('clear() removes the mesh and resets stored points', () => {
        const layer = makeTestLayer();
        layer._points = fakeDecoded([{ lng: -71.896, lat: 42.2765, alt: 137, cls: 5 }]);
        layer._buildMesh();
        layer.map = { triggerRepaint: () => {} };
        layer.clear();
        assert.equal(layer._points, null);
        assert.equal(layer.scene.children.length, 0);
    });
});
