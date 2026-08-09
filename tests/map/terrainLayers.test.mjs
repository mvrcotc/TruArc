/**
 * Tests for src/map/terrainLayers.js — the hillshade/contour overlays
 * that make relief readable over satellite imagery.
 *
 * WHY THIS FILE EXISTS: a malformed Mapbox style expression does not
 * throw. The layer is accepted and simply draws nothing, or draws with a
 * silently-defaulted paint value. "I looked at the map and it seemed
 * fine" cannot distinguish a working contour label from one whose
 * expression referenced a field that doesn't exist. So the specs are
 * built by pure functions and asserted structurally here.
 *
 * The second thing guarded here is the one that matters for accuracy
 * rather than looks: exaggeration must stay COSMETIC. It is exposed as a
 * slider, and `queryTerrainElevation` defaults to returning exaggerated
 * values, so nothing may route it into a measurement or a simulation.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
    DEFAULT_TERRAIN,
    DEM_SOURCE, HILLSHADE_SOURCE, CONTOUR_SOURCE,
    HILLSHADE_LAYER, CONTOUR_LINE_LAYER, CONTOUR_LABEL_LAYER,
    demSourceSpec, hillshadeSourceSpec, contourSourceSpec,
    hillshadeLayerSpec, contourLineLayerSpec, contourLabelLayerSpec,
    clampExaggeration, applyTerrainLayers,
} from '../../src/map/terrainLayers.js';

/**
 * A recording stand-in for mapboxgl.Map. Only the handful of methods
 * applyTerrainLayers touches, plus a log so a test can assert on the
 * ORDER and IDEMPOTENCE of the calls, not just the end state.
 */
function fakeMap() {
    const sources = new Map();
    const layers = new Map();
    const calls = [];
    return {
        calls,
        _sources: sources,
        _layers: layers,
        terrain: null,
        getSource: (id) => sources.get(id),
        addSource(id, spec) { calls.push(['addSource', id]); sources.set(id, spec); },
        getLayer: (id) => layers.get(id),
        addLayer(spec) { calls.push(['addLayer', spec.id]); layers.set(spec.id, spec); },
        setTerrain(t) { calls.push(['setTerrain', t?.exaggeration]); this.terrain = t; },
        setPaintProperty(id, prop, val) {
            calls.push(['setPaintProperty', id, prop]);
            const l = layers.get(id);
            if (l) l.paint = { ...l.paint, [prop]: val };
        },
        setLayoutProperty(id, prop, val) {
            calls.push(['setLayoutProperty', id, prop, val]);
            const l = layers.get(id);
            if (l) l.layout = { ...l.layout, [prop]: val };
        },
    };
}

/** Walk an expression tree collecting every ['get', <field>] reference. */
function fieldsReferenced(expr, out = new Set()) {
    if (!Array.isArray(expr)) return out;
    if (expr[0] === 'get' && typeof expr[1] === 'string') out.add(expr[1]);
    for (const child of expr) fieldsReferenced(child, out);
    return out;
}

describe('terrain source specs', () => {
    test('the DEM is raster-dem and the contours are vector — not swapped', () => {
        // Swapping these is an easy copy-paste error and produces a map
        // that loads cleanly with no hillshade and no contours.
        assert.equal(demSourceSpec().type, 'raster-dem');
        assert.equal(hillshadeSourceSpec().type, 'raster-dem');
        assert.equal(contourSourceSpec().type, 'vector');
    });

    test('hillshade uses its own source, not the one driving the mesh', () => {
        assert.notEqual(HILLSHADE_SOURCE, DEM_SOURCE);
        // ...but the same underlying tiles, so it costs no extra network.
        assert.equal(hillshadeSourceSpec().url, demSourceSpec().url);
    });
});

