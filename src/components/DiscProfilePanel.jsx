/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  Disc flight profile — chart, and the detail beneath it          ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Three exports, deliberately split so ThrowPanel can PIN the important
 * half and let the rest scroll:
 *
 *   useDiscProfile(disc, throwSettings, wind)
 *       Runs the simulation once and memoizes it. Both sections below
 *       take the resulting `profile`, so rendering them together costs
 *       one simulation, not two.
 *   DiscProfileChart  — disc identity, flight numbers, the top-down
 *       flight chart, and the headline figures. This is what must stay
 *       on screen while the throw sliders are dragged, so ThrowPanel
 *       renders it in a non-scrolling region.
 *   DiscProfileDetail — the side-on height strip and the explanatory
 *       note. Genuinely useful, but secondary: it scrolls.
 *
 * ── IT TRACKS THE PLAYER'S SETTINGS, AND SAYS WHICH IT IS ────────────
 * The chart simulates whatever the throw settings and wind actually
 * say, so dragging a slider redraws the flight — that is the whole
 * point of it sitting against those sliders. It used to be pinned to a
 * fixed reference throw (flat, full power, no wind).
 *
 * The two readings are different CLAIMS and must never be conflated:
 * the reference throw describes the DISC (comparable across discs,
 * which is what the stability label is derived from), while the live
 * one describes THIS THROW. `profile.isReferenceThrow` says which is on
 * screen and DiscProfileDetail states it in words.
 *
 * Aim angle is excluded on purpose — see `throwSpecFieldsFromUI` in
 * discProfile.js. It rotates the whole flight rather than reshaping it,
 * and the chart's vertical axis IS the aim line.
 *
 * ── THE CHART IS ANISOTROPIC, AND SAYS SO ────────────────────────────
 * A 350 ft drive with 45 ft of lateral movement cannot be drawn to
 * scale in a narrow rail. Lateral is stretched relative to downrange,
 * the same way every published flight chart does it; the axis captions
 * carry the true distances so the numbers stay exact.
 *
 * ── AND IT MUST FIT BESIDE THE SLIDERS ───────────────────────────────
 * The SVGs render at `width:100%`, so a viewBox narrower than the
 * column is magnified and the chart grows taller in proportion. Sizing
 * the viewBox to the real column width (CHART_DIMS in discProfile.js)
 * keeps rendered height equal to declared height, which is what lets
 * the pinned region hold both the chart and four sliders at once.
 */

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, Ruler, Mountain } from 'lucide-react';
import {
    computeDiscProfile, projectPathToChart, projectPathToHeightChart, toPolylinePoints,
    CHART_DIMS,
} from '../physics/discProfile';

const TYPE_COLORS = {
    'Distance Driver': '#ff7a90',
    'Fairway Driver': '#f5a65b',
    'Midrange': '#4cb8ff',
    'Putter': '#34d399',
};

// Geometry lives in discProfile.js so tests assert against the shipped
// values — see CHART_DIMS there for why w must equal the column width.
const CHART_W = CHART_DIMS.w;
const CHART_H = CHART_DIMS.h;
const CHART_CAPTION_H = CHART_DIMS.captionH;
const HEIGHT_W = CHART_DIMS.heightW;
const HEIGHT_H = CHART_DIMS.heightH;

// Interactive fidelity: the chart re-simulates on every slider frame,
// so it runs coarser than the app's production throw — measured
// 4.73 ms → 2.19 ms per call. Legitimate only because the integrator
// converges; `tests/physics/discProfile.test.mjs` asserts the coarse and
// fine settings agree to within a foot so this can't silently degrade.
const INTERACTIVE_SIM = { dt: 0.004, sampleEvery: 10 };

/**
 * One simulation per (disc × throw × wind), shared by both sections.
 * Depends on primitives rather than the objects so an unrelated
 * re-render that rebuilds an identical settings object doesn't pay for
 * a fresh simulation.
 */
export function useDiscProfile(disc, throwSettings, wind) {
    return useMemo(() => {
        if (!disc) return null;
        try {
            return computeDiscProfile(disc, {
                throwSettings: throwSettings ?? undefined,
                wind: wind ?? undefined,
                simOptions: INTERACTIVE_SIM,
            });
        } catch {
            // A disc with malformed numbers should cost the panel, not
            // the app. Rendering nothing is honest; a fabricated curve
            // would not be.
            return null;
        }
    }, [
        disc?.name, disc?.brand, disc?.speed, disc?.glide, disc?.turn, disc?.fade,
        throwSettings?.power, throwSettings?.releaseAngle, throwSettings?.noseAngle,
        wind?.speed, wind?.direction,
    ]);
}

// ─── PINNED: identity, numbers, flight chart, headline figures ───────

