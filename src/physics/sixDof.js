/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  TruArc — 6-DOF Disc Flight Engine (Section 1)                  ║
 * ║  Rigid-body flight with gyroscopic precession.                  ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Replaces the pseudo-force model in src/utils/flightPhysics.js, where
 * turn and fade were injected as hand-tuned lateral accelerations. Here
 * they EMERGE: an aerodynamic pitching moment precesses a spinning disc
 * into bank, and bank tilts the lift vector sideways.
 *
 * ════════════════════════════════════════════════════════════════════
 *  WHY THIS PRODUCES TURN AND FADE  (read before touching any sign)
 * ════════════════════════════════════════════════════════════════════
 * The pitching-moment coefficient Cm varies with angle of attack α and
 * crosses zero at a trim angle α_trim that is a property of the mold:
 *
 *   α < α_trim  →  nose-DOWN moment →  precesses into RIGHT bank →  TURN
 *   α > α_trim  →  nose-UP moment   →  precesses into LEFT bank  →  FADE
 *
 * (The nose-up-when-slow half is the familiar sight of a disc standing
 * up and stalling at the end of its flight.)
 *
 * A disc in flight must generate lift ≈ its weight. Lift ∝ V²·CL(α), so
 * a FAST disc needs a LOW α and a SLOW disc needs a HIGH α. Everything
 * the ground-truth suite asks for then falls out of one mechanism:
 *
 *   • S-curve: fast at release (α low → turn), slows down (α rises →
 *     fade). No scripting, no phases.
 *   • Slow arm on a high-speed disc: α is above trim for the WHOLE
 *     flight, so it only ever fades — the beginner meat-hook.
 *   • Headwind: raises airspeed → lowers α → MORE turn.
 *   • Tailwind: lowers airspeed → raises α → earlier, harder fade.
 *
 * The old engine could not express any of this, because its turn/fade
 * terms were functions of a speed *ratio* rather than of the disc's
 * actual aerodynamic state. That is why every fix broke another case.
 *
 * ════════════════════════════════════════════════════════════════════
 *  FRAMES AND SIGNS  (derived, verified, and load-bearing)
 * ════════════════════════════════════════════════════════════════════
 * INTERNAL inertial frame N is right-handed:
 *      N.x = forward (down the aim line)
 *      N.y = LEFT
 *      N.z = UP
 * (forward × left = up ✓ right-handed. Gravity is (0,0,-g).)
 *
 * OUTPUT frame matches tests/ground-truth/flight-envelopes.mjs and the
 * existing renderer: x = RIGHT, y = UP, z = FORWARD. Converted once, at
 * the boundary, in `toOutputFrame()`. Never mix the two.
 *
 * n̂ = the disc's TOP normal (unit vector, in N).
 * s = spin rate about n̂, signed. A right-hand backhand spins CLOCKWISE
 *     seen from above, whose angular-momentum vector points DOWN, i.e.
 *     ALONG −n̂ — so **s < 0 for RHBH**. (Also LHFH. RHFH/LHBH give
 *     s > 0, and the physics then mirrors turn/fade automatically,
 *     which is why forehand and left-handed players come for free.)
 *
 * Angle of attack:  α = asin(−v̂_air · n̂)
 *     Flat disc descending → air hits the underside → α > 0 ✓
 *
 * Moment axes (all unit, all derived from n̂ and v̂_air):
 *     ŷ_aero = normalize(n̂ × v̂_air)   pitch axis; points LEFT-ish.
 *              A POSITIVE moment about it pitches the nose DOWN.
 *     x̂_aero = normalize(ŷ_aero × n̂)  in-plane axis; points FORWARD-ish.
 *              A POSITIVE moment about it rolls the disc RIGHT.
 *     n̂                                 spin axis (spin-down moment).
 *
 * BANK ↔ NORMAL (get this backwards and every sign below inverts — it
 * is the one step that is easy to "reason" wrong, so use the surface
 * analogy, not intuition): a disc banked RIGHT is a surface sloping
 * down to the right, and such a surface's normal tilts RIGHT. Formally,
 * a positive rotation about x̂ (forward) carries +ŷ (left) toward +ẑ
 * (up) — lifting the left side, i.e. banking RIGHT — and carries the
 * normal toward −ŷ (right). So:
 *     bank RIGHT ⟺ n̂ tips RIGHT (n_y < 0)
 *     bank LEFT  ⟺ n̂ tips LEFT  (n_y > 0)
 *
 * PRECESSION CHECK (do this by hand before changing a sign). In the
 * fast-spin limit the transverse angular velocity is
 *     ω_t = (n̂ × M_t) / (I_a · s)
 * Take RHBH (s < 0), flat disc (n̂ = +ẑ), and α ABOVE trim, which must
 * come out as FADE. Fade is bank LEFT, i.e. dn̂/dt along +ŷ, which needs
 * ω_t along −x̂, which (dividing by the negative I_a·s) needs
 * n̂ × M_t along +x̂, which needs M_t along −ŷ (RIGHT) — and since
 * ŷ_aero points LEFT, that means **Cm < 0 above the trim angle**.
 * Hence Cm decreases with α:
 *     Cm = Cma · (α_trim − α),   Cma > 0
 * Positive Cm is nose-down, so this says the disc pitches DOWN when
 * fast (low α → turn) and UP when slow (high α → fade) ✓
 *
 * ════════════════════════════════════════════════════════════════════
 *  WHY NOT QUATERNIONS
 * ════════════════════════════════════════════════════════════════════
 * A disc is axisymmetric, so its spin PHASE is dynamically irrelevant.
 * Integrating a quaternion would force dt small enough to resolve ~1200
 * rpm (~0.05 s per revolution) — tens of thousands of steps per flight
 * for information we then throw away. Instead we integrate the state
 * that actually matters:
 *
 *     dn̂/dt   = ω_t × n̂
 *     dω_t/dt = [M_t − I_a·s·(ω_t × n̂)] / I_t      ← gyroscopic term
 *     ds/dt   = M·n̂ / I_a
 *
 * These are exact for an axisymmetric rigid body (derived by splitting
 * H = I_t·ω_t + I_a·s·n̂ and projecting dH/dt = M along and across n̂;
 * note ω_t·n̂ ≡ 0 makes the along-axis projection collapse cleanly).
 * dt = 2 ms is then plenty, and the gyroscopic term is visible on one
 * line instead of buried in a quaternion product.
 */

