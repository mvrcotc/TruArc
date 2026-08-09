/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  DiscProfileSection — "What does this disc do naturally?"        ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * A readout of the SELECTED disc: its published flight numbers, its
 * stability, and a top-down chart of the flight it produces on a
 * reference throw — plus a side-on height strip, because "gets there
 * flat" and "gets there on a floaty hyzer" are different shots and the
 * top-down view cannot tell them apart.
 *
 * Content-only (no glass-panel wrapper, no fixed width) — embedded
 * directly inside ThrowPanel.jsx's unified right-hand bar, below the
 * bag/throw-settings/flight-results it shares that panel with, rather
 * than floating as its own separate card.
 *
 * All the physics lives in src/physics/discProfile.js (pure, no React,
 * fully tested in tests/physics/discProfile.test.mjs). This component
 * only memoizes that call and draws SVG, so there is no simulation
 * behaviour here to test separately.
 *
 * ── THE REFERENCE THROW IS NOT THE USER'S THROW ──────────────────────
 * The chart is deliberately pinned to flat / full-power / no-wind so it
 * stays a property of the DISC and remains comparable across discs. It
 * must therefore never look like a preview of the current sliders — the
 * footer says so in as many words. The live throw's own results render
 * just above this section (ThrowPanel's FlightResultsSection).
 *
 * ── THE CHART IS ANISOTROPIC, AND SAYS SO ────────────────────────────
 * A 350 ft drive with 45 ft of lateral movement cannot be drawn to scale
 * in a narrow rail. Lateral is stretched relative to downrange, the same
 * way every published flight chart does it. The axis captions carry the
 * true distances in feet so the numbers stay exact even though the
 * drawing is not to scale. The SVGs scale via viewBox + width:100%, so
 * they fill whatever column width they're given without distortion —
 * CHART_W/HEIGHT_W below only set the internal aspect ratio.
 *
 * NOT visually verified in a browser — this environment's egress policy
 * blocks api.mapbox.com, so the app shell renders but the map behind it
 * does not (same standing gap as Sections 3/4/5).
 */

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Disc3, TrendingUp, Ruler, Mountain } from 'lucide-react';
import {
    computeDiscProfile, projectPathToChart, projectPathToHeightChart, toPolylinePoints,
} from '../physics/discProfile';

const TYPE_COLORS = {
    'Distance Driver': '#ff7a90',
    'Fairway Driver': '#f5a65b',
    'Midrange': '#4cb8ff',
    'Putter': '#34d399',
};

const CHART_W = 212;
const CHART_H = 232;          // plot area only
const CHART_CAPTION_H = 15;   // caption strip BELOW the plot
const HEIGHT_W = 212;
const HEIGHT_H = 54;

export function DiscProfileSection({ disc }) {
    // One ~6-7 ms simulation, recomputed only when the disc identity
    // changes — not on every settings-slider frame, since the reference
    // throw deliberately ignores the sliders.
    const profile = useMemo(() => {
        if (!disc) return null;
        try {
            return computeDiscProfile(disc);
        } catch {
            // A disc with malformed numbers should cost the panel, not
            // the app. Rendering nothing is honest; a fabricated curve
            // would not be.
            return null;
        }
    }, [disc?.name, disc?.brand, disc?.speed, disc?.glide, disc?.turn, disc?.fade]);

    if (!disc || !profile) return null;

    const accent = TYPE_COLORS[disc.type] ?? '#4cb8ff';
    const top = projectPathToChart(profile.path, { width: CHART_W, height: CHART_H });
    const side = projectPathToHeightChart(profile.path, { width: HEIGHT_W, height: HEIGHT_H });
    const landing = top.points[top.points.length - 1];

    const lateralSpanFt = top.lateralSpanM * 3.28084;
    const finishFt = profile.lateralFinishFt;
    const finishSide = Math.abs(finishFt) < 3 ? 'straight' : finishFt < 0 ? 'left' : 'right';

    return (
        <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        >
            {/* Header: disc identity + stability */}
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
            <div className="grid grid-cols-4 gap-1 mb-2.5">
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
                every reference throw starts at bottom-centre by construction. */}
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
                        neither disc's real flight. */}
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
                    <text x={8} y={CHART_H + 10} fill="#98a1b5" fillOpacity="0.6" fontSize="9" fontFamily="monospace">
                        ←{lateralSpanFt.toFixed(0)}ft
                    </text>
                    <text x={CHART_W / 2} y={CHART_H + 10} fill="#98a1b5" fillOpacity="0.6" fontSize="9" fontFamily="monospace" textAnchor="middle">
                        TEE
                    </text>
                    <text x={CHART_W - 8} y={CHART_H + 10} fill="#98a1b5" fillOpacity="0.6" fontSize="9" fontFamily="monospace" textAnchor="end">
                        {lateralSpanFt.toFixed(0)}ft→
                    </text>
                </svg>
            </div>

            {/* Side-on height strip */}
            <div className="relative mt-2 rounded-xl bg-black/25 border border-white/[0.05] overflow-hidden">
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

            {/* Derived numbers from the simulated reference flight */}
            <div className="grid grid-cols-3 gap-2 mt-2.5">
                <MiniStat icon={<Ruler size={11} />} label="Distance" value={`${profile.distanceFt.toFixed(0)}`} unit="ft" color="#4cb8ff" />
                <MiniStat icon={<Mountain size={11} />} label="Apex" value={`${profile.apexFt.toFixed(0)}`} unit="ft" color="#f5a65b" />
                <MiniStat
                    icon={<TrendingUp size={11} />}
                    label="Finish"
                    value={finishSide === 'straight' ? '≈0' : `${Math.abs(finishFt).toFixed(0)}`}
                    unit={finishSide === 'straight' ? '' : finishSide === 'left' ? 'ft L' : 'ft R'}
                    color={profile.stability.color}
                />
            </div>

            <p className="text-micro text-truarc-muted/45 leading-relaxed mt-2.5">
                Reference throw — flat, full power, no wind. Independent of your
                current throw settings. Chart is stretched sideways to fit; the
                figures are exact.
            </p>
        </motion.div>
    );
}

function FlightNumber({ label, value, signed }) {
    const shown = signed && value > 0 ? `+${value}` : `${value}`;
    return (
        <div className="rounded-lg bg-white/[0.03] py-1.5 text-center">
            <div className="font-mono text-sm font-semibold text-truarc-text tabular-nums leading-none">
                {shown}
            </div>
            <div className="text-micro text-truarc-muted/60 mt-1">
                {label}
            </div>
        </div>
    );
}

function MiniStat({ icon, label, value, unit, color }) {
    return (
        <div>
            <div className="flex items-center gap-1 mb-1">
                <span style={{ color }} className="opacity-70">{icon}</span>
                <span className="cad-label">{label}</span>
            </div>
            <div className="font-mono text-value font-semibold tabular-nums" style={{ color }}>
                {value}<span className="text-micro font-normal text-truarc-muted/70 ml-0.5">{unit}</span>
            </div>
        </div>
    );
}
