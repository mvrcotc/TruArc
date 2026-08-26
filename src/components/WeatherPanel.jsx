/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  WeatherPanel — the wind that is actually blowing                ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Lives in the LEFT rail with the course/hole context, because wind is
 * a property of the PLACE, not of the disc in your hand — it applies to
 * every throw on the hole regardless of what you pull out of the bag.
 * It used to sit inside the throw panel on the right, which implied it
 * was part of a particular throw's setup.
 *
 * ── THE SLIDERS ARE GONE, AND THAT IS THE POINT ──────────────────────
 * This panel used to let a player dial in a hypothetical wind and watch
 * a simulated flight respond. With flight simulation hidden
 * (src/features.js — the engine clears 4 of 23 ground-truth envelopes),
 * those sliders moved a number that reached nothing: a control that
 * looks live and does nothing is worse than no control, because it
 * teaches a player that the app's readouts are decorative.
 *
 * What remains is measurement. The observation is the live reading for
 * this course's coordinates, shown with its source and timestamp so it
 * cannot be mistaken for a default, and "on this hole" is pure geometry
 * — the observed compass bearing resolved against the hole's own
 * bearing. Neither needs the simulator, and both are things a player
 * standing on the tee actually wants.
 *
 * The sliders come back with the simulator, not before.
 *
 * ── DIRECTION IS COMPASS, NOT THROW-RELATIVE ─────────────────────────
 * The slider and rose are in meteorological degrees — the bearing the
 * wind blows FROM, 0 = north — which is what the weather service
 * reports and what a player reads off a forecast. The engine wants the
 * direction relative to the throw, and that rotation happens once at
 * the engine boundary (`throwerProfile.buildWindSpec`). The panel also
 * shows how it will actually PLAY on the active hole ("Headwind",
 * "Crosswind from left"), since a compass bearing alone doesn't answer
 * the question a player is really asking.
 *
 * ── ⚠ THE LIVE FETCH IS UNVERIFIED HERE ──────────────────────────────
 * This environment's egress blocks api.open-meteo.com, so the network
 * path has never actually run — see src/utils/weather.js. The panel is
 * built so that failure is a normal state: no observation simply means
 * the manual controls stand alone, never a fabricated calm.
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Wind, RefreshCw, CloudOff, ChevronDown } from 'lucide-react';
import { compassLabel, describeRelativeWind, relativeWindDirection, ADVICE_MIN_MPS } from '../utils/weather';

