/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  TruArc — Disc Flight Physics Engine                           ║
 * ║  3D Bezier trajectory with real disc golf flight numbers        ║
 * ║  Supports: Speed, Glide, Turn, Fade, Wind, Hyzer/Anhyzer       ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Flight Model:
 *   Based on Hummel & Hubbard (2002) aerodynamic research and the
 *   Innova Flight Rating System. Uses a 3D cubic Bezier curve
 *   shaped by disc characteristics, wind, and release angle.
 *
 * Coordinate System:
 *   - All inputs/outputs in WGS84 (EPSG:4326) coordinates
 *   - Internal calculations use meters for physics
 *   - Elevation in meters above sea level
 */

// ─── CONSTANTS ───────────────────────────────────────────────
const AIR_DENSITY = 1.225; // kg/m³ at sea level
const DISC_MASS = 0.175;   // 175g standard weight
const DISC_DIAMETER = 0.211; // meters
const DISC_AREA = Math.PI * (DISC_DIAMETER / 2) ** 2;
const GRAVITY = 9.81;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

// Meters per degree at equator (for local projections)
const METERS_PER_DEG_LAT = 111320;
const metersPerDegLng = (lat) => METERS_PER_DEG_LAT * Math.cos(lat * DEG_TO_RAD);

// ─── FLIGHT NUMBER COEFFICIENTS ──────────────────────────────
// Maps flight numbers → aerodynamic behavior

/**
 * Lift coefficient derived from Speed & Glide ratings.
 * Higher glide = more lift; higher speed = optimized at higher velocity.
 */
function liftCoefficient(disc, angleOfAttack) {
    // Disc golf lift coefficient
    // Lowered so discs glide instead of accelerating into the sky like a helicopter.
    const baseCl = 0.11 + disc.glide * 0.02;
    const aoaEffect = angleOfAttack * 0.015;
    return Math.max(0, baseCl + aoaEffect);
}

/**
 * Drag coefficient. Higher speed discs have less drag.
 */
function dragCoefficient(disc, angleOfAttack) {
    const baseCd = 0.06 - disc.speed * 0.0025;
    const aoaDrag = Math.abs(angleOfAttack) * 0.015;
    return Math.max(0.015, baseCd + aoaDrag);
}

/**
 * Convert disc speed rating → initial velocity in m/s.
 * Pro arm ≈ 35 m/s (speed 14), average ≈ 22 m/s (speed 9).
 */
function speedToVelocity(speedRating, powerPercent = 80) {
    const maxV = 20 + speedRating * 1.5; // ~41 m/s for speed 14
    return maxV * (powerPercent / 100);
}

// ─── RUNGE-KUTTA 4TH ORDER INTEGRATOR ───────────────────────

/**
 * Physics state vector
 */
function createState(x, y, z, vx, vy, vz, roll, spin, t) {
    return { x, y, z, vx, vy, vz, roll, spin, t };
}

/**
 * Compute derivatives (acceleration) for a given state
 */