// ─── PHYSICAL CONSTANTS ──────────────────────────────────────────
export const AIR_DENSITY_SEA_LEVEL = 1.225; // kg/m³
const DISC_MASS = 0.175;                    // kg (175 g)
const DISC_DIAMETER = 0.211;                // m
const DISC_RADIUS = DISC_DIAMETER / 2;
const DISC_AREA = Math.PI * DISC_RADIUS ** 2;
const GRAVITY = 9.81;

// Moments of inertia for a 175 g, 21.1 cm golf disc.
//
// Two hard physical bounds pin these down — an earlier version violated
// both, and the resulting excess precession rate was what made strong
// fade incompatible with long flights (the calibrator kept pinning every
// stability parameter to its minimum to escape the resulting spiral):
//
//   1. A rim-weighted disc must have MORE axial inertia than a uniform
//      plate: I_axial > ½mR² = 9.74e-4. (All-mass-at-rim would be
//      mR² = 1.95e-3, so the physical band is 9.7e-4 … 1.9e-3;
//      measured golf drivers land around 1.0–1.2e-3.)
//   2. Perpendicular-axis theorem for a lamina: I_z = I_x + I_y, and by
//      symmetry I_x = I_y — so I_transverse is EXACTLY I_axial / 2, not
//      an independently chosen number.
const I_AXIAL = 1.10e-3;              // about the spin axis n̂
const I_TRANSVERSE = I_AXIAL / 2;     // about any in-plane axis (lamina)

const DEG = Math.PI / 180;
const RPM_TO_RAD_S = (2 * Math.PI) / 60;
const MPH_TO_MPS = 0.44704;

