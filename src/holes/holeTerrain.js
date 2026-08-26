/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  TruArc — Reading the ground between tee and basket              ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Everything in this file is MEASUREMENT, not simulation. It answers
 * questions about terrain that already exists — how much the ground
 * falls, where a ridge hides the pin, which way the landing zone tilts —
 * using survey elevation data and geometry. No disc is thrown, no flight
 * is modelled, and nothing here depends on src/physics.
 *
 * That separation is the point. The flight model currently clears 4 of
 * 23 ground-truth envelopes (docs/ACCURACY_ROADMAP.md), so anything
 * built on it inherits an error nobody can yet bound. These numbers
 * inherit the DEM's error instead, which is known and small.
 *
 * ── WHAT THE DATA CAN AND CANNOT SUPPORT ─────────────────────────────
 * Mapbox's terrain-dem composites SRTM (~30 m posting) with national
 * sets — USGS 3DEP at ~10 m across the US. That resolves LANDFORM: the
 * shape of a hill, a 20 ft drop, a ridge line across a fairway. It does
 * NOT resolve a 3 ft mound, a bunker lip, or how the pin itself sits.
 *
 * So every claim this module makes is about the shape of the ground,
 * never about a lie. Callers must not round these into false precision:
 * "falls about 25 ft" is supportable, "falls 25.3 ft" is not. Courses
 * worth more precision are what the LiDAR pipeline (tools/lidar_pipeline)
 * exists for.
 *
 * ── WHY THE ANALYSIS TAKES A PROFILE INSTEAD OF A MAP ────────────────
 * Sampling needs a live Mapbox GL context; reasoning about the samples
 * does not. Splitting them means every rule below is exercised against
 * hand-written profiles in tests/holes/holeTerrain.test.mjs — a ridge
 * that hides a basket can be asserted exactly, rather than hunted for on
 * a real course and eyeballed.
 */

const M_TO_FT = 3.28084;

/**
 * Eye height for the line-of-sight test. A thrower stands upright on the
 * tee pad; this is roughly eye level for an adult, and the answer is not
 * sensitive to a few inches — a ridge that hides the basket from 5'2"
 * hides it from 6'2" too, on the scale the DEM can resolve.
 */
export const EYE_HEIGHT_FT = 5.6;

/**
 * Height of the part of a basket you can actually pick out at distance:
 * the top of the chain assembly, not the rim. Standard PDGA-legal
 * targets put the chain top near 1.35 m.
 */
export const BASKET_TOP_FT = 4.4;

/**
 * Clearance required before the pin counts as visible. Sight lines that
 * graze a ridge by inches are not visible in practice — heat haze, grass,
 * and the DEM's own vertical error all exceed that — so a bare
 * intersection test would report visibility nobody experiences.
 */
export const SIGHT_CLEARANCE_FT = 3;

/** Elevation change below which a hole reads as flat to a player. */
export const FLAT_THRESHOLD_FT = 8;

/**
 * How far a mid-hole high or low point must depart from the straight
 * tee→basket trend before it is a crest or a valley rather than noise.
 */
export const FEATURE_THRESHOLD_FT = 10;

/** Half-width of the cross-slope sample, each side of the line. */
export const CROSS_SAMPLE_FT = 33;   // ~10 m — about a fairway's usable width

/**
 * @typedef {Object} HoleProfile
 * @property {number} lengthFt      tee→basket ground distance
 * @property {number} stepFt        spacing between samples
 * @property {number[]} elevFt      elevation relative to the TEE, index 0 = tee
 * @property {number[]} [leftFt]    elevation CROSS_SAMPLE_FT left of the line
 * @property {number[]} [rightFt]   elevation CROSS_SAMPLE_FT right of the line
 */

const at = (arr, i) => arr[Math.max(0, Math.min(arr.length - 1, i))];

/** Forward distance of sample `i`, clamped to the hole's length. */
function distanceAt(profile, i) {
    return Math.min(i * profile.stepFt, profile.lengthFt);
}

/**
 * Net elevation change, tee to basket. Positive = the basket is above
 * you. This is the single number most likely to change disc selection
 * and the one no existing app shows.
 */
export function elevationChangeFt(profile) {
    if (!profile?.elevFt?.length) return 0;
    return profile.elevFt.at(-1) - profile.elevFt[0];
}

/**
 * The biggest departure from the straight line joining tee and basket,
 * which is what distinguishes "steadily downhill" from "over a ridge and
 * down". A hole can be net-flat and still throw over a 30 ft crest.
 */