describe('hillshade layer', () => {
    test('is anchored to the map, not the viewport', () => {
        // With 'viewport' the sun swings as the player rotates the camera
        // and a ridge flips to reading as a gully mid-drag — the exact
        // illusion this layer exists to remove.
        const paint = hillshadeLayerSpec().paint;
        assert.equal(paint['hillshade-illumination-anchor'], 'map');
    });

    test('is lit from the north-west, the convention the eye reads as convex', () => {
        const dir = hillshadeLayerSpec().paint['hillshade-illumination-direction'];
        assert.ok(dir > 270 && dir < 360, `illumination ${dir}° is not north-west`);
    });

    test('relief strength is carried through and clamped to 0…1', () => {
        assert.equal(hillshadeLayerSpec({ relief: 0.8 }).paint['hillshade-exaggeration'], 0.8);
        assert.equal(hillshadeLayerSpec({ relief: 5 }).paint['hillshade-exaggeration'], 1);
        assert.equal(hillshadeLayerSpec({ relief: -2 }).paint['hillshade-exaggeration'], 0);
        assert.equal(hillshadeLayerSpec({ relief: NaN }).paint['hillshade-exaggeration'], 0);
    });
});

describe('contour layers', () => {
    test('read only fields mapbox-terrain-v2 actually publishes', () => {
        // A typo here (`elev`, `elevation`) yields labels that render as
        // empty strings — invisible in review, obvious to a user.
        const allowed = new Set(['ele', 'index']);
        for (const spec of [contourLineLayerSpec(), contourLabelLayerSpec()]) {
            const fields = new Set();
            fieldsReferenced(spec.filter, fields);
            fieldsReferenced(spec.layout?.['text-field'], fields);
            fieldsReferenced(spec.paint?.['line-width'], fields);
            fieldsReferenced(spec.paint?.['line-opacity'], fields);
            for (const f of fields) {
                assert.ok(allowed.has(f), `layer ${spec.id} reads unknown field "${f}"`);
            }
        }
    });

    test('both contour layers point at the "contour" source-layer', () => {
        assert.equal(contourLineLayerSpec()['source-layer'], 'contour');
        assert.equal(contourLabelLayerSpec()['source-layer'], 'contour');
    });

    test('index contours are matched by equality, never by >= on a null field', () => {
        // Regular contours carry no `index` at all. `['>=', ['get','index'], 5]`
        // compares against null and silently matches nothing, which would
        // leave every contour thin and unlabelled.
        const json = JSON.stringify(contourLabelLayerSpec().filter);
        assert.ok(!json.includes('">="'), 'filter uses >= against a nullable field');
        assert.ok(json.includes('"=="'), 'filter should test index by equality');
    });

    test('labels are in feet, matching every other distance in the app', () => {
        const field = JSON.stringify(contourLabelLayerSpec().layout['text-field']);
        assert.ok(field.includes('3.28084'), 'no metres→feet conversion in the label expression');
        assert.ok(field.includes(' ft'), 'label does not carry a unit');
    });

    test('only index contours are labelled', () => {
        // 10 m spacing on a course spanning 30 m would otherwise paper the
        // fairway with numbers.
        assert.ok(contourLabelLayerSpec().filter, 'label layer must be filtered');
    });
});

