/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  TerrainPanel — making the ground readable                       ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Lives in the LEFT rail beside Wind, for the same reason: relief is a
 * property of the PLACE. It is not part of a throw's setup, and it
 * applies to every disc in the bag.
 *
 * ── TWO TOGGLES, AND NOTHING THAT DISTORTS ───────────────────────────
 * Satellite imagery hides terrain — it carries its own flat, near-vertical
 * lighting, and a fairway is a big low-contrast green area. See
 * src/map/terrainLayers.js for the full reasoning. Two cues bring it back:
 *
 *   RELIEF SHADING  consistent DEM-derived light → shape becomes visible
 *   CONTOURS        elevation as a labelled number, in feet
 *
 * Both are READ-OUTS of the real ground. Neither changes its geometry,
 * and the panel offers no control that does, because this app is used to
 * pick real lines at real holes: a slope that looks steeper than it plays
 * is worse than no slope drawn at all.
 *
 * An earlier revision of this panel shipped a vertical-exaggeration
 * slider. It was a mistake worth naming — the map had long rendered at
 * 2× "for visual drama", and exposing that as a control dressed up a
 * rendering lie as a feature. The honest fix was the opposite one: put
 * the ground back at 1.0 and add the shading that made the drama
 * unnecessary in the first place.
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mountain, ChevronDown } from 'lucide-react';
import { DEFAULT_TERRAIN } from '../map/terrainLayers';

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

                            <Toggle
                                label="Contour lines"
                                hint="Elevation labelled in feet, every 5th line — the number behind the shading"
                                checked={t.contours}
                                onChange={(v) => set({ contours: v })}
                            />

                            <p className="text-micro text-truarc-muted/45 leading-relaxed">
                                Terrain is drawn at true scale. These layers
                                change how the ground is lit and labelled,
                                never its shape — what you see is the slope
                                you'll throw.
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