export function dominantFeature(profile) {
    const e = profile?.elevFt ?? [];
    if (e.length < 3) return { kind: 'none', deviationFt: 0, atFt: 0 };

    const last = e.length - 1;
    const net = e[last] - e[0];

    let best = { kind: 'none', deviationFt: 0, atFt: 0 };
    for (let i = 1; i < last; i++) {
        // Height above/below the straight tee→basket chord at this point.
        const chord = e[0] + (net * i) / last;
        const dev = e[i] - chord;
        if (Math.abs(dev) > Math.abs(best.deviationFt)) {
            best = {
                kind: dev > 0 ? 'crest' : 'valley',
                deviationFt: dev,
                atFt: distanceAt(profile, i),
            };
        }
    }

    return Math.abs(best.deviationFt) >= FEATURE_THRESHOLD_FT
        ? best
        : { kind: 'none', deviationFt: best.deviationFt, atFt: best.atFt };
}

/**
 * Can the basket be seen from the tee, and if not, from how far up?
 *
 * Walks forward and asks, from each point, whether the sight line to the
 * chain top clears every piece of ground between there and the pin. The
 * first point that clears is where the pin appears.
 *
 * This is the finding with no equivalent anywhere else: a blind hole is
 * a genuinely different problem to play, and every existing app draws it
 * identically to an open one.
 */
export function basketVisibility(profile) {
    const e = profile?.elevFt ?? [];
    if (e.length < 2) return { visibleFromTee: true, revealDistanceFt: 0, blind: false };

    const last = e.length - 1;
    const targetH = e[last] + BASKET_TOP_FT;

    for (let i = 0; i < last; i++) {
        const eyeH = e[i] + EYE_HEIGHT_FT;
        let clears = true;

        for (let j = i + 1; j < last; j++) {
            // Height of the sight line where it passes over sample j.
            const frac = (j - i) / (last - i);
            const lineH = eyeH + (targetH - eyeH) * frac;
            if (e[j] > lineH - SIGHT_CLEARANCE_FT) { clears = false; break; }
        }

        if (clears) {
            return {
                visibleFromTee: i === 0,
                revealDistanceFt: distanceAt(profile, i),
                blind: i > 0,
            };
        }
    }

    // Nothing along the hole sees the pin — it only appears at the green.
    return { visibleFromTee: false, revealDistanceFt: profile.lengthFt, blind: true };
}

/**
 * Slope of the ground at one distance down the fairway.
 *
 * `alongDeg` is positive uphill. `crossDeg` is positive when the ground
 * falls to the RIGHT, matching the app's right-positive lateral
 * convention — a disc landing there tends to run right.
 *
 * Cross-slope is only reported when the caller sampled it; a profile
 * without left/right arrays returns null rather than zero, because
 * "level" and "not measured" must not look the same.
 */
export function slopeAt(profile, distanceFt) {
    const e = profile?.elevFt ?? [];
    if (e.length < 2) return null;

    const i = Math.round(distanceFt / profile.stepFt);
    const rise = at(e, i + 1) - at(e, i - 1);
    const run = 2 * profile.stepFt;
    const alongDeg = (Math.atan2(rise, run) * 180) / Math.PI;

    let crossDeg = null;
    if (profile.leftFt && profile.rightFt) {
        // Positive = falls to the right.
        const crossRise = at(profile.leftFt, i) - at(profile.rightFt, i);
        crossDeg = (Math.atan2(crossRise, 2 * CROSS_SAMPLE_FT) * 180) / Math.PI;
    }

    return { distanceFt, alongDeg, crossDeg };
}

/**
 * Slopes at the distances a player actually lands on — quarter points
 * plus the pin. Fixed fractions rather than absolute distances so the
 * report means the same thing on a 250 ft hole and an 800 ft one.
 */
export function landingSlopes(profile, fractions = [0.5, 0.75, 1]) {
    if (!profile?.elevFt?.length) return [];
    return fractions
        .map((f) => slopeAt(profile, profile.lengthFt * f))
        .filter(Boolean);
}

/**
 * One plain sentence describing the ground.
 *
 * Deliberately unquantified where the DEM cannot support a number —
 * "falls away" rather than a decimal — and it names the FEATURE before
 * the net change, because a crest changes how a hole is played more than
 * a net drop does.
 */
