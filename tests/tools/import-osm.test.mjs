/**
 * Tests for tools/import-osm.mjs. No live network here (this
 * environment cannot reach overpass-api.de — see the module's own
 * header comment) — `buildOverpassQuery` and `parseOverpassResponse`
 * are pure functions tested directly, and `fetchCourseFromOSM` is
 * exercised with an injected fake `fetchImpl`, the same pattern
 * tools/lidar_pipeline/acquire.py uses for the (also unreachable) USGS
 * API.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
    buildOverpassQuery, parseOverpassResponse, fetchCourseFromOSM,
} from '../../tools/import-osm.mjs';
import { DATA_QUALITY, validateHole } from '../../src/data/courses.js';

describe('buildOverpassQuery', () => {
    const bbox = {
        minLng: -71.900, minLat: 42.274, maxLng: -71.892, maxLat: 42.280,
    };

    test('emits the bbox in Overpass order (south,west,north,east) — the REVERSE of this app\'s own field order', () => {
        const query = buildOverpassQuery(bbox);
        // south=minLat, west=minLng, north=maxLat, east=maxLng
        assert.ok(query.includes('(42.274,-71.9,42.28,-71.892)'), query);
    });

    test('queries sport=disc_golf as a node/way/relation (nwr) filter', () => {
        const query = buildOverpassQuery(bbox);
        assert.match(query, /nwr\["sport"="disc_golf"\]/);
    });

    test('requests full geometry (out geom) so way/relation shapes are usable', () => {
        assert.match(buildOverpassQuery(bbox), /out geom;/);
    });

    test('honors a custom timeout', () => {
        assert.match(buildOverpassQuery(bbox, { timeoutS: 60 }), /\[timeout:60\]/);
    });
});

describe('parseOverpassResponse', () => {
    // A realistic 3-hole fixture built against Overpass's documented
    // element schema: nodes carry {id, lat, lon, tags}; ways/relations
    // carry {id, tags, geometry: [{lat,lon},...]} under `out geom;`.
    const fixture = {
        elements: [
            // Hole 1 — complete (tee + basket both mapped).
            {
                type: 'node', id: 100, lat: 42.2765, lon: -71.8968, tags: { sport: 'disc_golf', golf: 'tee', ref: '1' },
            },
            {
                type: 'node', id: 101, lat: 42.2764, lon: -71.8952, tags: { sport: 'disc_golf', golf: 'hole', ref: '1' },
            },
            // Hole 2 — complete, ref given as "hole" tag instead of "ref".
            {
                type: 'node', id: 102, lat: 42.2761, lon: -71.8944, tags: { sport: 'disc_golf', golf: 'tee', hole: '2' },
            },
            {
                type: 'node', id: 103, lat: 42.2754, lon: -71.8937, tags: { sport: 'disc_golf', golf: 'hole', hole: '2' },
            },
            // Hole 3 — PARTIAL: tee mapped, basket never mapped by anyone.
            {
                type: 'node', id: 104, lat: 42.2750, lon: -71.8932, tags: { sport: 'disc_golf', golf: 'tee', ref: '3' },
            },
            // Course boundary polygon.
            {
                type: 'way',
                id: 200,
                tags: { sport: 'disc_golf', leisure: 'pitch', name: 'Maple Hill' },
                geometry: [
                    { lat: 42.280, lon: -71.900 },
                    { lat: 42.280, lon: -71.892 },
                    { lat: 42.274, lon: -71.892 },
                    { lat: 42.274, lon: -71.900 },
                    { lat: 42.280, lon: -71.900 },
                ],
            },
            // Tagged disc_golf but no golf=tee/hole and no leisure=pitch —
            // e.g. a clubhouse or parking node caught by the broad sport
            // filter. Must NOT be guessed into a hole.
            {
                type: 'node', id: 300, lat: 42.277, lon: -71.895, tags: { sport: 'disc_golf', amenity: 'parking' },
            },
            // golf=tee but no ref/hole tag at all — can't be numbered, so
            // also unrecognized rather than silently dropped or ref=1'd.
            {
                type: 'node', id: 301, lat: 42.278, lon: -71.896, tags: { sport: 'disc_golf', golf: 'tee' },
            },
        ],
    };

    const result = parseOverpassResponse(fixture);

    test('recovers exactly 3 holes, sorted by number', () => {
        assert.deepEqual(result.holes.map((h) => h.num), [1, 2, 3]);
    });

    test('holes 1 and 2 are complete and flagged measured, with tee/basket coordinates intact', () => {
        const [h1, h2] = result.holes;
        assert.equal(h1.dataQuality, DATA_QUALITY.MEASURED);
        assert.equal(h2.dataQuality, DATA_QUALITY.MEASURED);
        assert.deepEqual(h1.tee, { lng: -71.8968, lat: 42.2765 });
        assert.deepEqual(h1.basket, { lng: -71.8952, lat: 42.2764 });
    });

    test('a measured hole still fails validateHole on par — OSM does not carry it, so it is not silently invented', () => {
        // MEASURED describes the tee/basket coordinates, not the whole
        // hole record. par is a real, separate gap this importer is
        // honest about rather than defaulting to something plausible.
        const h1 = result.holes[0];
        assert.equal(h1.par, null);
        assert.throws(() => validateHole(h1), /par must be/);
    });

    test('hole 2 is recognized via the "hole" tag alias, not just "ref"', () => {
        const h2 = result.holes.find((h) => h.num === 2);
        assert.ok(h2);
        assert.equal(h2.dataQuality, DATA_QUALITY.MEASURED);
    });

    test('a measured hole gets a real distanceFt derived from its own tee/basket, not fabricated', () => {
        const h1 = result.holes[0];
        // ~130m between the two points above -> roughly 420-430 ft.
        assert.ok(h1.distanceFt > 400 && h1.distanceFt < 450, `distanceFt=${h1.distanceFt}`);
    });

    test('hole 3 (tee only, no basket ever mapped) is flagged partial, NOT crashed into NaN via basketFromTee', () => {
        const h3 = result.holes.find((h) => h.num === 3);
        assert.ok(h3);
        assert.equal(h3.dataQuality, DATA_QUALITY.PARTIAL);
        assert.equal(h3.basket, null);
        assert.ok(h3.tee && Number.isFinite(h3.tee.lng) && Number.isFinite(h3.tee.lat));
        assert.equal(h3.distanceFt, null);
    });

    test('the course boundary way is captured separately as a course area, not as a hole', () => {
        assert.equal(result.courseAreas.length, 1);
        assert.equal(result.courseAreas[0].id, 200);
        assert.equal(result.courseAreas[0].geometry.length, 5);
    });

    test('untaggable disc_golf features are surfaced as unrecognized, never silently guessed into a hole', () => {
        const ids = result.unrecognizedFeatures.map((f) => f.id);
        assert.ok(ids.includes(300), 'parking node dropped instead of surfaced');
        assert.ok(ids.includes(301), 'unnumbered tee dropped instead of surfaced');
        // Must not have been folded into any hole's tee/basket.
        assert.ok(!result.holes.some((h) => (h.tee && h.tee.lng === -71.896) || (h.basket && h.basket.lng === -71.896)));
    });

    test('an empty response parses to empty results, not an error', () => {
        const empty = parseOverpassResponse({ elements: [] });
        assert.deepEqual(empty, { holes: [], courseAreas: [], unrecognizedFeatures: [] });
    });

    test('a response with no elements key at all is tolerated', () => {
        assert.deepEqual(parseOverpassResponse({}), { holes: [], courseAreas: [], unrecognizedFeatures: [] });
    });
});

describe('fetchCourseFromOSM (fake fetch — no live network)', () => {
    const bbox = {
        minLng: -71.900, minLat: 42.274, maxLng: -71.892, maxLat: 42.280,
    };

    test('POSTs the built query to the Overpass URL and parses a successful response', async () => {
        let capturedUrl;
        let capturedBody;
        const fetchImpl = async (url, opts) => {
            capturedUrl = url;
            capturedBody = opts.body;
            return {
                ok: true,
                json: async () => ({
                    elements: [
                        {
                            type: 'node', id: 1, lat: 1, lon: 2, tags: { sport: 'disc_golf', golf: 'tee', ref: '1' },
                        },
                        {
                            type: 'node', id: 2, lat: 1.001, lon: 2.001, tags: { sport: 'disc_golf', golf: 'hole', ref: '1' },
                        },
                    ],
                }),
            };
        };

        const result = await fetchCourseFromOSM(bbox, { fetchImpl });
        assert.equal(capturedUrl, 'https://overpass-api.de/api/interpreter');
        assert.ok(capturedBody.startsWith('data='));
        assert.equal(decodeURIComponent(capturedBody.slice(5)), buildOverpassQuery(bbox));
        assert.equal(result.holes.length, 1);
    });

    test('throws with the HTTP status on a non-ok response, rather than parsing garbage', async () => {
        const fetchImpl = async () => ({ ok: false, status: 504 });
        await assert.rejects(() => fetchCourseFromOSM(bbox, { fetchImpl }), /504/);
    });
});