// ─── VECTOR HELPERS (plain [x,y,z] arrays) ───────────────────────
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
];
const norm = (a) => Math.sqrt(dot(a, a));
function unit(a) {
    const n = norm(a);
    return n > 1e-12 ? [a[0] / n, a[1] / n, a[2] / n] : [0, 0, 0];
}
/** Rodrigues rotation of `v` about unit axis `k` by `angle` radians. */
function rotateAbout(v, k, angle) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return add(
        add(scale(v, c), scale(cross(k, v), s)),
        scale(k, dot(k, v) * (1 - c)),
    );
}

// ─── AERODYNAMIC COEFFICIENTS AT A STATE ─────────────────────────

/**
 * Lift coefficient with a soft post-stall decay. Below αStall this is
 * the usual linear CL0 + CLa·α; past it, lift bleeds off rather than
 * growing without bound (an unbounded CL is what let the old engine
 * fly discs into orbit).
 */
function liftCoefficient(c, alpha) {
    const linear = c.CL0 + c.CLa * alpha;
    const over = Math.abs(alpha) - c.alphaStall;
    if (over <= 0) return linear;
    const peak = c.CL0 + c.CLa * Math.sign(alpha) * c.alphaStall;
    const decay = Math.max(0, 1 - 1.5 * (over / c.alphaStall));
    return peak * decay;
}

/** Quadratic drag polar about the minimum-drag angle α0. */
function dragCoefficient(c, alpha) {
    const d = alpha - c.alpha0;
    return c.CD0 + c.CDa * d * d;
}

// ─── DERIVATIVES ─────────────────────────────────────────────────
// State: { r, v, n, wt, s }  (position, velocity, top normal,
// transverse angular velocity, signed spin rate) — all in frame N.

function derivatives(state, coef, windVec, rho) {
    const { v, n, wt, s } = state;

    const vAir = sub(v, windVec);
    const V = norm(vAir);

    // Below a few m/s the aerodynamic frame is ill-conditioned and the
    // disc is effectively tumbling to the ground; coast on gravity.
    if (V < 1.5) {
        return {
            dr: v,
            dv: [0, 0, -GRAVITY],
            dn: cross(wt, n),
            dwt: [0, 0, 0],
            ds: 0,
        };
    }

    const vHat = scale(vAir, 1 / V);

    // α = asin(−v̂·n̂). Clamp keeps asin in domain and keeps the linear
    // moment model from extrapolating into nonsense at extreme attitudes.
    const sinAlpha = Math.max(-1, Math.min(1, -dot(vHat, n)));
    const alpha = Math.asin(sinAlpha);
    const alphaM = Math.max(-0.61, Math.min(0.61, alpha)); // ±35° for moments

    // Aerodynamic frame.
    let yAero = cross(n, vHat);
    const yMag = norm(yAero);
    if (yMag < 1e-9) {
        // Velocity parallel to the disc axis (knife-edge / dead stall):
        // no well-defined pitch axis. Let gravity act, damp nothing.
        return {
            dr: v,
            dv: [0, 0, -GRAVITY],
            dn: cross(wt, n),
            dwt: [0, 0, 0],
            ds: 0,
        };
    }
    yAero = scale(yAero, 1 / yMag);
    const xAero = unit(cross(yAero, n));

    const qbar = 0.5 * rho * V * V * DISC_AREA;

    // ── FORCES ──
    const CL = liftCoefficient(coef, alpha);
    const CD = dragCoefficient(coef, alpha);

    // Lift acts perpendicular to the airflow, in the plane spanned by
    // v̂ and n̂. Banking the disc tilts this vector sideways — that, and
    // nothing else, is what moves the disc laterally.
    const liftDir = unit(cross(cross(vHat, n), vHat));
    const fLift = scale(liftDir, qbar * CL);
    const fDrag = scale(vHat, -qbar * CD);
    const fGrav = [0, 0, -DISC_MASS * GRAVITY];

    const dv = scale(add(add(fLift, fDrag), fGrav), 1 / DISC_MASS);

    // ── MOMENTS ──
    // Non-dimensional rates (standard d/2V normalisation).
    const p = dot(wt, xAero);   // roll rate  (+ = rolling right)
    const q = dot(wt, yAero);   // pitch rate (+ = nose down)
    const rateScale = DISC_DIAMETER / (2 * V);
    const pHat = p * rateScale;
    const qHat = q * rateScale;
    const sHat = s * rateScale;

    // Pitching moment: the heart of the model. Cm > 0 pitches the nose
    // DOWN and passes through zero at α = alphaTrim. The slope is
    // NEGATIVE in α — below trim the disc noses down (→ right bank →
    // turn), above trim it noses up (→ left bank → fade). See the
    // PRECESSION CHECK in the header before altering this sign.
    const Cm = coef.Cma * (coef.alphaTrim - alphaM) + coef.Cmq * qHat;

    // Rolling moment: damping, plus the advancing-blade term. With RHBH
    // spin (s < 0) the disc's left half advances into the airflow and
    // gains lift, rolling the disc right (positive) — which precesses
    // into a nose-up drift that raises α through the flight. Clr < 0
    // encodes that. This is the second reason discs "stand up" late,
    // independent of losing speed.
    const Cr = coef.Clp * pHat + coef.Clr * sHat;

    // Spin-down.
    const Cn = coef.Cnr * sHat;

    // qbar already carries the reference area, so the moment scale is
    // just qbar·d (the diameter is the reference length).
    const momentScale = qbar * DISC_DIAMETER;
    const M = add(
        add(scale(yAero, Cm * momentScale), scale(xAero, Cr * momentScale)),
        scale(n, Cn * momentScale),
    );

    // ── ROTATIONAL DYNAMICS (axisymmetric rigid body) ──
    const Mn = dot(M, n);
    const Mt = sub(M, scale(n, Mn));

    // dω_t/dt = [M_t − I_a·s·(ω_t × n̂)] / I_t
    // The bracketed second term IS the gyroscope. Delete it and the
    // disc stops turning and fading entirely.
    const gyro = scale(cross(wt, n), I_AXIAL * s);
    const dwt = scale(sub(Mt, gyro), 1 / I_TRANSVERSE);

    return {
        dr: v,
        dv,
        dn: cross(wt, n),
        dwt,
        ds: Mn / I_AXIAL,
    };
}

