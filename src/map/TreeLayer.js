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
 * tests/map/mercatorTransform.test.mjs. Step 2 (this file, plus
 * treeGeometry.js) replaces the placeholder cylinder with real
 * profile-lathed crowns, batched into a small number of draw calls
 * regardless of tree count, with camera-distance LOD.
 *
 * RENDERING STRATEGY: each tree gets its own small LatheGeometry (crown,
 * from its measured profile) and CylinderGeometry (trunk), which are
 * then MERGED into one static BufferGeometry per tier — this keeps every
 * tree's real, distinct shape (unlike GPU instancing, which would need
 * one shared template geometry) while still costing a handful of draw
 * calls for a whole course rather than thousands. Trees beyond
 * `lodThresholdM` of the camera are drawn as merged cross-billboards
 * instead of full geometry. The near/far split is recomputed on map
 * `moveend`/`zoomend` (via `_scheduleLodRecompute`), not every frame —
 * rebuilding a merged BufferGeometry for a few thousand trees is too
 * costly to do 60 times a second, and LOD only needs to react to where
 * the camera settles, not to every intermediate frame of getting there.
 * ────────────────────────────────────────────────────────────────────
 *
 * VERIFICATION GAP, STATED PLAINLY: no Mapbox token was available where
 * this was written, so the layer has never been drawn on a real map. The
 * coordinate mathematics is verified exactly (step 1), and the crown
 * math is unit-tested (treeGeometry.test.mjs), but "the trees appear in
 * the right place, at a plausible size, and hold 60fps" is unconfirmed.
 * First run with a token is the real test — the things most likely to
 * be wrong are called out at their sites below (winding/culling, terrain
 * exaggeration, and LOD threshold tuning, which was chosen from the
 * roadmap's ~300m suggestion, not measured against a real frame budget).
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
    createLocalFrame,
    lngLatAltToScene,
    sceneProjectionMatrix,
} from './mercatorTransform.js';
import {
    crownLatheProfile,
    trunkRadiusM,
    jitteredTreeColorHSL,
    billboardQuadGeometry,
    lodTierForDistance,
} from './treeGeometry.js';