export function DiscProfileChart({ disc, profile }) {
    if (!disc || !profile) return null;

    const accent = TYPE_COLORS[disc.type] ?? '#4cb8ff';
    const top = projectPathToChart(profile.path, { width: CHART_W, height: CHART_H });
    const landing = top.points[top.points.length - 1];

    const lateralSpanFt = top.lateralSpanM * 3.28084;
    const finishFt = profile.lateralFinishFt;
    const finishSide = Math.abs(finishFt) < 3 ? 'straight' : finishFt < 0 ? 'left' : 'right';

    return (
        <div>
            {/* Disc identity + stability */}
            <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: accent }} />
                        <span className="text-body font-semibold text-truarc-text truncate">{disc.name}</span>
                    </div>
                    <div className="text-micro text-truarc-muted/70 mt-0.5 truncate">
                        {disc.brand}{disc.type ? ` · ${disc.type}` : ''}
                    </div>
                </div>
                <span
                    className="text-micro font-medium px-2 py-0.5 rounded-full shrink-0 whitespace-nowrap"
                    style={{ background: `${profile.stability.color}1a`, color: profile.stability.color }}
                    title={`turn + fade = ${profile.stability.sum} (manufacturer's published numbers)`}
                >
                    {profile.stability.label}
                </span>
            </div>

            {/* Flight numbers — the manufacturer's claim */}
            <div className="grid grid-cols-4 gap-1 mb-2">
                <FlightNumber label="Speed" value={disc.speed} />
                <FlightNumber label="Glide" value={disc.glide} />
                <FlightNumber label="Turn" value={disc.turn} signed />
                <FlightNumber label="Fade" value={disc.fade} />
            </div>

            {/* Top-down flight chart.
                Captions live in a strip BELOW the plot rather than floating
                over it: the flight ends at an x that varies by disc, so any
                label inside the plot area eventually collides with the
                landing marker (an overstable driver's finish lands exactly
                on a top-corner caption). The bottom strip is always free —
                every throw starts at bottom-centre by construction. */}
            <div className="relative rounded-xl bg-black/25 border border-white/[0.05] overflow-hidden">
                <svg width="100%" viewBox={`0 0 ${CHART_W} ${CHART_H + CHART_CAPTION_H}`} className="block">
                    {/* Tee line — the straight-ahead reference the curve is read against */}
                    <line
                        x1={CHART_W / 2} y1={10} x2={CHART_W / 2} y2={CHART_H - 10}
                        stroke="rgba(255,255,255,0.14)" strokeWidth="1" strokeDasharray="3 4"
                    />
                    {/* Downrange gridlines at 25 / 50 / 75 % */}
                    {[0.25, 0.5, 0.75].map((f) => (
                        <line
                            key={f}
                            x1={10} x2={CHART_W - 10}
                            y1={CHART_H - 10 - f * (CHART_H - 20)}
                            y2={CHART_H - 10 - f * (CHART_H - 20)}
                            stroke="rgba(255,255,255,0.07)" strokeWidth="0.5"
                        />
                    ))}

                    {/* The flight itself — drawn in from the tee, keyed on
                        the disc so switching discs re-runs the draw rather
                        than snapping to a new shape. `key` is what forces
                        the remount; without it framer would tween between
                        two unrelated paths and produce a shape that is
                        neither disc's real flight. Keyed on the DISC only,
                        not the settings: a slider drag should track
                        continuously, not restart the draw on every frame. */}
                    <motion.polyline
                        key={`${disc.brand}-${disc.name}`}
                        points={toPolylinePoints(top.points)}
                        fill="none"
                        stroke={accent}
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        initial={{ pathLength: 0, opacity: 0.5 }}
                        animate={{ pathLength: 1, opacity: 1 }}
                        transition={{ duration: 0.75, ease: [0.33, 1, 0.68, 1] }}
                    />

                    {/* Release point */}
                    <circle cx={CHART_W / 2} cy={CHART_H - 10} r="2.5" fill="#98a1b5" />
                    {/* Landing — fades in as the path arrives */}
                    {landing && (
                        <motion.g
                            key={`landing-${disc.brand}-${disc.name}`}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.6, duration: 0.3 }}
                        >
                            <circle cx={landing.x} cy={landing.y} r="4.5" fill={accent} fillOpacity="0.22" />
                            <circle cx={landing.x} cy={landing.y} r="2.5" fill={accent} />
                        </motion.g>
                    )}

                    {/* Caption strip — exact numbers, since the drawing is
                        stretched sideways and not to scale. */}
                    <text x={8} y={CHART_H + 11} fill="#98a1b5" fillOpacity="0.6" fontSize="10" fontFamily="monospace">
                        ←{lateralSpanFt.toFixed(0)}ft
                    </text>
                    <text x={CHART_W / 2} y={CHART_H + 11} fill="#98a1b5" fillOpacity="0.6" fontSize="10" fontFamily="monospace" textAnchor="middle">
                        TEE
                    </text>
                    <text x={CHART_W - 8} y={CHART_H + 11} fill="#98a1b5" fillOpacity="0.6" fontSize="10" fontFamily="monospace" textAnchor="end">
                        {lateralSpanFt.toFixed(0)}ft→
                    </text>
                </svg>
            </div>

            {/* Headline figures. A GRID, not a flex row: on one line
                "Finish 111ft L" overflowed 288px and wrapped its unit
                onto a second line, on top of the value. Fixed columns
                can't wrap regardless of how large the numbers get. */}
            <div className="grid grid-cols-3 gap-2 mt-2">
                <MiniStat icon={<Ruler size={11} />} label="Dist" value={profile.distanceFt.toFixed(0)} unit="ft" color="#4cb8ff" />
                <MiniStat icon={<Mountain size={11} />} label="Apex" value={profile.apexFt.toFixed(0)} unit="ft" color="#f5a65b" />
                <MiniStat
                    icon={<TrendingUp size={11} />}
                    label="Finish"
                    value={finishSide === 'straight' ? '≈0' : Math.abs(finishFt).toFixed(0)}
                    unit={finishSide === 'straight' ? '' : finishSide === 'left' ? 'ft L' : 'ft R'}
                    color={profile.stability.color}
                />
            </div>
        </div>
    );
}

