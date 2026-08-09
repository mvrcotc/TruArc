/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  TruArc — Three.js Tree Layer (Section 3)                        ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * A Mapbox `CustomLayerInterface` that renders the LiDAR tree inventory
 * with a Three.js scene sharing Mapbox's WebGL context.
 *
 * WHY A CUSTOM LAYER AT ALL: Mapbox `model` layers can only place and
 * scale pre-made glTF assets — structurally incapable of per-tree
 * geometry. That is the placeholder-tree problem this section exists to
 * fix: MapCanvas.jsx currently stretches two generic Kenney GLBs by a
 * height number, discarding the crown shape Section 2 worked to measure.
 *
 * ────────────────────────────────────────────────────────────────────
 * STATUS: coordinate sync (step 1) is complete and unit-tested against
 * Mapbox's own MercatorCoordinate — see src/map/mercatorTransform.js and
 * tests/map/mercatorTransform.test.mjs.
 *
 * The geometry here is a deliberate PLACEHOLDER: one crude cylinder per
 * tree, sized from the record, existing only so the transform can be
 * eyeballed on a real map. Step 2 replaces `buildTreeMesh()` with
 * profile-lathed crowns, batching, and LOD. Everything outside that one
 * function — context sharing, the matrix, terrain anchoring, disposal —
 * is the finished part.
 * ────────────────────────────────────────────────────────────────────
 *
 * VERIFICATION GAP, STATED PLAINLY: no Mapbox token was available where
 * this was written, so the layer has never been drawn on a real map. The
 * mathematics underneath it is verified exactly, and the GL plumbing
 * follows Mapbox's documented custom-layer contract, but "the trees
 * appear in the right place on screen" is unconfirmed. First run with a
 * token is the real test — and the three things most likely to be wrong
 * are called out at their sites below (winding, terrain exaggeration,
 * and globe projection).
 */

import * as THREE from 'three';
import {
    createLocalFrame,
    lngLatAltToScene,
    sceneProjectionMatrix,
} from './mercatorTransform.js';

export default class TreeLayer {
    /**
     * @param {Object} opts
     * @param {string} opts.id            Mapbox layer id.
     * @param {number} opts.anchorLng     Frame anchor — use the COURSE CENTRE.
     * @param {number} opts.anchorLat     Accuracy degrades with distance from it
     *                                     (bounded to millimetres over a course;
     *                                     see mercatorTransform.js).
     */
    constructor({ id = 'truarc-trees', anchorLng, anchorLat } = {}) {
        this.id = id;
        this.type = 'custom';
        // '3d' shares Mapbox's depth buffer, so trees occlude and are
        // occluded by terrain and each other correctly. With '2d' they
        // would draw flat over everything.
        this.renderingMode = '3d';

        this.frame = createLocalFrame(anchorLng, anchorLat);
        this.map = null;
        this.renderer = null;
        this.scene = null;
        this.camera = null;
        this._trees = [];
        this._disposables = [];
    }

    // ─── MAPBOX LIFECYCLE ────────────────────────────────────────

    onAdd(map, gl) {
        this.map = map;
        this.camera = new THREE.Camera();
        this.scene = new THREE.Scene();

        // Trees are lit, unlike raw map geometry, so the crown profile
        // actually reads as a shape rather than a silhouette.
        this.scene.add(new THREE.AmbientLight(0xffffff, 0.65));
        const sun = new THREE.DirectionalLight(0xffffff, 0.9);
        sun.position.set(0.4, 1, 0.3); // scene frame: +X east, +Y up, +Z south
        this.scene.add(sun);

        // Share Mapbox's canvas AND context rather than creating our
        // own: two WebGL contexts on one canvas is not possible, and a
        // second canvas could not share the depth buffer.
        this.renderer = new THREE.WebGLRenderer({
            canvas: map.getCanvas(),
            context: gl,
            antialias: true,
        });
        // Mapbox owns the framebuffer and has already drawn into it.
        this.renderer.autoClear = false;

        if (this._trees.length) this._rebuildScene();
    }

