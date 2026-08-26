/**
 * Tests for the base map picker — src/map/mapStyles.js, plus the
 * contract it imposes on MapCanvas.
 *
 * WHY THIS FILE EXISTS: `map.setStyle()` silently discards every source
 * and layer the app added. Nothing throws; the course lines, trees and
 * terrain overlays simply are not there any more. The failure shows up
 * as "I switched to Terrain and my course vanished", which is a bug
 * report a long way from its cause.
 *
 * The rebuild is coordinated by a `styleEpoch` counter that every
 * layer-owning effect takes as a dependency. That is a convention, and
 * conventions rot — so the last test in this file reads MapCanvas and
 * asserts it, rather than trusting a comment to be obeyed.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
    MAP_TYPES, MAP_TYPE_ORDER, DEFAULT_MAP_TYPE, mapTypeDef,
} from '../../src/map/mapStyles.js';
import {
    DEFAULT_TERRAIN, HILLSHADE_LAYER, CONTOUR_LINE_LAYER, CONTOUR_LABEL_LAYER,
    hillshadeLayerSpec, contourLineLayerSpec, contourLabelLayerSpec,
    applyTerrainLayers,
} from '../../src/map/terrainLayers.js';

const mapCanvasSrc = () =>
    readFileSync(new URL('../../src/components/MapCanvas.jsx', import.meta.url), 'utf8');

/** Fake map carrying a style whose layer list we control. */
function fakeMap(styleLayers = []) {
    const sources = new Map();
    const layers = new Map();
    const added = [];
    return {
        added,
        _layers: layers,
        terrain: null,
        getStyle: () => ({ layers: styleLayers }),
        getSource: (id) => sources.get(id),
        addSource(id, spec) { sources.set(id, spec); },
        getLayer: (id) => layers.get(id) ?? styleLayers.find((l) => l.id === id),
        addLayer(spec, beforeId) { added.push({ id: spec.id, beforeId }); layers.set(spec.id, spec); },
        setTerrain(t) { this.terrain = t; },
        setPaintProperty() { },
        setLayoutProperty(id, prop, val) {
            const l = layers.get(id);
            if (l) l.layout = { ...l.layout, [prop]: val };
        },
    };
}

