/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  TruArc — Seeing the wind                                        ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Draws the observed wind as streaks flowing across the ground, so a
 * player looking at a rotated 3-D view can read direction and strength
 * without translating "WSW 12 mph" into a mental compass.
 *
 * That translation is the whole point. A bearing in text is useless the
 * moment the camera is turned — which it always is, because you orient
 * the map down the fairway. Streaks moving across the hole answer
 * "which way, and how hard, relative to THIS shot" instantly.
 *
 * ── THE FIELD IS UNIFORM, BECAUSE THE MEASUREMENT IS ─────────────────
 * Open-Meteo returns ONE vector for the course: `wind_speed_10m` and
 * `wind_direction_10m` at a single coordinate, sampled from a model
 * grid cell kilometres across (see src/utils/weather.js). There is no
 * second sample and nothing resolving variation within a hole.
 *
 * So every streak here is parallel and moves at the same rate. That is
 * not a rendering shortcut — it is the honest depiction of what a single
 * vector knows.
 *
 * Real wind on a wooded course does none of this. It accelerates through
 * gaps, stalls behind tree lines, curls over ridges, and reverses in
 * lee eddies. Drawing any of that would mean inventing a flow model on
 * top of one measurement, and a player would read the invention as data
 * — leaning on a fabricated eddy to shape a shot is worse than having no
 * wind layer at all. Wind that varies across a hole needs measurements
 * that vary across a hole.
 *
 * What this layer therefore claims, exactly: "the prevailing wind over
 * this course is blowing this way, this hard." Nothing about any
 * particular tree gap.
 *
 * ── METEOROLOGICAL CONVENTION ────────────────────────────────────────
 * `windFromDeg` is the compass bearing the wind blows FROM — 0 means a
 * north wind, which travels SOUTHWARD. The streaks must therefore move
 * toward `fromDeg + 180`. Getting this backwards is the classic error in
 * every wind visualisation, it is invisible on a symmetric course, and
 * it would reverse every headwind call the app makes.
 */

const DEG = Math.PI / 180;
const M_PER_DEG_LAT = 111320;

/** Spacing between adjacent streak lines, in metres. */
export const STREAK_SPACING_M = 22;

/** Cap on generated lines, so a zoomed-out view cannot flood the map. */
export const MAX_STREAKS = 140;

/** Slack beyond the view's diagonal — see windFieldGeoJSON. */
export const EXTENT_MARGIN = 1.25;

export const WIND_SOURCE = 'truarc-wind-field';
export const WIND_LAYER = 'truarc-wind-streaks';

/** Below this the air is not doing anything a player should plan around. */
export const CALM_MPS = 0.5;

const mPerDegLng = (lat) => M_PER_DEG_LAT * Math.cos(lat * DEG);

/**
 * Parallel lines spanning `bounds`, running along the wind.
 *
 * Long lines rather than many short segments: the streak pattern comes
 * from `line-dasharray` at render time, so the geometry stays cheap and
 * the animation is a paint property rather than a source rewrite.
 *
 * @param {{west,south,east,north}} bounds
 * @param {number} fromDeg   compass bearing the wind blows FROM
 */