export default function WeatherPanel({
    observed,
    observedState,      // 'idle' | 'loading' | 'ok' | 'unavailable'
    onRefresh,
    holeBearingDeg,
    expanded,
    onToggle,
}) {
    // Everything below reads from the OBSERVATION. There is no manual
    // wind any more, so there is also no "are we still on the observed
    // value" question to answer.
    const speedMps = observed?.windSpeedMps ?? 0;
    const fromDeg = observed?.windFromDeg ?? 0;

    // How the wind actually plays on the hole being looked at. Only
    // meaningful once we know which way the hole faces — a compass
    // bearing on its own can't say "headwind". This is geometry, not
    // simulation: it survives the simulator being switched off.
    const relative = observed && Number.isFinite(holeBearingDeg)
        ? relativeWindDirection(fromDeg, holeBearingDeg)
        : null;
    const playsAs = relative === null ? null : describeRelativeWind(relative, speedMps);

    return (
        <div className="glass-panel w-[320px] p-3.5">
            <button
                onClick={onToggle}
                className="flex items-center gap-2 w-full group"
                aria-expanded={expanded}
            >
                <Wind size={14} className="text-truarc-accent" />
                <span className="cad-text group-hover:text-truarc-text transition-colors duration-150">
                    Wind
                </span>
                {/* Collapsed summary — the panel is useful without opening it */}
                <span className="font-mono text-micro text-truarc-muted tabular-nums ml-auto mr-1">
                    {!observed ? '—' : speedMps > 0
                        ? `${speedMps.toFixed(1)} m/s ${compassLabel(fromDeg)}`
                        : 'Calm'}
                </span>
                <ChevronDown
                    size={12}
                    className={`text-truarc-muted/60 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
                />
            </button>

            <AnimatePresence>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: 'easeOut' }}
                        className="overflow-hidden"
                    >
                        <div className="pt-3 flex flex-col gap-3">
                            <ObservedRow
                                observed={observed}
                                state={observedState}
                                onRefresh={onRefresh}
                            />

                            {/* How it plays, given the hole's direction */}
                            {playsAs && speedMps >= ADVICE_MIN_MPS && (
                                <div className="flex items-center justify-between rounded-lg bg-white/[0.03] px-2.5 py-1.5">
                                    <span className="cad-label">On this hole</span>
                                    <span className="text-body font-medium text-truarc-text">{playsAs}</span>
                                </div>
                            )}

                            {observed && (
                                <WindRose
                                    fromDeg={fromDeg}
                                    holeBearingDeg={holeBearingDeg}
                                    speed={speedMps}
                                />
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// ─── OBSERVED CONDITIONS ─────────────────────────────────────────────

function ObservedRow({ observed, state, onRefresh }) {
    if (state === 'loading') {
        return (
            <div className="flex items-center gap-2 text-truarc-muted/70">
                <RefreshCw size={12} className="animate-spin" />
                <span className="text-body">Checking conditions…</span>
            </div>
        );
    }

    // No observation is its own state — NOT a silent fall back to calm.
    if (!observed) {
        return (
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-truarc-muted/60 min-w-0">
                    <CloudOff size={12} className="shrink-0" />
                    <span className="text-body truncate">
                        {state === 'unavailable' ? 'Live weather unavailable' : 'No course selected'}
                    </span>
                </div>
                {state === 'unavailable' && onRefresh && (
                    <button
                        onClick={onRefresh}
                        className="text-micro font-medium px-2 py-1 rounded-md text-truarc-accent hover:bg-truarc-accent/[0.1] transition-colors shrink-0"
                    >
                        Retry
                    </button>
                )}
            </div>
        );
    }

    return (
        <div className="rounded-lg bg-white/[0.03] px-2.5 py-2">
            <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="cad-label">Observed now</span>
                <div className="flex items-center gap-1 shrink-0">
                    <button
                        onClick={onRefresh}
                        title="Refresh"
                        className="p-1 rounded-md text-truarc-muted/60 hover:text-truarc-text hover:bg-white/[0.05] transition-colors"
                    >
                        <RefreshCw size={11} />
                    </button>
                </div>
            </div>

            <div className="flex items-baseline gap-3 flex-wrap">
                <span className="font-mono text-value font-semibold text-truarc-text tabular-nums">
                    {observed.windSpeedMps.toFixed(1)}
                    <span className="text-micro font-normal text-truarc-muted/70 ml-0.5">m/s</span>
                </span>
                <span className="font-mono text-body text-truarc-muted tabular-nums">
                    {compassLabel(observed.windFromDeg)} {Math.round(observed.windFromDeg)}°
                </span>
                {observed.gustMps != null && observed.gustMps > observed.windSpeedMps && (
                    <span className="text-micro text-truarc-muted/60 tabular-nums">
                        gusts {observed.gustMps.toFixed(1)}
                    </span>
                )}
            </div>

            <div className="text-micro text-truarc-muted/40 mt-1">
                Open-Meteo{observed.observedAt ? ` · ${observed.observedAt.replace('T', ' ')}` : ''}
            </div>
        </div>
    );
}

function WindRose({ fromDeg, holeBearingDeg, speed }) {
    const R = 30;
    const C = 40;
    const rad = (d) => ((d - 90) * Math.PI) / 180;
    // The arrow shows where the wind is GOING (from + 180), because an
    // arrow pointing at you reads as "coming from there" only after a
    // beat of thought.
    const toDeg = fromDeg + 180;

    return (
        <div className="flex items-center justify-center gap-4">
            <svg viewBox="0 0 80 80" className="w-[80px] h-[80px] shrink-0">
                <circle cx={C} cy={C} r={R} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="1" />
                {['N', 'E', 'S', 'W'].map((pt, i) => {
                    const a = rad(i * 90);
                    return (
                        <text
                            key={pt}
                            x={C + Math.cos(a) * (R + 7)}
                            y={C + Math.sin(a) * (R + 7) + 3}
                            textAnchor="middle"
                            fontSize="8"
                            fontFamily="monospace"
                            fill={pt === 'N' ? '#4cb8ff' : '#98a1b5'}
                            fillOpacity={pt === 'N' ? 0.9 : 0.5}
                        >
                            {pt}
                        </text>
                    );
                })}

                {/* Hole direction — where the throw is headed */}
                {Number.isFinite(holeBearingDeg) && (
                    <line
                        x1={C} y1={C}
                        x2={C + Math.cos(rad(holeBearingDeg)) * (R - 4)}
                        y2={C + Math.sin(rad(holeBearingDeg)) * (R - 4)}
                        stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.75"
                        strokeDasharray="3 3"
                    />
                )}

                {/* Wind, drawn only when there is any */}
                {speed > 0 && (
                    <line
                        x1={C - Math.cos(rad(toDeg)) * (R - 6)}
                        y1={C - Math.sin(rad(toDeg)) * (R - 6)}
                        x2={C + Math.cos(rad(toDeg)) * (R - 6)}
                        y2={C + Math.sin(rad(toDeg)) * (R - 6)}
                        stroke="#4cb8ff" strokeWidth="2.5" strokeLinecap="round"
                        markerEnd="url(#windhead)"
                    />
                )}
                <defs>
                    <marker id="windhead" markerWidth="5" markerHeight="5" refX="3.5" refY="2.5" orient="auto">
                        <path d="M0,0 L5,2.5 L0,5 z" fill="#4cb8ff" />
                    </marker>
                </defs>
                <circle cx={C} cy={C} r="1.5" fill="#98a1b5" />
            </svg>

            <div className="flex flex-col gap-1.5 text-micro">
                <div className="flex items-center gap-1.5">
                    <span className="w-4 h-0.5 rounded-full bg-truarc-accent shrink-0" />
                    <span className="text-truarc-muted">Wind</span>
                </div>
                {Number.isFinite(holeBearingDeg) && (
                    <div className="flex items-center gap-1.5">
                        <span className="w-4 h-0.5 rounded-full shrink-0" style={{ background: '#a78bfa' }} />
                        <span className="text-truarc-muted">Hole</span>
                    </div>
                )}
            </div>
        </div>
    );
}