// ─── SCROLLS: side-on height, and what the chart is claiming ─────────

export function DiscProfileDetail({ disc, profile }) {
    if (!disc || !profile) return null;

    const accent = TYPE_COLORS[disc.type] ?? '#4cb8ff';
    const side = projectPathToHeightChart(profile.path, { width: HEIGHT_W, height: HEIGHT_H });

    return (
        <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        >
            {/* Side-on height strip — "gets there flat" vs "gets there on
                a floaty hyzer" are different shots the top-down view
                cannot tell apart. */}
            <div className="relative rounded-xl bg-black/25 border border-white/[0.05] overflow-hidden">
                <svg width="100%" viewBox={`0 0 ${HEIGHT_W} ${HEIGHT_H}`} className="block">
                    <line
                        x1={10} y1={HEIGHT_H - 6} x2={HEIGHT_W - 10} y2={HEIGHT_H - 6}
                        stroke="rgba(255,255,255,0.10)" strokeWidth="1"
                    />
                    <polyline
                        points={toPolylinePoints(side.points)}
                        fill="none"
                        stroke={accent}
                        strokeOpacity="0.75"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                    />
                </svg>
                {/* BOTTOM-left. Top-left seemed safe — "the disc is
                    released low" — but that is only true relative to a
                    tall apex. The strip scales to each disc's own apex, so
                    a flat midrange (apex ~3 m, release 1.4 m) starts near
                    half height and climbs straight through the top-left.
                    Release height / apex is bounded by 1.4 / max(apex, 3),
                    i.e. never above ~47 %, so the bottom-left corner is the
                    one the curve provably cannot reach. */}
                <div className="absolute bottom-0.5 left-2 pointer-events-none">
                    <span className="text-micro text-truarc-muted/45">SIDE VIEW</span>
                </div>
            </div>

            {/* Which claim is on screen. These are different statements —
                one about the disc, one about this throw — and the panel
                must never let them blur together. */}
            <p className="text-micro text-truarc-muted/45 leading-relaxed mt-2">
                {profile.isReferenceThrow
                    ? 'Reference throw — flat, full power, no wind. The disc\'s own character, comparable across discs.'
                    : 'Your current throw settings and wind. Aim angle is excluded — it rotates the flight rather than reshaping it.'}
                {' '}Chart is stretched sideways to fit; the figures are exact.
            </p>
        </motion.div>
    );
}

function FlightNumber({ label, value, signed }) {
    const shown = signed && value > 0 ? `+${value}` : `${value}`;
    return (
        <div className="rounded-lg bg-white/[0.03] py-1 text-center">
            <div className="font-mono text-sm font-semibold text-truarc-text tabular-nums leading-none">
                {shown}
            </div>
            <div className="text-micro text-truarc-muted/60 mt-0.5">
                {label}
            </div>
        </div>
    );
}

function MiniStat({ icon, label, value, unit, color }) {
    return (
        <div className="min-w-0">
            <div className="flex items-center gap-1">
                <span style={{ color }} className="opacity-70 shrink-0">{icon}</span>
                <span className="cad-label truncate">{label}</span>
            </div>
            <div className="font-mono text-body font-semibold tabular-nums whitespace-nowrap leading-tight" style={{ color }}>
                {value}<span className="text-micro font-normal text-truarc-muted/70 ml-0.5">{unit}</span>
            </div>
        </div>
    );
}