// ─── INTEGRATION ─────────────────────────────────────────────────

function stepState(state, d, dt) {
    return {
        r: add(state.r, scale(d.dr, dt)),
        v: add(state.v, scale(d.dv, dt)),
        n: add(state.n, scale(d.dn, dt)),
        wt: add(state.wt, scale(d.dwt, dt)),
        s: state.s + d.ds * dt,
    };
}

/**
 * Re-impose the two geometric constraints the state must satisfy:
 * |n̂| = 1, and ω_t ⊥ n̂. RK4 drifts off both by O(dt⁴) per step and the
 * error compounds over thousands of steps; projecting each step keeps
 * the spin decomposition exact.
 */
function reproject(state) {
    const n = unit(state.n);
    const wt = sub(state.wt, scale(n, dot(state.wt, n)));
    return { ...state, n, wt };
}

function rk4(state, coef, windVec, rho, dt) {
    const k1 = derivatives(state, coef, windVec, rho);
    const k2 = derivatives(stepState(state, k1, dt / 2), coef, windVec, rho);
    const k3 = derivatives(stepState(state, k2, dt / 2), coef, windVec, rho);
    const k4 = derivatives(stepState(state, k3, dt), coef, windVec, rho);

    const blend = (a, b, c, d) => [
        (a[0] + 2 * b[0] + 2 * c[0] + d[0]) / 6,
        (a[1] + 2 * b[1] + 2 * c[1] + d[1]) / 6,
        (a[2] + 2 * b[2] + 2 * c[2] + d[2]) / 6,
    ];

    const avg = {
        dr: blend(k1.dr, k2.dr, k3.dr, k4.dr),
        dv: blend(k1.dv, k2.dv, k3.dv, k4.dv),
        dn: blend(k1.dn, k2.dn, k3.dn, k4.dn),
        dwt: blend(k1.dwt, k2.dwt, k3.dwt, k4.dwt),
        ds: (k1.ds + 2 * k2.ds + 2 * k3.ds + k4.ds) / 6,
    };

    return reproject(stepState(state, avg, dt));
}

