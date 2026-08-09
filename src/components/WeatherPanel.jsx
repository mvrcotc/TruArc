/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  WeatherPanel — observed conditions, and the wind you simulate   ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Lives in the LEFT rail with the course/hole context, because wind is
 * a property of the PLACE, not of the disc in your hand — it applies to
 * every throw on the hole regardless of what you pull out of the bag.
 * It used to sit inside the throw panel on the right, which implied it
 * was part of a particular throw's setup.
 *
 * Two states, always distinguishable:
 *   OBSERVED — the live reading for this course's coordinates. Shown
 *              with its source and timestamp so it is never mistaken
 *              for a default.
 *   MANUAL   — the player has moved a slider. The observed reading
 *              stays on screen so they can see how far they have
 *              departed from reality, and one click restores it.
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
import { Wind, RefreshCw, CloudOff, Thermometer, ChevronDown } from 'lucide-react';
import { compassLabel, describeRelativeWind, relativeWindDirection } from '../utils/weather';

const SLIDER_FILL = 'rgba(76, 184, 255, 0.9)';
const SLIDER_TRACK = 'rgba(255, 255, 255, 0.08)';

export default function WeatherPanel({
    wind,
    onUpdateWind,
    observed,
    observedState,      // 'idle' | 'loading' | 'ok' | 'unavailable'
    onRefresh,
    onUseObserved,
    holeBearingDeg,
    expanded,
    onToggle,
}) {
    const usingObserved = !!observed
        && Math.abs((wind?.speed ?? 0) - observed.windSpeedMps) < 0.05
        && Math.abs((wind?.direction ?? 0) - observed.windFromDeg) < 0.5;

    // How the wind will actually play on the hole being looked at. Only
    // meaningful once we know which way the hole faces — a compass
    // bearing on its own can't say "headwind".
    const relative = Number.isFinite(holeBearingDeg)
        ? relativeWindDirection(wind?.direction ?? 0, holeBearingDeg)
        : null;
    const playsAs = relative === null ? null : describeRelativeWind(relative, wind?.speed ?? 0);

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
                    {(wind?.speed ?? 0) > 0
                        ? `${(wind.speed).toFixed(1)} m/s ${compassLabel(wind.direction)}`
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
                                usingObserved={usingObserved}
                                onRefresh={onRefresh}
                                onUseObserved={onUseObserved}
                            />

                            {/* How it plays, given the hole's direction */}
                            {playsAs && (
                                <div className="flex items-center justify-between rounded-lg bg-white/[0.03] px-2.5 py-1.5">
                                    <span className="cad-label">On this hole</span>
                                    <span className="text-body font-medium text-truarc-text">{playsAs}</span>
                                </div>
                            )}

                            <WindSlider
                                label="Speed"
                                value={wind?.speed ?? 0}
                                onChange={(v) => onUpdateWind({ ...wind, speed: v })}
                                min={0}
                                max={20}
                                step={0.5}
                                unit="m/s"
                            />
                            <WindSlider
                                label="From"
                                value={wind?.direction ?? 0}
                                onChange={(v) => onUpdateWind({ ...wind, direction: v })}
                                min={0}
                                max={359}
                                step={5}
                                unit={`° ${compassLabel(wind?.direction ?? 0)}`}
                            />

                            <WindRose
                                fromDeg={wind?.direction ?? 0}
                                holeBearingDeg={holeBearingDeg}
                                speed={wind?.speed ?? 0}
                            />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// ─── OBSERVED CONDITIONS ─────────────────────────────────────────────

function ObservedRow({ observed, state, usingObserved, onRefresh, onUseObserved }) {
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
                    {!usingObserved && (
                        <button
                            onClick={onUseObserved}
                            title="Set the wind back to the live reading"
                            className="text-micro font-medium px-2 py-0.5 rounded-md text-truarc-accent bg-truarc-accent/[0.08] hover:bg-truarc-accent/[0.16] active:scale-[0.97] transition-all"
                        >
                            Use
                        </button>
                    )}
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
                {observed.temperatureC != null && (
                    <span className="flex items-center gap-1 text-micro text-truarc-muted/60 tabular-nums">
                        <Thermometer size={10} />
                        {observed.temperatureC.toFixed(0)}°C
                    </span>
                )}
            </div>

            <div className="text-micro text-truarc-muted/40 mt-1">
                {usingObserved ? 'In use · ' : 'Adjusted · '}
                Open-Meteo{observed.observedAt ? ` · ${observed.observedAt.replace('T', ' ')}` : ''}
            </div>
        </div>
    );
}

// ─── CONTROLS ────────────────────────────────────────────────────────

function WindSlider({ label, value, onChange, min, max, step, unit }) {
    const pct = ((value - min) / (max - min)) * 100;
    return (
        <div>
            <div className="flex justify-between items-baseline mb-1.5">
                <span className="cad-label">{label}</span>
                <span className="font-mono text-xs text-truarc-text tabular-nums">
                    {value.toFixed(step < 1 ? 1 : 0)}
                    <span className="text-truarc-muted/60 ml-0.5">{unit}</span>
                </span>
            </div>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) => onChange(parseFloat(e.target.value))}
                className="slider-input w-full cursor-pointer"
                style={{ background: `linear-gradient(to right, ${SLIDER_FILL} ${pct}%, ${SLIDER_TRACK} ${pct}%)` }}
            />
        </div>
    );
}

/**
 * Compass rose in ABSOLUTE degrees, with the hole's own direction drawn
 * alongside the wind. Seeing both on one dial is what makes "from the
 * west" mean something: the angle between them IS the head/cross/tail
 * answer, without the player doing arithmetic.
 */
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