function derivatives(state, disc, wind) {
    const { vx, vy, vz, roll, spin } = state;

    // Relative velocity (subtract wind)
    const vrx = vx - (wind.vx || 0);
    const vry = vy; // wind is horizontal only
    const vrz = vz - (wind.vz || 0);
    const relSpeed = Math.sqrt(vrx * vrx + vry * vry + vrz * vrz);

    if (relSpeed < 0.5) {
        return { dvx: 0, dvy: -GRAVITY, dvz: 0, droll: 0, dspin: 0 };
    }

    const horizontalSpeed = Math.sqrt(vrx * vrx + vrz * vrz);
    const flightPathAngleDeg = horizontalSpeed > 0 ? Math.atan2(vry, horizontalSpeed) * RAD_TO_DEG : 0;
    
    // In our simplified model without a physical pitch integrator, we'll assume the disc maintains
    // a slight constant nose-up pitch relative to the ground typical of most throws (e.g., 2 degrees).
    const assumedPitchDeg = 2.0; 
    
    // Angle of Attack = Pitch - Flight Path.
    // If it flies UP (flight path > 0), wind hits the TOP of the disc, so AoA is smaller or negative.
    // If it falls DOWN (flight path < 0), wind hits the BOTTOM, so AoA is larger.
    const aoa = assumedPitchDeg - flightPathAngleDeg;
    
    // Roll is stored in radians. Convert to degrees for effect mapping, but use directly in cos/sin.
    const rollDeg = roll * RAD_TO_DEG;
    const effectiveAoA = aoa + Math.abs(rollDeg) * 0.1; 

    // Aerodynamic forces
    const q = 0.5 * AIR_DENSITY * relSpeed * relSpeed * DISC_AREA;
    const cl = liftCoefficient(disc, effectiveAoA);
    const cd = dragCoefficient(disc, effectiveAoA);
    const liftForce = q * cl;
    const dragForce = q * cd;

    const flightPathAngle = horizontalSpeed > 0 ? Math.atan2(vry, horizontalSpeed) : 0;
    const liftCos = Math.cos(flightPathAngle);
    
    // Roll is in radians. Do NOT use DEG_TO_RAD on it.
    const liftY = (liftForce / DISC_MASS) * Math.cos(roll) * liftCos;
    const liftLateral = (liftForce / DISC_MASS) * Math.sin(roll) * 0.5 * liftCos;

    // Drag opposes motion
    const dragAx = -(dragForce / DISC_MASS) * (vrx / relSpeed);
    const dragAy = -(dragForce / DISC_MASS) * (vry / relSpeed);
    const dragAz = -(dragForce / DISC_MASS) * (vrz / relSpeed);

    // Turn effect (negative = turn right for RHBH)
    const speedFraction = relSpeed / speedToVelocity(disc.speed, 100); 
    const turnEffect = disc.turn * 0.4 * speedFraction * (spin / 1000);

    // Fade effect (positive = fade left for RHBH)
    const fadeFraction = Math.max(0, 1 - speedFraction);
    const fadeEffect = disc.fade * 0.6 * fadeFraction * Math.max(0.3, spin / 1000);

    // Combined lateral force (turn + fade) → applied perpendicular to forward motion
    const lateralForce = -(turnEffect + fadeEffect);

    // Heading direction
    const heading = Math.atan2(vrx, vrz);
    const latX = lateralForce * Math.cos(heading);
    const latZ = -lateralForce * Math.sin(heading);

    // Roll dynamics: prevent extreme barrel rolls!
    // A max bank of ~45-60 deg (0.8 - 1.0 rad) is realistic.
    const rollFromTurn = disc.turn * 0.15 * speedFraction;
    const rollFromFade = -disc.fade * 0.15 * fadeFraction;
    const rollDamping = -roll * 1.5; 
    const droll = rollFromTurn + rollFromFade + rollDamping;

    // Spin decay
    const dspin = -spin * 0.15;

    return {
        dvx: dragAx + liftLateral + latX,
        dvy: dragAy + liftY - GRAVITY,
        dvz: dragAz + latZ,
        droll,
        dspin,
    };
}

/**
 * Single RK4 physics step
 */
function rk4Step(state, disc, wind, dt) {
    const s = state;

    const k1 = derivatives(s, disc, wind);
    const s2 = {
        ...s,
        vx: s.vx + k1.dvx * dt / 2, vy: s.vy + k1.dvy * dt / 2, vz: s.vz + k1.dvz * dt / 2,
        roll: s.roll + k1.droll * dt / 2, spin: s.spin + k1.dspin * dt / 2,
    };
    const k2 = derivatives(s2, disc, wind);
    const s3 = {
        ...s,
        vx: s.vx + k2.dvx * dt / 2, vy: s.vy + k2.dvy * dt / 2, vz: s.vz + k2.dvz * dt / 2,
        roll: s.roll + k2.droll * dt / 2, spin: s.spin + k2.dspin * dt / 2,
    };
    const k3 = derivatives(s3, disc, wind);
    const s4 = {
        ...s,
        vx: s.vx + k3.dvx * dt, vy: s.vy + k3.dvy * dt, vz: s.vz + k3.dvz * dt,
        roll: s.roll + k3.droll * dt, spin: s.spin + k3.dspin * dt,
    };
    const k4 = derivatives(s4, disc, wind);

    return createState(
        s.x + (s.vx) * dt,
        s.y + (s.vy) * dt,
        s.z + (s.vz) * dt,
        s.vx + (k1.dvx + 2 * k2.dvx + 2 * k3.dvx + k4.dvx) * dt / 6,
        s.vy + (k1.dvy + 2 * k2.dvy + 2 * k3.dvy + k4.dvy) * dt / 6,
        s.vz + (k1.dvz + 2 * k2.dvz + 2 * k3.dvz + k4.dvz) * dt / 6,
        s.roll + (k1.droll + 2 * k2.droll + 2 * k3.droll + k4.droll) * dt / 6,
        s.spin + (k1.dspin + 2 * k2.dspin + 2 * k3.dspin + k4.dspin) * dt / 6,
        s.t + dt,
    );
}

