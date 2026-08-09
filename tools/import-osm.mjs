#!/usr/bin/env node
/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  TruArc — OSM Disc Golf Course Importer (Section 5, step 2)      ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Many disc golf courses already have tees/baskets mapped in
 * OpenStreetMap. This queries Overpass for everything tagged
 * `sport=disc_golf` inside a bounding box and turns whatever it
 * recognizes into schema v2 hole objects (src/data/courses.js's
 * `normalizeHole`/`validateHole`) — real MEASURED coordinates, not
 * `basketFromTee`'s estimate.
 *
 *   node tools/import-osm.mjs --bbox=-71.900,42.274,-71.892,42.280 --out=maple-hill.json
 *
 * ── TAGGING CONVENTION THIS TARGETS ──────────────────────────────────
 * OSM has no single ratified disc-golf schema the way `highway=` is
 * standardized, but the convention this file targets — borrowed from
 * regular golf's `golf=tee`/`golf=hole` — is documented on the OSM wiki
 * (Tag:sport=disc_golf) and is what mappers who bother tagging
 * individual holes (rather than just the course polygon) actually use:
 * a node with `sport=disc_golf` + `golf=tee` for a tee pad, `golf=hole`
 * for a basket, and a `ref` tag carrying the hole number so a tee and
 * basket can be paired without guessing. Anything tagged
 * `sport=disc_golf` that does NOT match this shape (no `golf=tee/hole`,
 * or no `ref`) is returned as `unrecognizedFeatures` rather than paired
 * by nearest-neighbor distance or sequence order — a course with a
 * switchback layout would make that guess confidently wrong, and this
 * importer's whole purpose is to replace a guess (`basketFromTee`) with
 * real data, not with a different guess.
 *
 * ── NOTE ON THIS SESSION'S VERIFICATION ──────────────────────────────
 * This environment's outbound network does not reach
 * overpass-api.de (confirmed: CONNECT tunnel failed, 403 from the
 * proxy) — the live query itself could not be exercised end-to-end.
 * What IS verified (see tests/tools/import-osm.test.mjs): the Overpass
 * QL request construction (bbox coordinate ORDER specifically — Overpass
 * bbox filters are south,west,north,east, easy to get backwards from
 * this app's own minLng/minLat/maxLng/maxLat convention) and response
 * parsing against a fixture built from Overpass's documented JSON
 * schema (`elements: [{type, id, lat, lon, tags}]`). Same category of
 * gap as acquire.py's USGS call and Section 1's missing Mapbox token —
 * run this in an environment with real network access to confirm the
 * live call, and to find out whether the `golf=tee`/`golf=hole`/`ref`
 * convention assumed above actually matches what's mapped for a given
 * course before trusting its output as MEASURED.
 */

import { writeFileSync } from 'node:fs';
import {
    normalizeHole, validateHole, getHoleBearing, DATA_QUALITY,
} from '../src/data/courses.js';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

/**
 * @param {{minLng:number, minLat:number, maxLng:number, maxLat:number}} bbox
 * @returns {string} Overpass QL. NOTE: Overpass bbox filters are
 *   (south,west,north,east) — i.e. (minLat,minLng,maxLat,maxLng) — the
 *   REVERSE order of this app's own bbox field order. Getting this
 *   backwards silently queries a nonsense region rather than erroring,
 *   so it's asserted explicitly in tests/tools/import-osm.test.mjs.
 */
export function buildOverpassQuery(bbox, { timeoutS = 25 } = {}) {
    const { minLng, minLat, maxLng, maxLat } = bbox;
    return `[out:json][timeout:${timeoutS}];\n`
        + `(\n`
        + `  nwr["sport"="disc_golf"](${minLat},${minLng},${maxLat},${maxLng});\n`
        + `);\n`
        + `out geom;`;
}

function parseHoleNumber(tags) {
    // `ref` is OSM's general-purpose "reference number of this feature"
    // tag, used the same way for a regular golf hole's `golf=hole` +
    // `ref=1`. `hole` is accepted too since some disc-golf mappers use
    // it directly rather than borrowing golf's `ref` convention.
    const raw = tags.ref ?? tags.hole;
    if (raw == null) return null;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
}

/**
 * Parses a raw Overpass `out geom;` JSON response into schema v2 holes,
 * course-boundary areas, and anything disc-golf-tagged that couldn't be
 * safely interpreted as a tee or basket.
 *
 * @returns {{
 *   holes: Array,          // schema v2 holes (normalizeHole'd), sorted by num
 *   courseAreas: Array,    // {id, tags, geometry} — course/pitch polygons, unparsed
 *   unrecognizedFeatures: Array, // {id, type, tags, lng?, lat?} — needs a human
 * }}
 */
export function parseOverpassResponse(json) {
    const elements = json.elements || [];
    const tees = new Map();
    const baskets = new Map();
    const unrecognized = [];
    const courseAreas = [];

    for (const el of elements) {
        const tags = el.tags || {};
        if (tags.sport !== 'disc_golf') continue;

        if (el.type === 'node') {
            const holeNum = parseHoleNumber(tags);
            if (tags.golf === 'tee' && holeNum != null) {
                tees.set(holeNum, { lng: el.lon, lat: el.lat });
                continue;
            }
            if (tags.golf === 'hole' && holeNum != null) {
                baskets.set(holeNum, { lng: el.lon, lat: el.lat });
                continue;
            }
            unrecognized.push({
                id: el.id, type: el.type, tags, lng: el.lon, lat: el.lat,
            });
            continue;
        }

        if ((el.type === 'way' || el.type === 'relation') && tags.leisure === 'pitch') {
            courseAreas.push({ id: el.id, tags, geometry: el.geometry || null });
            continue;
        }

        unrecognized.push({ id: el.id, type: el.type, tags });
    }

    const holeNums = new Set([...tees.keys(), ...baskets.keys()]);
    const holes = [...holeNums].sort((a, b) => a - b).map((num) => {
        const tee = tees.get(num) || null;
        const basket = baskets.get(num) || null;
        const complete = !!(tee && basket);

        // A COMPLETE hole (both tee and basket found) goes through
        // normalizeHole like any other measured hole. A PARTIAL one
        // (only tee OR only basket) deliberately does NOT — normalizeHole
        // derives a missing basket via basketFromTee, which needs a
        // distanceFt AND bearing that don't exist without the OTHER
        // endpoint; routing a tee-only hole through it would silently
        // basketFromTee(tee, null, null) into NaN coordinates rather than
        // the honest "this hole needs a human" it actually is.
        const base = {
            obPolygons: [], mandos: [], dropzones: [], pinPositions: null, fairway: null,
            par: null, // OSM does not reliably carry par; left for a human to fill in
        };
        if (complete) {
            const normalized = normalizeHole({
                ...base, num, tee, basket, dataQuality: DATA_QUALITY.MEASURED, distanceFt: measureDistanceFt(tee, basket),
            });
            // `bearing` isn't load-bearing for a hole that already has a
            // real basket (getHoleBearing derives it on demand elsewhere
            // in the app), but HoleCard's compass icon reads it directly —
            // filled in here from the SAME tee/basket so it can't drift
            // out of sync with them the way a hand-entered value could.
            return { ...normalized, bearing: getHoleBearing(normalized) };
        }
        return {
            ...base, num, tee, basket, dataQuality: DATA_QUALITY.PARTIAL, distanceFt: null,
        };
    });

    return { holes, courseAreas, unrecognizedFeatures: unrecognized };
}

const METERS_PER_DEG_LAT = 111320;
function measureDistanceFt(a, b) {
    const mPerDegLng = METERS_PER_DEG_LAT * Math.cos((a.lat * Math.PI) / 180);
    const dx = (b.lng - a.lng) * mPerDegLng;
    const dy = (b.lat - a.lat) * METERS_PER_DEG_LAT;
    return Math.hypot(dx, dy) * 3.28084;
}

/**
 * End-to-end fetch + parse. `fetchImpl` is injectable (defaults to the
 * global `fetch`) purely so this is testable without live network —
 * same pattern as acquire.py's `http_get` parameter.
 */
export async function fetchCourseFromOSM(bbox, { fetchImpl = fetch, overpassUrl = OVERPASS_URL, timeoutS = 25 } = {}) {
    const query = buildOverpassQuery(bbox, { timeoutS });
    const res = await fetchImpl(overpassUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
    });
    if (!res.ok) throw new Error(`Overpass request failed: HTTP ${res.status}`);
    const json = await res.json();
    return parseOverpassResponse(json);
}