export function windFieldGeoJSON(bounds, fromDeg, { spacingM = STREAK_SPACING_M } = {}) {
    const empty = { type: 'FeatureCollection', features: [] };
    if (!bounds || !Number.isFinite(fromDeg)) return empty;

    const { west, south, east, north } = bounds;
    if (![west, south, east, north].every(Number.isFinite)) return empty;

    const centerLat = (south + north) / 2;
    const centerLng = (west + east) / 2;
    const mLng = mPerDegLng(centerLat);
    if (!(mLng > 0)) return empty;

    // Half-diagonal, so the field covers the view at any rotation, plus
    // margin. Sizing to the diagonal exactly leaves streaks ending on
    // the corner pixels, and a pitched 3-D camera sees ground beyond
    // what `getBounds()` reports — the far edge would go bare as soon as
    // the player tilts, which is most of the time.
    const halfW = (Math.abs(east - west) / 2) * mLng;
    const halfH = (Math.abs(north - south) / 2) * M_PER_DEG_LAT;
    const extent = Math.hypot(halfW, halfH) * EXTENT_MARGIN;
    if (!(extent > 0)) return empty;

    // Downwind: where the air is going, not where it came from.
    const flowRad = (fromDeg + 180) * DEG;
    const ax = Math.sin(flowRad);   // east component
    const ay = Math.cos(flowRad);   // north component
    const px = -ay;                 // perpendicular, for spacing lines out
    const py = ax;

    const spacing = Math.max(1, spacingM);
    const half = Math.min(Math.floor(extent / spacing), Math.floor(MAX_STREAKS / 2));

    const toLngLat = (xM, yM) => [
        centerLng + xM / mLng,
        centerLat + yM / M_PER_DEG_LAT,
    ];

    const features = [];
    for (let i = -half; i <= half; i++) {
        const offset = i * spacing;
        const ox = px * offset;
        const oy = py * offset;
        features.push({
            type: 'Feature',
            properties: {},
            geometry: {
                type: 'LineString',
                coordinates: [
                    toLngLat(ox - ax * extent, oy - ay * extent),
                    toLngLat(ox + ax * extent, oy + ay * extent),
                ],
            },
        });
    }

    return { type: 'FeatureCollection', features };
}

/**
 * Dash patterns cycled to make the streaks travel.
 *
 * Mapbox cannot tween `line-dasharray`, so motion comes from stepping
 * through pre-built patterns whose gap shifts along the line. Cheap: one
 * paint property per step rather than rewriting the source.
 */
export const DASH_SEQUENCE = Object.freeze(
    Array.from({ length: 8 }, (_, i) => {
        const shift = i / 8;
        return [0, shift * 4, 2.2, (1 - shift) * 4];
    }),
);

/**
 * Frames per second for the dash cycle, scaled by wind speed so a stiff
 * breeze visibly moves faster than a light one.
 *
 * Capped at both ends on purpose. Too slow reads as a static hatch
 * pattern rather than wind; too fast strobes and stops reading as
 * direction at all. The mapping is illustrative — it conveys "more" or
 * "less", and no player should read a speed off the animation rate when
 * the exact number is printed in the wind panel.
 */
export function dashStepsPerSecond(speedMps) {
    if (!Number.isFinite(speedMps) || speedMps <= CALM_MPS) return 0;
    return Math.max(3, Math.min(18, speedMps * 1.8));
}

/**
 * Streak opacity and width, so strength reads before you look at a
 * number. Also bounded: even a gale stays a hint over the imagery
 * rather than obscuring the fairway a player came here to see.
 */
export function streakPaint(speedMps) {
    const s = Number.isFinite(speedMps) ? Math.max(0, speedMps) : 0;
    const t = Math.min(1, s / 12);
    return {
        opacity: 0.18 + t * 0.34,
        width: 1.1 + t * 1.3,
    };
}

export function windSourceSpec(bounds, fromDeg, opts) {
    return { type: 'geojson', data: windFieldGeoJSON(bounds, fromDeg, opts) };
}

/**
 * `slot: 'middle'` on Standard styles keeps streaks above the imagery
 * and hillshade but below labels; classic styles get an explicit
 * beforeId from the caller. Same split as terrainLayers.js.
 */
export function windLayerSpec({ slots = true, speedMps = 0 } = {}) {
    const paint = streakPaint(speedMps);
    return {
        id: WIND_LAYER,
        type: 'line',
        source: WIND_SOURCE,
        ...(slots ? { slot: 'middle' } : {}),
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
            'line-color': '#9fd8ff',
            'line-width': paint.width,
            'line-opacity': paint.opacity,
            'line-dasharray': DASH_SEQUENCE[0],
        },
    };
}

/**
 * Should the layer draw at all?
 *
 * No observation means UNKNOWN, not calm — drawing a still field would
 * assert something we were never told. Genuine calm is also not drawn,
 * because motionless streaks look like a broken animation rather than
 * like still air, and the wind panel already says "Calm" in words.
 */
export function shouldShowWind(observed) {
    return !!observed && Number.isFinite(observed.windSpeedMps) && observed.windSpeedMps > CALM_MPS;
}