// ─── PUBLIC API ──────────────────────────────────────────────

/**
 * Simulate disc flight and return an array of 3D points in local meter-coordinates.
 *
 * @param {Object} disc         - { speed, glide, turn, fade, name? }
 * @param {Object} throwParams  - { power (0-100), aimAngle (deg from north CW),
 *                                  releaseAngle (hyzer neg, anhyzer pos), noseAngle (deg) }
 * @param {Object} wind         - { speed (m/s), direction (deg, where wind comes FROM) }
 * @param {Function} getGroundElev - (x, z) => elevation in meters (optional)
 *
 * @returns {{ points: {x,y,z}[], landingIndex: number, maxHeight: number, totalDistance: number }}
 */
export function simulateDiscFlight(disc, throwParams, wind = { speed: 0, direction: 0 }, getGroundElev = null) {
    const {
        power = 80,
        aimAngle = 0,
        releaseAngle = 0,  // Hyzer(-) / Anhyzer(+)
        noseAngle = 12,
    } = throwParams;

    // Initial velocity
    const v0 = speedToVelocity(disc.speed, power);
    const aimRad = aimAngle * DEG_TO_RAD;
    const noseRad = noseAngle * DEG_TO_RAD;

    const vHorizontal = v0 * Math.cos(noseRad);
    const vx = vHorizontal * Math.sin(aimRad);
    const vy = v0 * Math.sin(noseRad);
    const vz = vHorizontal * Math.cos(aimRad);

    // Wind vector
    const windRad = wind.direction * DEG_TO_RAD;
    const windVec = {
        vx: -wind.speed * Math.sin(windRad),
        vz: -wind.speed * Math.cos(windRad),
    };

    // Initial spin rate (higher speed discs need more spin)
    const initialSpin = 800 + disc.speed * 60;

    let state = createState(0, 2, 0, vx, vy, vz, releaseAngle, initialSpin, 0);
    const dt = 0.01; // 10ms steps
    const maxTime = 12; // seconds
    const sampleEvery = 3; // save every 3rd step for smoother curve

    const points = [{ x: state.x, y: state.y, z: state.z }];
    let maxHeight = state.y;
    let landingIndex = -1;
    let stepCount = 0;

    while (state.t < maxTime) {
        state = rk4Step(state, disc, windVec, dt);
        stepCount++;

        // Ground collision check
        const groundY = getGroundElev ? getGroundElev(state.x, state.z) : 0;
        if (state.y <= groundY && state.t > 0.3) {
            // Interpolate landing point
            const prev = points[points.length - 1];
            const t_frac = (groundY - prev.y) / (state.y - prev.y);
            const landX = prev.x + (state.x - prev.x) * t_frac;
            const landZ = prev.z + (state.z - prev.z) * t_frac;
            points.push({ x: landX, y: groundY, z: landZ });
            landingIndex = points.length - 1;
            break;
        }

        if (stepCount % sampleEvery === 0) {
            points.push({ x: state.x, y: state.y, z: state.z });
            maxHeight = Math.max(maxHeight, state.y);
        }
    }

    if (landingIndex < 0) landingIndex = points.length - 1;

    const landing = points[landingIndex];
    const totalDistance = Math.sqrt(landing.x ** 2 + landing.z ** 2);

    return { points, landingIndex, maxHeight, totalDistance };
}

/**
 * Convert local (x,z) meter-space → WGS84 lng,lat. Used for terrain sampling.
 * @param {number} x - meters from origin (local frame)
 * @param {number} z - meters from origin (local frame)
 * @param {Object} origin - { lng, lat }
 * @param {number} bearingDeg - throw direction (0 = north, CW)
 * @returns {{ lng: number, lat: number }}
 */
export function localToLngLat(x, z, origin, bearingDeg = 0) {
    const mPerDegLng = metersPerDegLng(origin.lat);
    const bearingRad = bearingDeg * DEG_TO_RAD;
    const rx = x * Math.cos(bearingRad) + z * Math.sin(bearingRad);
    const rz = -x * Math.sin(bearingRad) + z * Math.cos(bearingRad);
    return {
        lng: origin.lng + rx / mPerDegLng,
        lat: origin.lat + rz / METERS_PER_DEG_LAT,
    };
}