const CROWN_RADIAL_SEGMENTS = 7;   // modest poly count: thousands of these get merged
const TRUNK_RADIAL_SEGMENTS = 6;
const LOD_THRESHOLD_M = 300;       // roadmap's suggested near/far split; unmeasured against a real frame budget
const LOD_RECOMPUTE_DEBOUNCE_MS = 250;

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
        this._foliageTexture = null;
        this._lodRecomputeTimer = null;
        this._onCameraIdle = () => this._scheduleLodRecompute();
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

        // LOD recompute on camera idle, not per frame — see the class
        // docstring's RENDERING STRATEGY note.
        map.on('moveend', this._onCameraIdle);
        map.on('zoomend', this._onCameraIdle);

        if (this._trees.length) this._rebuildScene();
    }

    onRemove() {
        if (this._lodRecomputeTimer) clearTimeout(this._lodRecomputeTimer);
        this.map?.off('moveend', this._onCameraIdle);
        this.map?.off('zoomend', this._onCameraIdle);
        this._clearScene();
        if (this._foliageTexture) {
            this._foliageTexture.dispose();
            this._foliageTexture = null;
        }
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
        // in mercatorTransform.js.
        //
        // The app now ships true scale (terrainLayers.TERRAIN_EXAGGERATION
        // = 1.0), so today this reads 1 and the compensation is identity.
        // It stays because the coupling is real: it is the only thing
        // keeping trees level with the ground if that constant ever moves,
        // and a buried forest is a confusing way to rediscover it.
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
        this._treeScenePositions = this._trees.map((t) =>
            lngLatAltToScene(this.frame, t.lng, t.lat, t.ground_elev_m));
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

    /**
     * Camera position in SCENE space, from Mapbox's actual current
     * camera (`getFreeCameraOptions`, a public/documented API) rather
     * than a proxy like map-centre — LOD should measure distance from
     * where the viewer really is. Converted via `lngLatAltToScene`, the
     * same verified transform everything else uses, not new math.
     */
    _cameraScenePosition() {
        const camera = this.map.getFreeCameraOptions();
        const pos = camera.position; // MercatorCoordinate
        if (!pos) return { x: 0, y: 200, z: 0 }; // defensive fallback, should not occur
        const ll = pos.toLngLat();
        return lngLatAltToScene(this.frame, ll.lng, ll.lat, pos.toAltitude());
    }

    _scheduleLodRecompute() {
        if (this._lodRecomputeTimer) clearTimeout(this._lodRecomputeTimer);
        this._lodRecomputeTimer = setTimeout(() => {
            this._lodRecomputeTimer = null;
            if (this._trees.length) this._rebuildScene();
        }, LOD_RECOMPUTE_DEBOUNCE_MS);
    }

    _rebuildScene() {
        this._clearScene();
        if (!this._trees.length) return;

        const eye = this._cameraScenePosition();
        const nearCrownGeoms = [];
        const nearTrunkGeoms = [];
        const farBillboardGeoms = [];

        for (let i = 0; i < this._trees.length; i++) {
            const tree = this._trees[i];
            const base = this._treeScenePositions[i];
            const dx = base.x - eye.x;
            const dz = base.z - eye.z;
            const dist = Math.hypot(dx, dz); // ground distance; camera altitude
            // dominates less for a course-scale oblique view than
            // horizontal distance does, and avoids near trees flipping
            // to "far" just because the camera pitches up.

            if (lodTierForDistance(dist, LOD_THRESHOLD_M) === 'near') {
                nearCrownGeoms.push(this._buildCrownGeometry(tree, base));
                nearTrunkGeoms.push(this._buildTrunkGeometry(tree, base));
            } else {
                farBillboardGeoms.push(this._buildBillboardGeometry(tree, base));
            }
        }

        if (nearCrownGeoms.length) {
            const merged = mergeGeometries(nearCrownGeoms, false);
            for (const g of nearCrownGeoms) g.dispose();
            const material = new THREE.MeshLambertMaterial({
                vertexColors: true,
                // DoubleSide is REQUIRED, not cosmetic. The scene→mercator
                // transform has negative determinant (right-handed scene,
                // left-handed mercator), which mirrors triangle winding, so
                // front faces would otherwise be culled and every crown
                // would be invisible with no error anywhere. See
                // mercatorTransform.js.
                side: THREE.DoubleSide,
            });
            this._disposables.push(merged, material);
            this.scene.add(new THREE.Mesh(merged, material));
        }

        if (nearTrunkGeoms.length) {
            const merged = mergeGeometries(nearTrunkGeoms, false);
            for (const g of nearTrunkGeoms) g.dispose();
            const material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
            this._disposables.push(merged, material);
            this.scene.add(new THREE.Mesh(merged, material));
        }

        if (farBillboardGeoms.length) {
            const merged = mergeGeometries(farBillboardGeoms, false);
            for (const g of farBillboardGeoms) g.dispose();
            const material = new THREE.MeshLambertMaterial({
                map: this._getFoliageTexture(),
                transparent: true,
                alphaTest: 0.4, // discard the texture's transparent margin rather than blending it (avoids sorting artifacts between overlapping billboards)
                side: THREE.DoubleSide,
                vertexColors: true,
            });
            this._disposables.push(merged, material);
            this.scene.add(new THREE.Mesh(merged, material));
        }
    }

    _buildCrownGeometry(tree, base) {
        const points = crownLatheProfile(tree.profile, tree.crown_radius_m, tree.crown_base_m, tree.height_m)
            .map((p) => new THREE.Vector2(Math.max(p.radius, 1e-4), p.y)); // LatheGeometry wants x>0; a true 0 apex still closes correctly in practice, but avoid relying on exact-zero edge behavior
        const geometry = new THREE.LatheGeometry(points, CROWN_RADIAL_SEGMENTS);
        this._paintVertexColor(geometry, tree, base);
        // crown_base_m/height_m are heights ABOVE GROUND (the LiDAR
        // height-above-ground convention Section 2 measures in), so the
        // lathe's own Y=0 is the tree's ground, not sea level — base.y
        // (the tree's absolute scene altitude) must be added here.
        geometry.translate(base.x, base.y, base.z);
        return geometry;
    }

    _buildTrunkGeometry(tree, base) {
        const radius = trunkRadiusM(tree.height_m);
        const trunkHeight = Math.max(tree.crown_base_m, 0.2);
        const geometry = new THREE.CylinderGeometry(radius * 0.7, radius, trunkHeight, TRUNK_RADIAL_SEGMENTS);
        geometry.translate(0, trunkHeight / 2, 0); // CylinderGeometry is centred on its own origin; shift so its base sits at y=0 (ground)
        this._paintVertexColor(geometry, { form: 'trunk' }, base, TRUNK_COLOR);
        geometry.translate(base.x, base.y, base.z);
        return geometry;
    }

    _buildBillboardGeometry(tree, base) {
        const { positions, uvs, indices } = billboardQuadGeometry(tree.crown_radius_m * 2, tree.height_m - tree.crown_base_m, tree.crown_base_m);
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
        this._paintVertexColor(geometry, tree, base);
        // Same ground-relative-height convention as the crown lathe above.
        geometry.translate(base.x, base.y, base.z);
        return geometry;
    }

    /** Bakes a per-vertex color (jittered per tree) so many trees can share one merged mesh/material without losing form/individual variation. */
    _paintVertexColor(geometry, tree, base, fixedColor = null) {
        const count = geometry.attributes.position.count;
        const colors = new Float32Array(count * 3);
        const c = new THREE.Color();
        if (fixedColor) {
            c.set(fixedColor);
        } else {
            const hsl = jitteredTreeColorHSL(tree.form, base.x, base.z);
            c.setHSL(hsl.h, hsl.s, hsl.l);
        }
        for (let i = 0; i < count; i++) {
            colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
        }
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    }

    /**
     * A soft radial foliage sprite, generated once at runtime (no asset
     * file: nothing like this exists in the repo, and a procedural blob
     * is a defensible placeholder for a distant tree's silhouette —
     * revisit if the billboards read as too uniform once actually seen
     * on a map).
     */
    _getFoliageTexture() {
        if (this._foliageTexture) return this._foliageTexture;
        const size = 128;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
        gradient.addColorStop(0, 'rgba(255,255,255,1)');
        gradient.addColorStop(0.7, 'rgba(255,255,255,0.85)');
        gradient.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, size, size);

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        this._foliageTexture = texture;
        return texture;
    }
}

const TRUNK_COLOR = 0x5a4632;
