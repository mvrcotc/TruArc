/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  TruArc — Observed Weather (Open-Meteo)                          ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Fetches the current conditions at a course so a player can simulate
 * against the wind that is actually blowing, then adjust from there.
 *
 * ── WHY OPEN-METEO ───────────────────────────────────────────────────
 * No API key. This app already degrades badly when configuration is
 * missing (Mapbox and Firebase both need keys), and weather is a
 * nice-to-have that must never become another setup step. Open-Meteo is
 * free for non-commercial use, CORS-enabled, and needs no account.
 *
 * ── ⚠ THE NETWORK PATH IS UNVERIFIED ─────────────────────────────────
 * This environment's egress policy blocks `api.open-meteo.com` (403 on
 * CONNECT, same as `api.mapbox.com` and `overpass-api.de`). Everything
 * below is therefore tested against a fixture built from Open-Meteo's
 * documented response schema, NOT a live call — the same standing gap
 * as tools/import-osm.mjs. What is genuinely verified: URL
 * construction, unit handling, the coordinate-frame conversion, and
 * every failure path. What is not: that the live service returns the
 * shape documented here.
 *
 * ── TWO CONVERSIONS THAT ARE EASY TO GET SILENTLY WRONG ──────────────
 * 1. UNITS. Open-Meteo defaults to km/h. We ask for m/s explicitly AND
 *    honour the `current_units` the response reports, because trusting
 *    a request parameter we did not verify is how you end up simulating
 *    a 3.6x gale.
 * 2. FRAME. Meteorological wind direction is the compass bearing the
 *    wind blows FROM (0 = from the north). The flight engine's wind
 *    direction is measured relative to the THROW's forward axis (0 = a
 *    headwind) — verified from the engine source, see
 *    `throwerProfile.buildWindSpec`. Feeding a compass bearing straight
 *    into the engine would rotate the wind by the hole's bearing, which
 *    on an east-facing hole turns a headwind into a crosswind with no
 *    visible symptom. `relativeWindDirection` is that conversion and it
 *    is tested against worked examples.
 */

const ENDPOINT = 'https://api.open-meteo.com/v1/forecast';

const KMH_TO_MPS = 1 / 3.6;
const MPH_TO_MPS = 0.44704;
const KNOTS_TO_MPS = 0.514444;

/**
 * @param {number} lat
 * @param {number} lng
 * @returns {string} request URL for current conditions
 */
export function buildWeatherUrl(lat, lng) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        throw new Error('buildWeatherUrl: lat/lng must be finite numbers');
    }
    const params = new URLSearchParams({
        latitude: String(lat),
        longitude: String(lng),
        current: 'temperature_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m',
        wind_speed_unit: 'ms',
        temperature_unit: 'celsius',
    });
    return `${ENDPOINT}?${params.toString()}`;
}

/**
 * Normalise a wind speed to m/s using the unit the RESPONSE declares,
 * not the one we asked for.
 */
export function windSpeedToMps(value, unit) {
    if (!Number.isFinite(value)) return null;
    switch ((unit || '').toLowerCase()) {
        case 'ms':
        case 'm/s':
            return value;
        case 'kmh':
        case 'km/h':
            return value * KMH_TO_MPS;
        case 'mph':
            return value * MPH_TO_MPS;
        case 'kn':
        case 'kt':
        case 'knots':
            return value * KNOTS_TO_MPS;
        default:
            // An unrecognised unit is not a reason to guess — a wrong
            // wind speed is worse than no wind reading at all.
            return null;
    }
}

/**
 * Open-Meteo current-conditions payload → the shape this app uses.
 * Returns null when the response carries no usable current block, so a
 * malformed reply degrades to "no observation" rather than to NaN wind.
 *
 * @returns {{temperatureC: number|null, windSpeedMps: number,
 *            windFromDeg: number, gustMps: number|null,
 *            observedAt: string|null} | null}
 */
export function parseWeatherResponse(json) {
    const cur = json?.current;
    if (!cur || typeof cur !== 'object') return null;

    const units = json.current_units ?? {};
    const windSpeedMps = windSpeedToMps(cur.wind_speed_10m, units.wind_speed_10m ?? 'ms');
    const windFromDeg = cur.wind_direction_10m;

    // Wind speed and direction are the whole point — without both, this
    // is not an observation we can simulate against.
    if (windSpeedMps === null || !Number.isFinite(windFromDeg)) return null;

    const gustMps = windSpeedToMps(cur.wind_gusts_10m, units.wind_gusts_10m ?? 'ms');

    return {
        temperatureC: Number.isFinite(cur.temperature_2m) ? cur.temperature_2m : null,
        windSpeedMps: Math.max(0, windSpeedMps),
        windFromDeg: ((windFromDeg % 360) + 360) % 360,
        gustMps: gustMps !== null && gustMps >= 0 ? gustMps : null,
        observedAt: typeof cur.time === 'string' ? cur.time : null,
    };
}

/**
 * Meteorological (compass, blows-FROM) → the engine's throw-relative
 * frame, where 0° is a headwind.
 *
 * Worked example: a hole plays due east (bearing 90) and the wind is
 * from the east (compass 90) — that is a headwind, so the result must
 * be 0. Another: hole plays north (bearing 0), wind from the west
 * (compass 270) → 270, which the engine resolves to a push toward the
 * thrower's right. Both are asserted in the tests.
 */
export function relativeWindDirection(compassFromDeg, throwBearingDeg = 0) {
    const from = Number.isFinite(compassFromDeg) ? compassFromDeg : 0;
    const bearing = Number.isFinite(throwBearingDeg) ? throwBearingDeg : 0;
    return ((from - bearing) % 360 + 360) % 360;
}

const COMPASS_POINTS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
    'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

/** Compass degrees → the 16-point label a player expects to read. */
export function compassLabel(deg) {
    if (!Number.isFinite(deg)) return '—';
    const norm = ((deg % 360) + 360) % 360;
    return COMPASS_POINTS[Math.round(norm / 22.5) % 16];
}

/**
 * How a throw-relative wind will actually play, in words. Bands are
 * generous on the cross side because a wind 45° off the nose behaves far
 * more like a crosswind than a headwind for a disc.
 */
export function describeRelativeWind(relativeDeg, speedMps = 1) {
    if (!(speedMps > 0)) return 'Calm';
    const d = ((relativeDeg % 360) + 360) % 360;
    if (d <= 30 || d >= 330) return 'Headwind';
    if (d >= 150 && d <= 210) return 'Tailwind';
    // The engine's frame: a wind FROM the right pushes the disc left.
    return d < 180 ? 'Crosswind from right' : 'Crosswind from left';
}

/**
 * Fetch current conditions for a course.
 *
 * @param {number} lat
 * @param {number} lng
 * @param {{fetchImpl?: Function, signal?: AbortSignal}} [options]
 *        `fetchImpl` is injectable so the parsing/URL logic can be
 *        tested without a network this environment cannot reach.
 * @returns {Promise<object|null>} parsed observation, or null when the
 *          service is unreachable or the reply is unusable. Callers
 *          treat null as "no observation available", never as calm.
 */
export async function fetchCourseWeather(lat, lng, options = {}) {
    const doFetch = options.fetchImpl
        ?? (typeof fetch !== 'undefined' ? fetch : null);
    if (!doFetch) return null;

    const res = await doFetch(buildWeatherUrl(lat, lng), { signal: options.signal });
    if (!res || !res.ok) return null;
    return parseWeatherResponse(await res.json());
}
