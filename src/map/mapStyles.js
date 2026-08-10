/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  Base map types — the "Map type" picker                          ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Three base maps, the same three Google offers, because they answer
 * three different questions a player actually has:
 *
 *   SATELLITE  What is actually there? Tree lines, the mown fairway,
 *              the gap you're trying to hit. The default, and the only
 *              one that shows the real obstacles.
 *   TERRAIN    What shape is the ground? Hypsometric tint, contours and
 *              trails, no canopy hiding the landform.
 *   DEFAULT    How do I get there / where do I park? Roads and labels.
 *
 * These are BASE MAPS, not overlays — picking one replaces the whole
 * style. The hillshade and contour layers in terrainLayers.js sit on top
 * of whichever is chosen.
 *
 * ── SWITCHING A STYLE IS DESTRUCTIVE ─────────────────────────────────
 * `map.setStyle()` discards every source and layer the app added: the
 * course lines, the tee/basket markers, the Three.js tree and point-cloud
 * layers, the terrain mesh, all of it. Mapbox re-fires `style.load`
 * afterwards and it is the app's job to rebuild. MapCanvas does that by
 * bumping a `styleEpoch` that every layer-owning effect depends on — see
 * the STYLE SWAP block there. Adding a new layer to the map means adding
 * `styleEpoch` to its effect's deps, or it will vanish the first time
 * someone touches this picker.
 *
 * ── WHY `slots` VARIES ───────────────────────────────────────────────
 * Standard (v3) styles support `slot: 'bottom' | 'middle' | 'top'`, which
 * is how a custom layer says "under the labels" without naming another
 * layer. Classic (v2) styles like Outdoors have no slots, so layer order
 * there has to be expressed as an explicit `beforeId`. terrainLayers.js
 * handles both; this flag is how it knows which.
 */

export const MAP_TYPES = Object.freeze({
    default: {
        id: 'default',
        label: 'Default',
        hint: 'Roads and labels — getting to the course',
        url: 'mapbox://styles/mapbox/standard',
        slots: true,
    },
    satellite: {
        id: 'satellite',
        label: 'Satellite',
        hint: 'Real imagery — the trees and gaps you actually play',
        url: 'mapbox://styles/mapbox/standard-satellite',
        slots: true,
    },
    terrain: {
        id: 'terrain',
        label: 'Terrain',
        hint: 'Landform, contours and trails, with nothing hiding the shape',
        // Outdoors is classic-style rather than Standard: it is the one
        // Mapbox actually builds for reading landform, and it ships the
        // hypsometric tint and trail network that make a terrain map
        // legible. Standard has no terrain variant to swap to.
        url: 'mapbox://styles/mapbox/outdoors-v12',
        slots: false,
    },
});

/** Display order, matching the picker left→right. */
export const MAP_TYPE_ORDER = ['default', 'satellite', 'terrain'];

/**
 * Satellite, because the first question on a course is "what is between
 * me and the basket", and only imagery answers it.
 */
export const DEFAULT_MAP_TYPE = 'satellite';

/** Resolve an id to its definition, falling back rather than throwing. */
export function mapTypeDef(id) {
    return MAP_TYPES[id] ?? MAP_TYPES[DEFAULT_MAP_TYPE];
}