// ─── THROW MODEL ─────────────────────────────────────────────────

/**
 * Spin sign for a throwing style. Clockwise-seen-from-above (RHBH and
 * LHFH) gives s < 0; the mirror styles give s > 0 and the whole flight
 * mirrors for free.
 */
export function spinSignFor(hand = 'RH', style = 'BH') {
    const clockwise = (hand === 'RH' && style === 'BH') || (hand === 'LH' && style === 'FH');
    return clockwise ? -1 : 1;
}

/**
 * Build the release state.
 *
 * Note on the two pitch-like inputs, which are NOT the same thing:
 *   • launchAngleDeg — how far above horizontal the disc is THROWN
 *     (the velocity vector's elevation).
 *   • noseAngleDeg   — how far the nose is pitched above the VELOCITY,
 *     i.e. the initial angle of attack, per the ground-truth spec.
 * The envelope suite only varies the second; the first is part of the
 * standard-throw definition and is a calibrated constant.
 */
function initialState(t) {
    const gamma = (t.launchAngleDeg ?? 0) * DEG;
    const alpha0 = (t.noseAngleDeg ?? 0) * DEG;
    const bank = (t.hyzerDeg ?? 0) * DEG; // negative = hyzer

    const V0 = t.releaseSpeedMps;
    const v = [V0 * Math.cos(gamma), 0, V0 * Math.sin(gamma)];
    const vHat = unit(v);

    // Normal for zero AoA at this launch elevation, then pitched back by
    // the nose angle. Both live in the x–z plane, so the pitch axis is
    // exactly ŷ = (0,1,0) and this closes to a one-liner:
    //   n̂ = (−sin(γ+α), 0, cos(γ+α))
    // Verify: −v̂·n̂ = sin(α) → angle of attack is exactly noseAngleDeg ✓
    let n = [-Math.sin(gamma + alpha0), 0, Math.cos(gamma + alpha0)];

    // Bank about the velocity axis. A POSITIVE rotation about v̂ carries
    // +ŷ (left) toward +ẑ (up) — lifting the left side, i.e. banking
    // RIGHT (anhyzer). The input convention already has anhyzer positive,
    // so the angle passes through unnegated.
    n = unit(rotateAbout(n, vHat, bank));

    return {
        r: [0, 0, t.releaseHeightM ?? 1.4],
        v,
        n,
        wt: [0, 0, 0],
        s: spinSignFor(t.hand, t.style) * (t.spinRpm ?? 1200) * RPM_TO_RAD_S,
    };
}

/**
 * Wind velocity vector in frame N.
 * `directionDeg` is the direction the wind blows FROM, measured
 * clockwise from the aim line: 0 = headwind, 180 = tailwind,
 * 90 = from the right (so the air moves toward +y = LEFT).
 */
function windVector(wind) {
    const speed = wind?.speedMps ?? 0;
    if (speed === 0) return [0, 0, 0];
    const d = (wind.directionDeg ?? 0) * DEG;
    return [-speed * Math.cos(d), speed * Math.sin(d), 0];
}

// ─── OUTPUT ──────────────────────────────────────────────────────

/** N (x fwd, y left, z up) → output (x right, y up, z forward). */
function toOutputFrame(r) {
    return { x: -r[1], y: r[2], z: r[0] };
}

// ─── PUBLIC API ──────────────────────────────────────────────────

/**
 * Simulate one throw.
 *
 * @param {Object}   disc      { speed, glide, turn, fade } — or pass
 *                             `coefficients` directly to bypass mapping.
 * @param {Object}   throwSpec { releaseSpeedMps, spinRpm, noseAngleDeg,
 *                               hyzerDeg, launchAngleDeg, releaseHeightM,
 *                               hand, style }
 * @param {Object}   wind      { speedMps, directionDeg }
 * @param {Function} getGroundElev (xRight, zForward) => ground height (m).
 *                               Same contract as the old engine, so the
 *                               terrain callback carries over unchanged.
 * @param {Object}   options   { dt, maxTime, sampleEvery, coefficients,
 *                               airDensity }
 *
 * @returns {{points, landingIndex, maxHeight, totalDistance, flightTimeS,
 *            diagnostics}} points are in the OUTPUT frame.
 */