describe('map type definitions', () => {
    test('every ordered id resolves, and the default is one of them', () => {
        for (const id of MAP_TYPE_ORDER) {
            assert.ok(MAP_TYPES[id], `MAP_TYPE_ORDER lists unknown id "${id}"`);
        }
        assert.equal(MAP_TYPE_ORDER.length, Object.keys(MAP_TYPES).length);
        assert.ok(MAP_TYPE_ORDER.includes(DEFAULT_MAP_TYPE));
    });

    test('each type carries a real Mapbox style url and a label', () => {
        for (const def of Object.values(MAP_TYPES)) {
            assert.match(def.url, /^mapbox:\/\/styles\/mapbox\//, `${def.id} url looks wrong`);
            assert.ok(def.label?.length, `${def.id} has no label`);
            assert.equal(typeof def.slots, 'boolean', `${def.id} must declare slot support`);
        }
    });

    test('slot support is declared per style, not assumed', () => {
        // Only v3 Standard styles have slots. Getting this wrong is
        // invisible until a hillshade paints over every road label.
        assert.equal(MAP_TYPES.satellite.slots, true);
        assert.equal(MAP_TYPES.terrain.slots, false, 'Outdoors is a classic style');
    });

    test('an unknown id falls back rather than throwing', () => {
        // Reached by stale persisted state, which must not blank the map.
        assert.equal(mapTypeDef('nonsense').id, DEFAULT_MAP_TYPE);
        assert.equal(mapTypeDef(undefined).id, DEFAULT_MAP_TYPE);
    });
});

describe('terrain overlays adapt to the base style', () => {
    test('slot is present on Standard styles and absent on classic ones', () => {
        // A `slot` on a classic style is an invalid layer property, not a
        // harmless extra key.
        for (const spec of [hillshadeLayerSpec, contourLineLayerSpec, contourLabelLayerSpec]) {
            assert.ok('slot' in spec({ slots: true }), `${spec.name} lost its slot`);
            assert.ok(!('slot' in spec({ slots: false })), `${spec.name} kept slot on a classic style`);
        }
    });

    test('without slots, shading and contour lines go under the labels', () => {
        const style = [
            { id: 'land', type: 'background' },
            { id: 'roads', type: 'line' },
            { id: 'road-labels', type: 'symbol' },
            { id: 'place-labels', type: 'symbol' },
        ];
        const map = fakeMap(style);
        applyTerrainLayers(map, { hillshade: true, contours: true }, { slots: false });

        const at = (id) => map.added.find((a) => a.id === id);
        assert.equal(at(HILLSHADE_LAYER).beforeId, 'road-labels');
        assert.equal(at(CONTOUR_LINE_LAYER).beforeId, 'road-labels');
        // ...but the contour NUMBERS belong above the base style's own
        // symbols, or they get hidden behind road shields.
        assert.equal(at(CONTOUR_LABEL_LAYER).beforeId, undefined);
    });

    test('a style with no symbol layers still works', () => {
        const map = fakeMap([{ id: 'land', type: 'background' }]);
        assert.doesNotThrow(() =>
            applyTerrainLayers(map, { hillshade: true, contours: true }, { slots: false }));
        assert.equal(map.added.find((a) => a.id === HILLSHADE_LAYER).beforeId, undefined);
    });

    test('with slots, no beforeId is passed — the slot does the ordering', () => {
        const map = fakeMap([{ id: 'road-labels', type: 'symbol' }]);
        applyTerrainLayers(map, { hillshade: true, contours: true }, { slots: true });
        for (const a of map.added) assert.equal(a.beforeId, undefined);
    });

    test('the ground stays true-scale on every base map', () => {
        for (const def of Object.values(MAP_TYPES)) {
            const map = fakeMap();
            applyTerrainLayers(map, DEFAULT_TERRAIN, { slots: def.slots });
            assert.equal(map.terrain.exaggeration, 1, `${def.id} exaggerated the mesh`);
        }
    });
});

describe('MapCanvas rebuilds what setStyle destroys', () => {
    test('every layer-owning effect depends on styleEpoch', () => {
        // The load-bearing test. An effect that adds a source or layer but
        // omits styleEpoch will never re-run after a style swap, and its
        // layer is gone until something unrelated invalidates it.
        const src = mapCanvasSrc();

        // Effect bodies: from `useEffect(() => {` to its dependency array.
        const effects = [...src.matchAll(/useEffect\(\(\) => \{([\s\S]*?)\n    \}, (\[[^\]]*\])\);/g)];
        assert.ok(effects.length >= 6, `only found ${effects.length} effects — regex drifted`);

        const offenders = [];
        for (const [, body, deps] of effects) {
            const addsLayers = /map\.addLayer\(|map\.addSource\(|applyTerrainLayers\(/.test(body);
            // The init effect owns the map itself and runs once by design;
            // it is what CREATES the style rather than reacting to it.
            const isInit = /new mapboxgl\.Map\(/.test(body);
            if (addsLayers && !isInit && !deps.includes('styleEpoch')) {
                offenders.push(deps);
            }
        }
        assert.deepEqual(offenders, [], `effects add layers but ignore styleEpoch: ${offenders.join(' ; ')}`);
    });

    test('the imperative course draw is remembered so it can be replayed', () => {
        // drawCourse is called through the ref by App, so no state change
        // would ever re-trigger it after a style swap.
        const src = mapCanvasSrc();
        assert.match(src, /function drawCourse\(course\) \{[\s\S]{0,200}lastCourseRef\.current = course/);
        assert.match(src, /styleEpoch === 0[\s\S]{0,300}drawCourse\(lastCourseRef\.current\)/);
    });

    test('the style swap is guarded against redundant reloads', () => {
        // setStyle tears down and rebuilds everything, so firing it on an
        // unchanged type would make any re-render of App flash the map.
        const src = mapCanvasSrc();
        assert.match(src, /appliedMapTypeRef\.current === next\.id\) return/);
    });
});
