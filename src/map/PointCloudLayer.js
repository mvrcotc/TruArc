/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  TruArc — "True View" Point Cloud Layer (Section 3, step 4)      ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Renders the decimated raw point cloud (`{course}_points.bin`, from
 * tools/lidar_pipeline/pointcloud_export.py) as `THREE.Points`, for a
 * player who wants to see the literal LiDAR return instead of TreeLayer's
 * parametric crowns. A separate Mapbox custom layer rather than a mode
 * inside TreeLayer: the two have nothing in common architecturally (no
 * meshes, no LOD, no merging — points are already cheap enough to draw
 * unmerged) beyond sharing the verified coordinate transform, and
 * Mapbox supports any number of independent custom layers sharing one
 * GL context, so there's no cost to keeping them separate.
 *
 * Same verification gap as TreeLayer.js: no Mapbox token was available,
 * so this has never rendered on a real map. The coordinate math and
 * binary decoder are independently verified — decoder against real
 * Python-packed bytes (tests/map/pointCloudFormat.test.mjs), transform
 * against Mapbox's own MercatorCoordinate (mercatorTransform.test.mjs).
 */

import * as THREE from 'three';
import { createLocalFrame, lngLatAltToScene, sceneProjectionMatrix } from './mercatorTransform.js';
import { decodePointCloud } from './pointCloudFormat.js';

// ASPRS classification -> display color. Matches process_lidar.py's
// existing calibration-overlay palette (src/components/MapCanvas.jsx's
// lidar-points-layer) so the two LiDAR visualizations in the app read
// consistently rather than using an unrelated color scheme.
const CLASS_COLORS = {
    2: [0.55, 0.35, 0.17],  // ground — brown
    3: [0.13, 0.55, 0.13],  // low vegetation
    4: [0.0, 0.5, 0.0],     // medium vegetation
    5: [0.0, 0.39, 0.0],    // high vegetation
};
const DEFAULT_COLOR = [0.0, 0.78, 1.0]; // unclassified — cyan, matches the overlay's default

export default class PointCloudLayer {
    constructor({ id = 'truarc-points', anchorLng, anchorLat, pointSizePx = 2.5 } = {}) {
        this.id = id;
        this.type = 'custom';
        this.renderingMode = '3d';

        this.frame = createLocalFrame(anchorLng, anchorLat);
        this.pointSizePx = pointSizePx;
        this.map = null;
        this.renderer = null;
        this.scene = null;
        this.camera = null;
        this._points = null; // decoded {count, lng, lat, altitudeM, classification}
        this._mesh = null;
        this._visible = true;
    }

    onAdd(map, gl) {
        this.map = map;
        this.camera = new THREE.Camera();
        this.scene = new THREE.Scene();
        this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
        this.renderer.autoClear = false;

        if (this._points) this._buildMesh();
    }

    onRemove() {
        this._disposeMesh();
        this.renderer = null;
        this.scene = null;
        this.camera = null;
        this.map = null;
    }

    render(gl, matrix) {
        if (!this.renderer || !this.scene || !this._visible) return;
        const exaggeration = this.map?.getTerrain?.()?.exaggeration ?? 1;
        this.camera.projectionMatrix = new THREE.Matrix4().fromArray(
            sceneProjectionMatrix(matrix, this.frame, exaggeration),
        );
        this.renderer.resetState();
        this.renderer.render(this.scene, this.camera);
    }

    setVisible(visible) {
        this._visible = visible;
        this.map?.triggerRepaint();
    }

    /** @param {ArrayBuffer} buffer Raw bytes fetched from {course}_points.bin */
    loadFromBuffer(buffer) {
        this.loadPoints(decodePointCloud(buffer));
    }

    /**
     * @param {{count, lng, lat, altitudeM, classification}} decoded
     *   Pre-decoded points — the seam callers use to apply the
     *   calibration offset (see calibrationOffset.applyOffsetToPointCloud)
     *   before the mesh is built, since offsetting after decode is
     *   simpler than threading it through the binary decoder itself.
     */
    loadPoints(decoded) {
        this._points = decoded;
        if (this.renderer) this._buildMesh();
        this.map?.triggerRepaint();
    }

    clear() {
        this._points = null;
        this._disposeMesh();
        this.map?.triggerRepaint();
    }

    _disposeMesh() {
        if (!this._mesh) return;
        this._mesh.geometry.dispose();
        this._mesh.material.dispose();
        this.scene?.remove(this._mesh);
        this._mesh = null;
    }

    _buildMesh() {
        this._disposeMesh();
        const { count, lng, lat, altitudeM, classification } = this._points;
        if (count === 0) return;

        const positions = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            const p = lngLatAltToScene(this.frame, lng[i], lat[i], altitudeM[i]);
            positions[i * 3] = p.x;
            positions[i * 3 + 1] = p.y;
            positions[i * 3 + 2] = p.z;
            const c = CLASS_COLORS[classification[i]] ?? DEFAULT_COLOR;
            colors[i * 3] = c[0]; colors[i * 3 + 1] = c[1]; colors[i * 3 + 2] = c[2];
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({
            size: this.pointSizePx,
            sizeAttenuation: false, // constant screen-space size — points shouldn't vanish when zoomed out over a whole course
            vertexColors: true,
        });

        this._mesh = new THREE.Points(geometry, material);
        this.scene.add(this._mesh);
    }
}