export function describeProfile(profile) {
    const net = elevationChangeFt(profile);
    const feature = dominantFeature(profile);
    const round5 = (v) => Math.round(Math.abs(v) / 5) * 5;

    const netPhrase = Math.abs(net) < FLAT_THRESHOLD_FT
        ? 'plays level overall'
        : `${net > 0 ? 'climbs' : 'drops'} about ${round5(net)} ft`;

    if (feature.kind === 'crest') {
        return `Throws over a rise around ${Math.round(feature.atFt / 10) * 10} ft out, then ${netPhrase}.`;
    }
    if (feature.kind === 'valley') {
        return `Falls away through the middle and ${netPhrase} to the pin.`;
    }
    return `Ground ${netPhrase}.`;
}

/**
 * Everything the hole card shows, in one call.
 *
 * `measured: true` is carried through deliberately: this report is the
 * trustworthy half of the app, and the UI is expected to say so rather
 * than letting it sit next to simulated numbers undistinguished.
 */
export function readHole(profile) {
    if (!profile?.elevFt?.length) return null;
    return {
        measured: true,
        lengthFt: profile.lengthFt,
        elevationChangeFt: elevationChangeFt(profile),
        feature: dominantFeature(profile),
        visibility: basketVisibility(profile),
        slopes: landingSlopes(profile),
        summary: describeProfile(profile),
    };
}

/**
 * Sample the ground between two points from a live Mapbox map.
 *
 * The only part of this module that touches Mapbox, and the only part
 * that cannot be unit-tested — which is exactly why the reasoning above
 * was kept out of it.
 *
 * `exaggerated: false` is NOT optional: queryTerrainElevation defaults
 * to returning elevation with the style's terrain exaggeration applied,
 * so a cosmetic display setting would otherwise scale every number here.
 * See the same note in src/physics/terrainProfile.js.
 */
export function sampleHoleProfile(map, tee, basket, { stepFt = 15, cross = true } = {}) {
    if (!map || !tee || !basket) return null;

    const lengthFt = groundDistanceFt(tee, basket);
    if (!(lengthFt > 0)) return null;

    const count = Math.max(2, Math.ceil(lengthFt / stepFt) + 1);
    const elevFt = new Array(count);
    const leftFt = cross ? new Array(count) : null;
    const rightFt = cross ? new Array(count) : null;

    const sample = (lng, lat, fallback) => {
        try {
            const m = map.queryTerrainElevation?.([lng, lat], { exaggerated: false });
            return m == null ? fallback : m * M_TO_FT;
        } catch {
            return fallback;
        }
    };

    const bearing = bearingDeg(tee, basket);
    const teeElev = sample(tee.lng, tee.lat, 0);

    for (let i = 0; i < count; i++) {
        const f = Math.min(1, (i * stepFt) / lengthFt);
        const p = interpolate(tee, basket, f);
        elevFt[i] = sample(p.lng, p.lat, teeElev) - teeElev;

        if (cross) {
            const l = offsetPoint(p, bearing - 90, CROSS_SAMPLE_FT);
            const r = offsetPoint(p, bearing + 90, CROSS_SAMPLE_FT);
            leftFt[i] = sample(l.lng, l.lat, teeElev) - teeElev;
            rightFt[i] = sample(r.lng, r.lat, teeElev) - teeElev;
        }
    }

    return { lengthFt, stepFt, elevFt, leftFt, rightFt };
}

// ─── GEOMETRY ────────────────────────────────────────────────────
// Small enough distances that a spherical approximation is far below the
// DEM's own error; no need for a geodesic library.

const DEG = Math.PI / 180;
const FT_PER_DEG_LAT = 364000;

const ftPerDegLng = (lat) => FT_PER_DEG_LAT * Math.cos(lat * DEG);

export function groundDistanceFt(a, b) {
    const dLat = (b.lat - a.lat) * FT_PER_DEG_LAT;
    const dLng = (b.lng - a.lng) * ftPerDegLng((a.lat + b.lat) / 2);
    return Math.hypot(dLat, dLng);
}

export function bearingDeg(a, b) {
    const dLat = (b.lat - a.lat) * FT_PER_DEG_LAT;
    const dLng = (b.lng - a.lng) * ftPerDegLng((a.lat + b.lat) / 2);
    return (Math.atan2(dLng, dLat) * 180) / Math.PI;
}

function interpolate(a, b, f) {
    return { lng: a.lng + (b.lng - a.lng) * f, lat: a.lat + (b.lat - a.lat) * f };
}

function offsetPoint(p, bearing, distFt) {
    const rad = bearing * DEG;
    return {
        lat: p.lat + (distFt * Math.cos(rad)) / FT_PER_DEG_LAT,
        lng: p.lng + (distFt * Math.sin(rad)) / ftPerDegLng(p.lat),
    };
}