export function simulateFlight(disc, throwSpec, wind = {}, getGroundElev = null, options = {}) {
    const {
        dt = 0.002,
        maxTime = 15,
        sampleEvery = 5,
        airDensity = AIR_DENSITY_SEA_LEVEL,
    } = options;

    const coef = options.coefficients
        ?? disc?.coefficients
        ?? (() => { throw new Error('simulateFlight: no coefficients supplied (pass options.coefficients from discCoefficients.js)'); })();

    const windVec = windVector(wind);
    let state = initialState(throwSpec);

    const groundAt = (r) => {
        if (!getGroundElev) return 0;
        const o = toOutputFrame(r);
        return getGroundElev(o.x, o.z) || 0;
    };

    const points = [toOutputFrame(state.r)];
    let maxHeight = state.r[2];
    let landingIndex = -1;
    let t = 0;
    let step = 0;

    // Optional per-sample physics trace. Off by default (it allocates);
    // invaluable when a mapping change moves a flight the wrong way and
    // you need to see α cross the trim angle to know why.
    const trace = options.trace ? [] : null;
    const recordTrace = (st, time) => {
        const vAir = sub(st.v, windVec);
        const V = norm(vAir);
        if (V < 1e-6) return;
        const vHat = scale(vAir, 1 / V);
        const alpha = Math.asin(Math.max(-1, Math.min(1, -dot(vHat, st.n))));
        // Banked RIGHT means the normal tips RIGHT (−y), so negate.
        const bankRight = -Math.atan2(st.n[1], st.n[2]);
        trace.push({
            t: time,
            V,
            alphaDeg: alpha / DEG,
            bankRightDeg: bankRight / DEG,
            Cm: coef.Cma * (coef.alphaTrim - Math.max(-0.61, Math.min(0.61, alpha))),
            spinRpm: Math.abs(st.s) / RPM_TO_RAD_S,
        });
    };
    if (trace) recordTrace(state, 0);

    while (t < maxTime) {
        const prev = state;
        state = rk4(state, coef, windVec, airDensity, dt);
        t += dt;
        step++;

        if (!Number.isFinite(state.r[0]) || !Number.isFinite(state.r[2])) {
            // Numerical blow-up: stop cleanly rather than emitting NaN.
            break;
        }

        const ground = groundAt(state.r);
        if (state.r[2] <= ground && t > 0.15) {
            // Linear interpolation to the ground crossing so landing
            // position doesn't quantise to the sample interval.
            const prevGround = groundAt(prev.r);
            const dPrev = prev.r[2] - prevGround;
            const dNow = state.r[2] - ground;
            const f = dPrev !== dNow ? dPrev / (dPrev - dNow) : 1;
            const landR = add(prev.r, scale(sub(state.r, prev.r), f));
            points.push(toOutputFrame(landR));
            landingIndex = points.length - 1;
            break;
        }

        if (step % sampleEvery === 0) {
            points.push(toOutputFrame(state.r));
            if (state.r[2] > maxHeight) maxHeight = state.r[2];
            if (trace) recordTrace(state, t);
        }
    }

    if (landingIndex < 0) landingIndex = points.length - 1;

    const land = points[landingIndex];
    const totalDistance = Math.hypot(land.x, land.z);

    return {
        points,
        landingIndex,
        maxHeight,
        totalDistance,
        flightTimeS: t,
        trace,
        diagnostics: { finalSpinRpm: Math.abs(state.s) / RPM_TO_RAD_S },
    };
}

/** Convenience: release speed in mph → m/s. */
export const mphToMps = (mph) => mph * MPH_TO_MPS;

export const __internals = { derivatives, initialState, windVector, toOutputFrame, rotateAbout };
