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
 * ── THE GROUND IS NEVER EXAGGERATED ──────────────────────────────────
 * The mesh renders at 1.0 — true scale — and there is no control to
 * change it. This app is used to decide real throws, so a hill that
 * looks steeper than it is makes the picture worse than no picture:
 * a player reads the shape, picks a line, and the ground disagrees.
 *
 * That is a deliberate reversal. This map previously shipped
 * `exaggeration: 2.0` "for visual drama", and the reason it needed drama
 * is that satellite imagery alone cannot show relief at all — inflating
 * the geometry was compensating for a MISSING CUE. Hillshade supplies
 * that cue honestly: it reads slope off the true DEM and expresses it as
 * light. So relief shading is what let the exaggeration go, and the two
 * changes are really one change.
 *
 * Consequence: hills look objectively flatter than they used to. That is
 * the correction, not a regression — the old picture was overstating
 * every slope by 2×.
 *
 * Related: `queryTerrainElevation` defaults to `exaggerated: true`, so
 * every call site still passes `{ exaggerated: false }` explicitly. With
 * the mesh at 1.0 that is currently a no-op, but it is the difference
 * between "correct" and "correct as long as nobody touches a constant."
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
 * TRUE SCALE. Not a default, not a setting — a constant, with no code
 * path that reads it from user state. See the header: a distorted ground
 * is worse than a plain one for anyone throwing at the real hole.
 *
 * It stays a named constant rather than a literal `1` because
 * TreeLayer and PointCloudLayer read `map.getTerrain().exaggeration` per
 * frame to keep custom 3-D geometry level with the mesh. That machinery
 * is still correct and still load-bearing; it is simply being handed the
 * identity now.
 */
export const TERRAIN_EXAGGERATION = 1.0;

/**
 * How hard the relief shade is driven, 0…1. Fixed, for the same reason
 * the geometry is fixed — but note this one is not a geometric claim at
 * all. Hillshade brightness is computed FROM the true slope, so it can
 * only make real relief easier or harder to see; it cannot invent a hill
 * on flat ground. Turning it up on a flat course still shows flat.
 *
 * 0.6 rather than Mapbox's 0.5 default: courses are chosen for gentle,
 * playable terrain, which is exactly the range where a stock hillshade
 * reads as haze.
 */
const RELIEF_STRENGTH = 0.6;

/**
 * Hillshade and contours are both ON by default. Relief shading puts back
 * the light-and-shadow cue that satellite imagery loses, and contours show
 * the exact elevation in feet — the number that changes club selection.
 */
export const DEFAULT_TERRAIN = Object.freeze({
    hillshade: true,
    contours: true,
});

/**
 * An index contour — the ones Mapbox marks for labelling. In
 * mapbox-terrain-v2 the `contour` layer carries `index` = 5 or 10 on
 * every 5th/10th line and nothing on the rest, so a plain `>=` would
 * compare against null and drop everything.
 */
const IS_INDEX_CONTOUR = ['any', ['==', ['get', 'index'], 5], ['==', ['get', 'index'], 10]];

/**
 * The lowest label layer in the current style — the insertion point that
 * means "above the ground, below the writing". Undefined is a valid
 * answer (a style with no symbols at all) and makes addLayer append,
 * which is the right fallback.
 */
function firstSymbolLayerId(map) {
    try {
        return map.getStyle()?.layers?.find((l) => l.type === 'symbol')?.id;
    } catch {
        return undefined;
    }
}

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
export function hillshadeLayerSpec({ slots = true } = {}) {
    return {
        id: HILLSHADE_LAYER,
        type: 'hillshade',
        source: HILLSHADE_SOURCE,
        // Classic styles have no slots; applyTerrainLayers positions the
        // layer with an explicit beforeId there instead. Leaving a stray
        // `slot` on a classic style is a spec violation, not a no-op.
        ...(slots ? { slot: 'bottom' } : {}),
        paint: {
            'hillshade-exaggeration': RELIEF_STRENGTH,
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
export function contourLineLayerSpec({ slots = true } = {}) {
    return {
        id: CONTOUR_LINE_LAYER,
        type: 'line',
        source: CONTOUR_SOURCE,
        'source-layer': 'contour',
        ...(slots ? { slot: 'middle' } : {}),
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
export function contourLabelLayerSpec({ slots = true } = {}) {
    return {
        id: CONTOUR_LABEL_LAYER,
        type: 'symbol',
        source: CONTOUR_SOURCE,
        'source-layer': 'contour',
        ...(slots ? { slot: 'top' } : {}),
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
export function applyTerrainLayers(map, settings = DEFAULT_TERRAIN, { slots = true } = {}) {
    if (!map) return;
    const s = { ...DEFAULT_TERRAIN, ...settings };

    // On a classic style, "under the labels" has to be said by naming a
    // layer. Shading drawn OVER the labels turns road and place names to
    // mud, which is the failure mode slots exist to prevent.
    const underLabels = slots ? undefined : firstSymbolLayerId(map);

    // ── 3-D mesh, always at true scale ──
    // The exaggeration argument is the module constant, never anything
    // derived from `settings` — there is deliberately no way for a caller
    // to distort the ground.
    try {
        if (!map.getSource(DEM_SOURCE)) map.addSource(DEM_SOURCE, demSourceSpec());
        map.setTerrain({ source: DEM_SOURCE, exaggeration: TERRAIN_EXAGGERATION });
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
                map.addLayer(hillshadeLayerSpec({ slots }), underLabels);
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
            if (!map.getLayer(CONTOUR_LINE_LAYER)) {
                map.addLayer(contourLineLayerSpec({ slots }), underLabels);
            }
            // Labels are the one thing that SHOULD sit above the base
            // style's own symbols — a contour number hidden behind a road
            // shield is a number you can't read.
            if (!map.getLayer(CONTOUR_LABEL_LAYER)) {
                map.addLayer(contourLabelLayerSpec({ slots }));
            }
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