/**
 * Convert local meter-space trajectory points → WGS84 coordinates.
 *
 * @param {Array} points        - [{x, y, z}] in meters from origin
 * @param {Object} origin       - { lng, lat, elevation } in WGS84
 * @param {number} bearingDeg   - The direction the throw is aimed (0 = north, CW)
 * @returns {Array} [{lng, lat, altitude}]
 */
export function trajectoryToWGS84(points, origin, bearingDeg = 0) {
    const mPerDegLng = metersPerDegLng(origin.lat);
    const bearingRad = bearingDeg * DEG_TO_RAD;

    return points.map((p) => {
        // Geographic rotation: bearing 0 = North, 90 = East
        // In our physics engine, +Z is forward, +X is right lateral drift.
        // North: rx = p.x, rz = p.z
        // East: rx = p.z, rz = -p.x
        const rx = p.x * Math.cos(bearingRad) + p.z * Math.sin(bearingRad);
        const rz = -p.x * Math.sin(bearingRad) + p.z * Math.cos(bearingRad);

        return {
            lng: origin.lng + rx / mPerDegLng,
            lat: origin.lat + rz / METERS_PER_DEG_LAT,
            altitude: (origin.elevation || 0) + p.y,
        };
    });
}

/**
 * Calculate simple 3D distance (in feet) between two WGS84 points.
 *
 * @param {Object} a - { lng, lat, elevation }
 * @param {Object} b - { lng, lat, elevation }
 * @returns {{ distanceFt: number, elevChangeFt: number, distanceM: number, elevChangeM: number }}
 */
export function measure3DDistance(a, b) {
    const avgLat = (a.lat + b.lat) / 2;
    const dx = (b.lng - a.lng) * metersPerDegLng(avgLat);
    const dy = (b.lat - a.lat) * METERS_PER_DEG_LAT;
    const dz = (b.elevation || 0) - (a.elevation || 0);

    const horizontalDist = Math.sqrt(dx * dx + dy * dy);
    const totalDist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    return {
        distanceM: totalDist,
        distanceFt: totalDist * 3.28084,
        elevChangeM: dz,
        elevChangeFt: dz * 3.28084,
        horizontalM: horizontalDist,
        horizontalFt: horizontalDist * 3.28084,
        bearingDeg: Math.atan2(dx, dy) * RAD_TO_DEG,
    };
}

/**
 * Generates a smooth 3D Bezier curve from flight simulation points.
 * Useful for rendering in Three.js or as GeoJSON.
 *
 * @param {Array} rawPoints - [{x,y,z}] from simulateDiscFlight
 * @param {number} segments - Number of output segments (default 100)
 * @returns {Array} Smooth [{x,y,z}] points
 */
export function smoothBezierCurve(rawPoints, segments = 100) {
    if (rawPoints.length < 2) return rawPoints;

    // Use Catmull-Rom to generate smooth interpolation
    const result = [];
    for (let i = 0; i < segments; i++) {
        const t = i / (segments - 1);
        const idx = t * (rawPoints.length - 1);
        const i0 = Math.max(0, Math.floor(idx) - 1);
        const i1 = Math.floor(idx);
        const i2 = Math.min(rawPoints.length - 1, i1 + 1);
        const i3 = Math.min(rawPoints.length - 1, i2 + 1);
        const frac = idx - Math.floor(idx);

        const p0 = rawPoints[i0];
        const p1 = rawPoints[i1];
        const p2 = rawPoints[i2];
        const p3 = rawPoints[i3];

        // Catmull-Rom interpolation
        const tt = frac;
        const tt2 = tt * tt;
        const tt3 = tt2 * tt;

        result.push({
            x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * tt + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * tt2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * tt3),
            y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * tt + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * tt2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * tt3),
            z: 0.5 * ((2 * p1.z) + (-p0.z + p2.z) * tt + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * tt2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * tt3),
        });
    }

    return result;
}

// ─── DISC DATABASE ───────────────────────────────────────────
import { DISC_DATABASE } from '../data/discs.js';
export { DISC_DATABASE };

/**
 * Get disc by name
 */
export function getDisc(name) {
    return DISC_DATABASE.find(d => d.name.toLowerCase() === name.toLowerCase());
}

/**
 * Get discs by type
 */
export function getDiscsByType(type) {
    return DISC_DATABASE.filter(d => d.type === type);
}
