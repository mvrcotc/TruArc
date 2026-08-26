/**
 * Tests for src/utils/weather.js — observed conditions from Open-Meteo.
 *
 * ⚠ The fixture below is built from Open-Meteo's DOCUMENTED response
 * schema, not from a live call: this environment's egress policy blocks
 * `api.open-meteo.com` (403 on CONNECT, same as api.mapbox.com and
 * overpass-api.de). So what these tests genuinely verify is URL
 * construction, unit handling, the coordinate-frame conversion, and
 * every failure path — NOT that the live service returns this shape.
 * Same standing gap as tests/tools/import-osm.test.mjs.
 *
 * The two things worth the most attention here are the conversions,
 * because both fail silently:
 *   - km/h vs m/s: a 3.6x error that still looks like a plausible wind.
 *   - compass vs throw-relative: rotates a headwind into a crosswind
 *     with no visible symptom on any single hole.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
    buildWeatherUrl, parseWeatherResponse, windSpeedToMps,
    relativeWindDirection, compassLabel, describeRelativeWind,
    fetchCourseWeather,
} from '../../src/utils/weather.js';

// Shaped after Open-Meteo's documented `current` block.
const FIXTURE = {
    latitude: 42.2765,
    longitude: -71.896,
    current_units: {
        time: 'iso8601',
        temperature_2m: '°C',
        wind_speed_10m: 'ms',
        wind_direction_10m: '°',
        wind_gusts_10m: 'ms',
    },
    current: {
        time: '2026-08-09T18:00',
        temperature_2m: 21.4,
        wind_speed_10m: 5.5,
        wind_direction_10m: 270,
        wind_gusts_10m: 9.1,
    },
};

const okResponse = (json) => ({ ok: true, json: async () => json });

// ─── buildWeatherUrl ─────────────────────────────────────────────────

describe('buildWeatherUrl', () => {
    test('targets Open-Meteo and asks for the fields the app uses', () => {
        const url = buildWeatherUrl(42.2765, -71.896);
        assert.ok(url.startsWith('https://api.open-meteo.com/v1/forecast?'));
        const q = new URL(url).searchParams;
        assert.equal(q.get('latitude'), '42.2765');
        assert.equal(q.get('longitude'), '-71.896');
        for (const field of ['temperature_2m', 'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m']) {
            assert.ok(q.get('current').includes(field), `missing ${field}`);
        }
    });

    test('requests m/s explicitly rather than accepting the km/h default', () => {
        const q = new URL(buildWeatherUrl(1, 2)).searchParams;
        assert.equal(q.get('wind_speed_unit'), 'ms');
    });

    test('rejects non-finite coordinates instead of building a junk URL', () => {
        assert.throws(() => buildWeatherUrl(NaN, 0), /finite/);
        assert.throws(() => buildWeatherUrl(0, undefined), /finite/);
    });
});

// ─── windSpeedToMps ──────────────────────────────────────────────────

describe('windSpeedToMps', () => {
    test('passes m/s through', () => {
        assert.equal(windSpeedToMps(5.5, 'ms'), 5.5);
        assert.equal(windSpeedToMps(5.5, 'm/s'), 5.5);
    });

    test('converts km/h — the default we did not ask for', () => {
        assert.ok(Math.abs(windSpeedToMps(36, 'kmh') - 10) < 1e-9);
    });

    test('converts mph and knots', () => {
        assert.ok(Math.abs(windSpeedToMps(10, 'mph') - 4.4704) < 1e-9);
        assert.ok(Math.abs(windSpeedToMps(10, 'kn') - 5.14444) < 1e-9);
    });

    test('returns null for an unrecognised unit rather than guessing', () => {
        // A wrong wind speed is worse than no reading: it silently
        // changes every simulated flight.
        assert.equal(windSpeedToMps(10, 'furlongs/fortnight'), null);
        assert.equal(windSpeedToMps(10, undefined), null);
    });

    test('returns null for a non-numeric value', () => {
        assert.equal(windSpeedToMps(undefined, 'ms'), null);
        assert.equal(windSpeedToMps(NaN, 'ms'), null);
    });
});

// ─── parseWeatherResponse ────────────────────────────────────────────

describe('parseWeatherResponse', () => {
    test('reads the documented fixture', () => {
        const w = parseWeatherResponse(FIXTURE);
        assert.equal(w.temperatureC, 21.4);
        assert.equal(w.windSpeedMps, 5.5);
        assert.equal(w.windFromDeg, 270);
        assert.equal(w.gustMps, 9.1);
        assert.equal(w.observedAt, '2026-08-09T18:00');
    });

    test('honours the unit the RESPONSE declares, not the one requested', () => {
        // The guard against a 3.6x error: if the service ever ignores
        // wind_speed_unit and returns km/h, we must still be right.
        const kmh = {
            ...FIXTURE,
            current_units: { ...FIXTURE.current_units, wind_speed_10m: 'kmh', wind_gusts_10m: 'kmh' },
            current: { ...FIXTURE.current, wind_speed_10m: 36, wind_gusts_10m: 54 },
        };
        const w = parseWeatherResponse(kmh);
        assert.ok(Math.abs(w.windSpeedMps - 10) < 1e-9, `got ${w.windSpeedMps} m/s`);
        assert.ok(Math.abs(w.gustMps - 15) < 1e-9);
    });

    test('returns null when wind is unusable — never a fabricated calm', () => {
        // "No observation" and "dead calm" are different claims; a
        // caller must be able to tell them apart.
        assert.equal(parseWeatherResponse({}), null);
        assert.equal(parseWeatherResponse(null), null);
        assert.equal(parseWeatherResponse({ current: {} }), null);
        assert.equal(parseWeatherResponse({
            ...FIXTURE,
            current: { ...FIXTURE.current, wind_direction_10m: undefined },
        }), null);
        assert.equal(parseWeatherResponse({
            ...FIXTURE,
            current_units: { ...FIXTURE.current_units, wind_speed_10m: 'bogus' },
        }), null);
    });

    test('a genuine dead calm parses as 0, not as null', () => {
        const calm = parseWeatherResponse({
            ...FIXTURE,
            current: { ...FIXTURE.current, wind_speed_10m: 0, wind_direction_10m: 0 },
        });
        assert.equal(calm.windSpeedMps, 0);
        assert.equal(calm.windFromDeg, 0);
    });

    test('missing optional fields degrade to null without losing the wind', () => {
        const w = parseWeatherResponse({
            current_units: { wind_speed_10m: 'ms' },
            current: { wind_speed_10m: 3, wind_direction_10m: 180 },
        });
        assert.equal(w.windSpeedMps, 3);
        assert.equal(w.temperatureC, null);
        assert.equal(w.gustMps, null);
        assert.equal(w.observedAt, null);
    });

    test('normalises direction into [0, 360)', () => {
        const w = parseWeatherResponse({
            ...FIXTURE,
            current: { ...FIXTURE.current, wind_direction_10m: 450 },
        });
        assert.equal(w.windFromDeg, 90);
    });
});

// ─── relativeWindDirection ───────────────────────────────────────────

describe('relativeWindDirection — compass → throw-relative', () => {
    test('wind from straight ahead is a headwind (0), whatever the bearing', () => {
        // The load-bearing case. On an east-facing hole an easterly wind
        // IS a headwind; feeding compass degrees in raw would call it a
        // crosswind and nothing on screen would look wrong.
        for (const bearing of [0, 45, 90, 180, 270, 315]) {
            assert.equal(relativeWindDirection(bearing, bearing), 0, `bearing ${bearing}`);
        }
    });

    test('wind from directly behind is a tailwind (180)', () => {
        assert.equal(relativeWindDirection(270, 90), 180);
        assert.equal(relativeWindDirection(0, 180), 180);
    });

    test('worked example: north-facing hole, wind from the west', () => {
        // Facing north, west is on your left, so the wind comes from the
        // left and pushes the disc right — engine frame 270.
        assert.equal(relativeWindDirection(270, 0), 270);
    });

    test('normalises into [0, 360) across wraps and negatives', () => {
        for (const [from, bearing] of [[10, 40], [0, 359], [350, -20], [45, 720]]) {
            const d = relativeWindDirection(from, bearing);
            assert.ok(d >= 0 && d < 360, `got ${d}`);
        }
    });

    test('defaults to no rotation when the bearing is unknown', () => {
        assert.equal(relativeWindDirection(135), 135);
        assert.equal(relativeWindDirection(135, NaN), 135);
    });
});

// ─── labels ──────────────────────────────────────────────────────────

describe('compassLabel', () => {
    test('maps the cardinal and intercardinal points', () => {
        assert.equal(compassLabel(0), 'N');
        assert.equal(compassLabel(90), 'E');
        assert.equal(compassLabel(180), 'S');
        assert.equal(compassLabel(270), 'W');
        assert.equal(compassLabel(45), 'NE');
        assert.equal(compassLabel(225), 'SW');
    });

    test('wraps 350+ back to N rather than off the end of the table', () => {
        assert.equal(compassLabel(359), 'N');
        assert.equal(compassLabel(360), 'N');
    });

    test('degrades for a missing reading', () => {
        assert.equal(compassLabel(undefined), '—');
    });
});

describe('describeRelativeWind', () => {
    test('names head, tail and each crosswind side', () => {
        assert.equal(describeRelativeWind(0, 5), 'Headwind');
        assert.equal(describeRelativeWind(180, 5), 'Tailwind');
        assert.equal(describeRelativeWind(90, 5), 'Crosswind from right');
        assert.equal(describeRelativeWind(270, 5), 'Crosswind from left');
    });

    test('calls a zero-speed wind calm regardless of direction', () => {
        assert.equal(describeRelativeWind(90, 0), 'Calm');
    });
});

// ─── fetchCourseWeather ──────────────────────────────────────────────

describe('fetchCourseWeather', () => {
    test('fetches the built URL and returns the parsed observation', async () => {
        let seen = null;
        const w = await fetchCourseWeather(42.2765, -71.896, {
            fetchImpl: async (url) => { seen = url; return okResponse(FIXTURE); },
        });
        assert.ok(seen.includes('latitude=42.2765'));
        assert.equal(w.windSpeedMps, 5.5);
        assert.equal(w.windFromDeg, 270);
    });

    test('returns null on a non-ok response rather than throwing', async () => {
        const w = await fetchCourseWeather(1, 2, {
            fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({}) }),
        });
        assert.equal(w, null);
    });

    test('returns null when the payload is unusable', async () => {
        const w = await fetchCourseWeather(1, 2, { fetchImpl: async () => okResponse({ current: {} }) });
        assert.equal(w, null);
    });

    test('propagates an abort so a course change cancels the in-flight call', async () => {
        await assert.rejects(
            fetchCourseWeather(1, 2, {
                fetchImpl: async () => { throw Object.assign(new Error('aborted'), { name: 'AbortError' }); },
            }),
            /aborted/,
        );
    });
});
