/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  TruArc — Terrain legibility layers                              ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Satellite imagery is a poor medium for reading TERRAIN. It already
 * carries baked-in illumination from whenever the tile was captured,
 * that light is usually near-vertical, and a fairway is a large area of
 * low-contrast green. The 3-D mesh under it is geometrically correct and
 * still reads as flat, because the eye infers shape from shading and the
 * shading in the photograph is not describing the shape.
 *
 * The fix is not more exaggeration — it is putting back the two cues a
 * topographic map has and a photograph does not:
 *
 *   HILLSHADE  A relief shade computed from the DEM itself, lit from a
 *              fixed north-west sun. Consistent lighting is what lets the
 *              eye read convex from concave. This is the single biggest
 *              win, and it is what makes SUBTLE relief visible — which is
 *              all a golf course has.
 *   CONTOURS   Elevation as a NUMBER. Shading says "this slopes away";
 *              only a labelled contour says "the basket is 30 ft below
 *              you", which is the thing that changes club selection.
 *
 * ── WHY THE SPECS ARE PURE FUNCTIONS ─────────────────────────────────
 * Everything below builds plain style objects and is exercised in
 * tests/map/terrainLayers.test.mjs against a recording fake map. A style
 * expression with a typo fails silently in Mapbox — the layer just draws
 * nothing — so "it rendered" is not a test a human reliably performs.
 *
 * ── EXAGGERATION IS COSMETIC, AND MUST STAY THAT WAY ─────────────────
 * `exaggeration` scales the rendered mesh only. It must never reach the
 * physics: `queryTerrainElevation` defaults to `exaggerated: true`, so
 * every call site in this app passes `{ exaggerated: false }`. See the
 * comment in physics/terrainProfile.js — that default had been silently
 * doubling every slope the flight engine integrated.
 */

const METERS_TO_FEET = 3.28084;

// Sources
export const DEM_SOURCE = 'mapbox-dem';
export const HILLSHADE_SOURCE = 'terrain-hillshade-dem';
export const CONTOUR_SOURCE = 'terrain-contour-v2';

// Layers
export const HILLSHADE_LAYER = 'truarc-hillshade';
export const CONTOUR_LINE_LAYER = 'truarc-contour-lines';
export const CONTOUR_LABEL_LAYER = 'truarc-contour-labels';

export const DEM_URL = 'mapbox://mapbox.mapbox-terrain-dem-v1';
export const CONTOUR_URL = 'mapbox://mapbox.mapbox-terrain-v2';

/**
 * Defaults. Hillshade is ON because it is the answer to "I can't see the
 * hills"; contours are OFF because Mapbox's are 10 m apart, which on a
 * course with 20 m of total relief draws two lines and reads as clutter
 * until someone actually wants the number.
 *
 * `exaggeration: 2` preserves what the app already rendered. It is safe
 * to expose as a slider only because of the `exaggerated: false` fix
 * above; before that, dragging it would have changed simulated carry.
 */
export const DEFAULT_TERRAIN = Object.freeze({
    hillshade: true,
    relief: 0.6,        // hillshade-exaggeration, 0…1
    contours: false,
    exaggeration: 2.0,  // 3-D mesh only
});

/**
 * An index contour — the ones Mapbox marks for labelling. In
 * mapbox-terrain-v2 the `contour` layer carries `index` = 5 or 10 on
 * every 5th/10th line and nothing on the rest, so a plain `>=` would
 * compare against null and drop everything.
 */
const IS_INDEX_CONTOUR = ['any', ['==', ['get', 'index'], 5], ['==', ['get', 'index'], 10]];

export function demSourceSpec() {
    return { type: 'raster-dem', url: DEM_URL, tileSize: 512, maxzoom: 14 };
}

/**
 * A SECOND DEM source, identical to the terrain one.
 *
 * Not redundancy: a raster-dem source that is driving `setTerrain` is
 * consumed by the terrain renderer, and sharing it with a hillshade layer
 * makes the hillshade's tile requests contend with the mesh's at
 * different zooms. Mapbox's own examples keep them separate. Tiles are
 * cached by URL, so the second source costs no extra network.
 */
export function hillshadeSourceSpec() {
    return { type: 'raster-dem', url: DEM_URL, tileSize: 512, maxzoom: 14 };
}

export function contourSourceSpec() {
    return { type: 'vector', url: CONTOUR_URL };
}

/**
 * Relief shading.
 *
 * `illumination-anchor: 'map'` pins the sun to the compass rather than to
 * the camera. With 'viewport' the light swings as the player rotates and
 * a ridge flips to reading as a gully mid-drag — the exact illusion this
 * layer exists to prevent. 335° is the cartographic convention (light
 * from the upper left); the visual system reads that as convex.
 */
export function hillshadeLayerSpec({ relief = DEFAULT_TERRAIN.relief } = {}) {
    return {
        id: HILLSHADE_LAYER,
        type: 'hillshade',
        source: HILLSHADE_SOURCE,
        slot: 'bottom',
        paint: {
            'hillshade-exaggeration': clamp01(relief),
            'hillshade-illumination-direction': 335,
            'hillshade-illumination-anchor': 'map',
            // Neutral, slightly cool shadows and a soft warm highlight:
            // the shade has to sit ON TOP of photographic colour without
            // reading as a grey wash over the fairway.
            'hillshade-shadow-color': '#12202e',
            'hillshade-highlight-color': '#fff6e0',
            'hillshade-accent-color': '#5b7a94',
        },
    };
}