// ─── CLI ─────────────────────────────────────────────────────────
function parseArgs(argv) {
    const args = {};
    for (const arg of argv) {
        const m = arg.match(/^--([\w-]+)(?:=(.*))?$/);
        if (m) args[m[1]] = m[2] ?? true;
    }
    return args;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (!args.bbox) {
        console.error('Usage: node tools/import-osm.mjs --bbox=minLng,minLat,maxLng,maxLat [--out=course.json]');
        process.exitCode = 1;
        return;
    }
    const [minLng, minLat, maxLng, maxLat] = args.bbox.split(',').map(Number);
    const bbox = { minLng, minLat, maxLng, maxLat };

    console.log(`Querying Overpass for sport=disc_golf in bbox ${args.bbox}...`);
    const result = await fetchCourseFromOSM(bbox);

    for (const hole of result.holes) {
        try {
            if (hole.dataQuality !== DATA_QUALITY.PARTIAL) validateHole(hole);
        } catch (err) {
            console.warn(`  ${err.message}`);
        }
    }

    console.log(`Found ${result.holes.length} hole(s) (`
        + `${result.holes.filter((h) => h.dataQuality === DATA_QUALITY.MEASURED).length} complete, `
        + `${result.holes.filter((h) => h.dataQuality === DATA_QUALITY.PARTIAL).length} partial), `
        + `${result.courseAreas.length} course area(s), `
        + `${result.unrecognizedFeatures.length} unrecognized feature(s) needing manual review.`);

    if (args.out) {
        writeFileSync(args.out, JSON.stringify(result, null, 2));
        console.log(`Wrote ${args.out}`);
    } else {
        console.log(JSON.stringify(result, null, 2));
    }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch((err) => {
        console.error(err);
        process.exitCode = 1;
    });
}
