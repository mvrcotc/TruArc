/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  TerrainPanel — making the ground readable                       ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Lives in the LEFT rail beside Wind, for the same reason: relief is a
 * property of the PLACE. It is not part of a throw's setup, and it
 * applies to every disc in the bag.
 *
 * ── WHY THESE THREE CONTROLS ─────────────────────────────────────────
 * Satellite imagery hides terrain — it carries its own flat, near-vertical
 * lighting, and a fairway is a big low-contrast green area. See
 * src/map/terrainLayers.js for the full reasoning. The controls map one
 * to one onto the three cues that bring it back:
 *
 *   RELIEF SHADING  consistent DEM-derived light → shape becomes visible
 *   CONTOURS        elevation as a labelled number, in feet
 *   EXAGGERATION    amplifies the mesh when the relief is genuinely
 *                   subtle, which on a golf course it usually is
 *
 * ── EXAGGERATION SAYS WHAT IT IS ─────────────────────────────────────
 * The panel states in words that exaggeration is display-only. That is a
 * promise the code has to keep, and it only became true when every
 * `queryTerrainElevation` call started passing `{ exaggerated: false }` —
 * before that the setting was silently scaling the slopes the flight
 * engine integrated. A control that quietly changes simulated results
 * while claiming to be cosmetic is worse than no control.
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mountain, ChevronDown } from 'lucide-react';
import { DEFAULT_TERRAIN } from '../map/terrainLayers';

const SLIDER_FILL = 'rgba(76, 184, 255, 0.9)';
const SLIDER_TRACK = 'rgba(255, 255, 255, 0.08)';

export default function TerrainPanel({ terrain, onUpdate, expanded, onToggle }) {
    const t = { ...DEFAULT_TERRAIN, ...(terrain ?? {}) };
    const set = (patch) => onUpdate({ ...t, ...patch });

    // Collapsed summary — the panel has to be useful without opening it.
    const active = [t.hillshade && 'Shading', t.contours && 'Contours'].filter(Boolean);
    const summary = active.length ? active.join(' + ') : 'Satellite only';

    return (
        <div className="glass-panel w-[320px] p-3.5">
            <button
                onClick={onToggle}
                className="flex items-center gap-2 w-full group"
                aria-expanded={expanded}
            >
                <Mountain size={14} className="text-truarc-accent" />
                <span className="cad-text group-hover:text-truarc-text transition-colors duration-150">
                    Terrain
                </span>
                <span className="font-mono text-micro text-truarc-muted tabular-nums ml-auto mr-1 truncate max-w-[150px]">
                    {summary}
                </span>
                <ChevronDown
                    size={12}
                    className={`text-truarc-muted/60 transition-transform duration-200 shrink-0 ${expanded ? 'rotate-180' : ''}`}
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
                            <Toggle
                                label="Relief shading"
                                hint="Lights the ground from a fixed north-west sun, so slopes read as slopes"
                                checked={t.hillshade}
                                onChange={(v) => set({ hillshade: v })}
                            />

                            {/* Only meaningful while the shading it scales is
                                on — showing a live slider that does nothing
                                teaches players the control is broken. */}
                            {t.hillshade && (
                                <Slider
                                    label="Shading strength"
                                    value={t.relief}
                                    onChange={(v) => set({ relief: v })}
                                    min={0.1}
                                    max={1}
                                    step={0.05}
                                    format={(v) => `${Math.round(v * 100)}%`}
                                />
                            )}

                            <Toggle
                                label="Contour lines"
                                hint="Elevation labelled in feet, every 5th line — the number behind the shading"
                                checked={t.contours}
                                onChange={(v) => set({ contours: v })}
                            />

                            <Slider
                                label="Vertical exaggeration"
                                value={t.exaggeration}
                                onChange={(v) => set({ exaggeration: v })}
                                min={1}
                                max={3}
                                step={0.1}
                                format={(v) => `${v.toFixed(1)}×`}
                            />

                            <p className="text-micro text-truarc-muted/45 leading-relaxed">
                                Exaggeration affects the picture only. Measured
                                distances and simulated flights always use the
                                real elevation.
                            </p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

function Toggle({ label, hint, checked, onChange }) {
    return (
        <button
            onClick={() => onChange(!checked)}
            className="flex items-start gap-2.5 w-full text-left group"
            role="switch"
            aria-checked={checked}
        >
            <span
                className={`mt-0.5 w-8 h-[18px] rounded-full shrink-0 transition-colors duration-150 relative ${checked ? 'bg-truarc-accent/70' : 'bg-white/[0.10]'
                    }`}
            >
                <span
                    className={`absolute top-[3px] w-3 h-3 rounded-full bg-white transition-transform duration-150 ${checked ? 'translate-x-[17px]' : 'translate-x-[3px]'
                        }`}
                />
            </span>
            <span className="min-w-0">
                <span className="block text-body text-truarc-text leading-tight">{label}</span>
                <span className="block text-micro text-truarc-muted/50 leading-tight mt-0.5">{hint}</span>
            </span>
        </button>
    );
}

function Slider({ label, value, onChange, min, max, step, format }) {
    const pct = ((value - min) / (max - min)) * 100;
    return (
        <div>
            <div className="flex justify-between items-baseline mb-1.5">
                <span className="cad-label">{label}</span>
                <span className="font-mono text-xs text-truarc-text tabular-nums">{format(value)}</span>
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