    onRemove() {
        this._clearScene();
        // Do NOT dispose the renderer: it wraps Mapbox's own context and
        // canvas, and disposing would tear down the map's GL state.
        this.renderer = null;
        this.scene = null;
        this.camera = null;
        this.map = null;
    }

    render(gl, matrix) {
        if (!this.renderer || !this.scene) return;

        // Terrain exaggeration must match whatever the map is CURRENTLY
        // using, read per frame because it can change at runtime. Mapbox
        // displaces its terrain mesh by this factor but hands custom
        // layers an unadjusted matrix, so trees drawn at true altitude
        // would sit below exaggerated ground — buried. See the long note
        // in mercatorTransform.js; the app currently ships exaggeration
        // 2.0, which makes this load-bearing rather than theoretical.
        const exaggeration = this.map?.getTerrain?.()?.exaggeration ?? 1;

        this.camera.projectionMatrix = new THREE.Matrix4().fromArray(
            sceneProjectionMatrix(matrix, this.frame, exaggeration),
        );

        // Three and Mapbox both drive GL state; without this, whichever
        // drew last leaks its bindings into the other.
        this.renderer.resetState();
        this.renderer.render(this.scene, this.camera);
    }

    // ─── TREE DATA ───────────────────────────────────────────────

    /**
     * @param {Array} trees Records from the Section 2 inventory
     *   (`{course}_trees.json`): lng, lat, ground_elev_m, height_m,
     *   crown_radius_m, crown_base_m, profile[6], form, point_count.
     */
    setTrees(trees) {
        this._trees = trees ?? [];
        if (this.renderer) this._rebuildScene();
        this.map?.triggerRepaint();
    }

    _clearScene() {
        for (const d of this._disposables) d.dispose();
        this._disposables = [];
        if (!this.scene) return;
        for (const child of [...this.scene.children]) {
            if (child.isMesh) this.scene.remove(child);
        }
    }

    _rebuildScene() {
        this._clearScene();
        for (const tree of this._trees) {
            const mesh = this.buildTreeMesh(tree);
            if (mesh) this.scene.add(mesh);
        }
    }

    /**
     * PLACEHOLDER — step 2 replaces this entirely.
     *
     * Renders each tree as a single cylinder sized from its record. It
     * exists so the coordinate sync is visually checkable, NOT because a
     * cylinder is an acceptable tree: collapsing the measured 6-slice
     * crown profile into one radius throws away precisely what Section 2
     * was built to recover.
     *
     * Step 2 should lathe `tree.profile` into a crown mesh (scaled by
     * `crown_radius_m`, spanning `crown_base_m` to `height_m`), add a
     * trunk below the crown base, batch by `form`, and add distance LOD.
     * The positioning below is finished and can be kept as-is.
     */
    buildTreeMesh(tree) {
        const base = lngLatAltToScene(this.frame, tree.lng, tree.lat, tree.ground_elev_m);
        const height = tree.height_m;
        const radius = tree.crown_radius_m;

        const geometry = new THREE.CylinderGeometry(radius * 0.6, radius, height, 8);
        const material = new THREE.MeshLambertMaterial({
            color: tree.form === 'conifer' ? 0x2d5016 : 0x3f7d20,
            // DoubleSide is REQUIRED, not cosmetic. The scene→mercator
            // transform has negative determinant (right-handed scene,
            // left-handed mercator), which mirrors triangle winding, so
            // front faces would otherwise be culled and the trees would
            // be invisible with no error anywhere. See mercatorTransform.js.
            side: THREE.DoubleSide,
        });
        this._disposables.push(geometry, material);

        const mesh = new THREE.Mesh(geometry, material);
        // CylinderGeometry is centred on its own origin and built around
        // the Y axis, which is why the scene frame is Y-up: no corrective
        // rotation is needed here or in step 2's lathed crowns.
        mesh.position.set(base.x, base.y + height / 2, base.z);
        return mesh;
    }
}