describe('applyTerrainLayers', () => {
    test('sets up the mesh and hillshade on a bare map', () => {
        const map = fakeMap();
        applyTerrainLayers(map, DEFAULT_TERRAIN);

        assert.ok(map.getSource(DEM_SOURCE), 'DEM source missing');
        assert.equal(map.terrain.source, DEM_SOURCE);
        assert.ok(map.getLayer(HILLSHADE_LAYER), 'hillshade layer missing');
    });

    test('does not create contour layers until they are asked for', () => {
        // They default off, and a vector source costs tile requests.
        const map = fakeMap();
        applyTerrainLayers(map, DEFAULT_TERRAIN);
        assert.equal(map.getSource(CONTOUR_SOURCE), undefined);
        assert.equal(map.getLayer(CONTOUR_LINE_LAYER), undefined);

        applyTerrainLayers(map, { ...DEFAULT_TERRAIN, contours: true });
        assert.ok(map.getSource(CONTOUR_SOURCE));
        assert.ok(map.getLayer(CONTOUR_LINE_LAYER));
        assert.ok(map.getLayer(CONTOUR_LABEL_LAYER));
    });

    test('toggling off hides rather than removes, and toggling back on re-shows', () => {
        // Remove-and-re-add would re-fetch tiles and make a checkbox feel
        // expensive, which pushes players off the control that answers
        // their question.
        const map = fakeMap();
        applyTerrainLayers(map, { ...DEFAULT_TERRAIN, contours: true });
        const addsAfterFirst = map.calls.filter((c) => c[0] === 'addLayer').length;

        applyTerrainLayers(map, { ...DEFAULT_TERRAIN, contours: false });
        assert.equal(map.getLayer(CONTOUR_LINE_LAYER).layout.visibility, 'none');

        applyTerrainLayers(map, { ...DEFAULT_TERRAIN, contours: true });
        assert.equal(map.getLayer(CONTOUR_LINE_LAYER).layout.visibility, 'visible');
        assert.equal(
            map.calls.filter((c) => c[0] === 'addLayer').length,
            addsAfterFirst,
            'layers were re-added instead of re-shown',
        );
    });

    test('is idempotent — re-applying identical settings adds nothing', () => {
        const map = fakeMap();
        applyTerrainLayers(map, DEFAULT_TERRAIN);
        const before = map.calls.filter((c) => c[0] === 'addSource' || c[0] === 'addLayer').length;
        applyTerrainLayers(map, DEFAULT_TERRAIN);
        applyTerrainLayers(map, DEFAULT_TERRAIN);
        const after = map.calls.filter((c) => c[0] === 'addSource' || c[0] === 'addLayer').length;
        assert.equal(before, after);
    });

    test('changing shading strength updates the live layer in place', () => {
        const map = fakeMap();
        applyTerrainLayers(map, { ...DEFAULT_TERRAIN, relief: 0.3 });
        applyTerrainLayers(map, { ...DEFAULT_TERRAIN, relief: 0.9 });
        assert.equal(map.getLayer(HILLSHADE_LAYER).paint['hillshade-exaggeration'], 0.9);
    });

    test('one broken overlay never takes down the map the course is drawn on', () => {
        const map = fakeMap();
        map.addLayer = () => { throw new Error('style reloading'); };
        assert.doesNotThrow(() => applyTerrainLayers(map, { ...DEFAULT_TERRAIN, contours: true }));
        // The mesh still got configured despite the layer failures.
        assert.equal(map.terrain.source, DEM_SOURCE);
    });

    test('survives a null map without throwing', () => {
        assert.doesNotThrow(() => applyTerrainLayers(null, DEFAULT_TERRAIN));
    });
});

describe('exaggeration stays cosmetic', () => {
    test('is clamped to a sane range', () => {
        assert.equal(clampExaggeration(2), 2);
        assert.equal(clampExaggeration(-5), 0);
        assert.equal(clampExaggeration(99), 4);
        assert.equal(clampExaggeration(undefined), DEFAULT_TERRAIN.exaggeration);
        assert.equal(clampExaggeration(NaN), DEFAULT_TERRAIN.exaggeration);
    });

    test('reaches setTerrain and nothing else', () => {
        const map = fakeMap();
        applyTerrainLayers(map, { ...DEFAULT_TERRAIN, exaggeration: 2.7, contours: true });
        assert.equal(map.terrain.exaggeration, 2.7);

        // It must not have leaked into any layer's paint or layout — those
        // feed rendering only, but a stray copy is how a "display-only"
        // setting starts meaning something else.
        const serialized = JSON.stringify([...map._layers.values()]);
        assert.ok(!serialized.includes('2.7'), 'exaggeration leaked into a layer spec');
    });

    test('every queryTerrainElevation call site opts out of exaggeration', async () => {
        // THE load-bearing test of this file. queryTerrainElevation
        // defaults to exaggerated:true, so a call site that forgets the
        // option silently scales real-world elevation by the display
        // setting — and with terrain at 2× that doubled every slope the
        // flight engine integrated. Asserted over the source rather than
        // at runtime because these sites need a live GL context.
        const { readFileSync } = await import('node:fs');
        const files = [
            'src/physics/terrainProfile.js',
            'src/components/MapCanvas.jsx',
        ];
        for (const f of files) {
            const src = readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');
            const calls = src.match(/queryTerrainElevation\??\.?\([^)]*\)/g) ?? [];
            assert.ok(calls.length > 0, `${f} no longer queries terrain — update this test`);
            for (const call of calls) {
                assert.ok(
                    call.includes('exaggerated: false'),
                    `${f}: "${call}" inherits exaggerated:true and will return scaled elevation`,
                );
            }
        }
    });
});