/**
 * Contour lines, weighted so the index contours read as the structure and
 * the intermediate ones as texture. One layer, data-driven — two layers
 * with opposed filters would be twice the tile work for the same picture.
 */
export function contourLineLayerSpec() {
    return {
        id: CONTOUR_LINE_LAYER,
        type: 'line',
        source: CONTOUR_SOURCE,
        'source-layer': 'contour',
        slot: 'middle',
        layout: { 'line-join': 'round' },
        paint: {
            'line-color': '#ffd9a0',
            'line-width': ['case', IS_INDEX_CONTOUR, 1.4, 0.7],
            'line-opacity': ['case', IS_INDEX_CONTOUR, 0.55, 0.28],
        },
    };
}

/**
 * Elevation labels, in FEET — the unit every other distance in this app
 * is quoted in. Mapbox stores `ele` in metres, so the conversion happens
 * in the expression rather than anywhere a stale copy could drift.
 *
 * Index contours only. Labelling every line at 10 m spacing on a course
 * that spans 30 m produces a wall of numbers over the fairway.
 */
export function contourLabelLayerSpec() {
    return {
        id: CONTOUR_LABEL_LAYER,
        type: 'symbol',
        source: CONTOUR_SOURCE,
        'source-layer': 'contour',
        slot: 'top',
        filter: IS_INDEX_CONTOUR,
        layout: {
            'symbol-placement': 'line',
            'text-field': [
                'concat',
                ['to-string', ['round', ['*', ['get', 'ele'], METERS_TO_FEET]]],
                ' ft',
            ],
            'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
            'text-size': 10,
            'text-max-angle': 25,
            'text-padding': 8,
            'symbol-spacing': 260,
        },
        paint: {
            'text-color': '#ffe9c4',
            'text-halo-color': 'rgba(6,12,20,0.85)',
            'text-halo-width': 1.4,
        },
    };
}

function clamp01(v) {
    return Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
}

/** Clamp to the range the UI slider offers, so a bad value can't flatten the map. */
export function clampExaggeration(v) {
    return Math.max(0, Math.min(4, Number.isFinite(v) ? v : DEFAULT_TERRAIN.exaggeration));
}

/**
 * Bring the map in line with `settings`, adding whatever is missing.
 *
 * Idempotent and lazy: layers are created on first enable and then
 * toggled by VISIBILITY rather than removed. Removing and re-adding a
 * vector layer re-triggers tile fetches and makes a checkbox feel like it
 * costs something, which pushes players away from the control that
 * answers their question.
 *
 * Every step is individually guarded. A style that is mid-reload throws
 * on `getLayer`, and one failed overlay must never take down the map the
 * course is drawn on.
 */
export function applyTerrainLayers(map, settings = DEFAULT_TERRAIN) {
    if (!map) return;
    const s = { ...DEFAULT_TERRAIN, ...settings };

    // ── 3-D mesh ──
    try {
        if (!map.getSource(DEM_SOURCE)) map.addSource(DEM_SOURCE, demSourceSpec());
        map.setTerrain({ source: DEM_SOURCE, exaggeration: clampExaggeration(s.exaggeration) });
    } catch (e) {
        console.warn('[terrain] mesh:', e?.message ?? e);
    }

    // ── Hillshade ──
    try {
        if (s.hillshade) {
            if (!map.getSource(HILLSHADE_SOURCE)) {
                map.addSource(HILLSHADE_SOURCE, hillshadeSourceSpec());
            }
            if (!map.getLayer(HILLSHADE_LAYER)) {
                map.addLayer(hillshadeLayerSpec(s));
            } else {
                map.setPaintProperty(HILLSHADE_LAYER, 'hillshade-exaggeration', clamp01(s.relief));
            }
        }
        if (map.getLayer(HILLSHADE_LAYER)) {
            map.setLayoutProperty(HILLSHADE_LAYER, 'visibility', s.hillshade ? 'visible' : 'none');
        }
    } catch (e) {
        console.warn('[terrain] hillshade:', e?.message ?? e);
    }

    // ── Contours ──
    try {
        if (s.contours) {
            if (!map.getSource(CONTOUR_SOURCE)) {
                map.addSource(CONTOUR_SOURCE, contourSourceSpec());
            }
            if (!map.getLayer(CONTOUR_LINE_LAYER)) map.addLayer(contourLineLayerSpec());
            if (!map.getLayer(CONTOUR_LABEL_LAYER)) map.addLayer(contourLabelLayerSpec());
        }
        for (const id of [CONTOUR_LINE_LAYER, CONTOUR_LABEL_LAYER]) {
            if (map.getLayer(id)) {
                map.setLayoutProperty(id, 'visibility', s.contours ? 'visible' : 'none');
            }
        }
    } catch (e) {
        console.warn('[terrain] contours:', e?.message ?? e);
    }
}
