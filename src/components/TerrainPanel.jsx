/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  Map panel — base map type, and making the ground readable       ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Lives in the LEFT rail beside Wind, for the same reason: how the
 * ground is drawn is a property of the PLACE. It is not part of a
 * throw's setup, and it applies to every disc in the bag.
 *
 * Two levels, in the order you'd reach for them:
 *
 *   MAP TYPE   Which base map — Satellite / Terrain / Default. Replaces
 *              the whole style, exactly like Google's picker.
 *   OVERLAYS   Shading and contours, drawn on top of whichever base.
 *
 * ── OVERLAYS ADD CUES, THEY DON'T DISTORT ────────────────────────────
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
import { Map as MapIcon, Satellite, Mountain, Layers, ChevronDown } from 'lucide-react';
import { DEFAULT_TERRAIN } from '../map/terrainLayers';
import { MAP_TYPES, MAP_TYPE_ORDER, DEFAULT_MAP_TYPE } from '../map/mapStyles';

const TYPE_ICON = { satellite: Satellite, terrain: Mountain };

export default function TerrainPanel({ terrain, onUpdate, mapType, onMapTypeChange, expanded, onToggle }) {
    const t = { ...DEFAULT_TERRAIN, ...(terrain ?? {}) };
    const set = (patch) => onUpdate({ ...t, ...patch });
    const type = MAP_TYPES[mapType] ?? MAP_TYPES[DEFAULT_MAP_TYPE];

    // Collapsed summary — the panel has to be useful without opening it.
    // Base map first, then whatever is layered over it, because the base
    // is the bigger change and the one you're most likely checking.
    const overlays = [t.hillshade && 'Shading', t.contours && 'Contours', t.wind && 'Wind'].filter(Boolean);
    const summary = [type.label, ...overlays].join(' · ');

    return (
        <div className="glass-panel w-[320px] p-3.5">
            <button
                onClick={onToggle}
                className="flex items-center gap-2 w-full group"
                aria-expanded={expanded}
            >
                <Layers size={14} className="text-truarc-accent" />
                <span className="cad-text group-hover:text-truarc-text transition-colors duration-150">
                    Map
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
                            {/* Base map. A 2-up row rather than a dropdown:
                                seeing both options is what tells you the choice exists. */}
                            <div>
                                <span className="cad-label">Map type</span>
                                <div className="grid grid-cols-2 gap-1.5 mt-1.5" role="radiogroup" aria-label="Map type">
                                    {MAP_TYPE_ORDER.map((id) => (
                                        <MapTypeTile
                                            key={id}
                                            def={MAP_TYPES[id]}
                                            selected={type.id === id}
                                            onSelect={() => onMapTypeChange(id)}
                                        />
                                    ))}
                                </div>
                                <p className="text-micro text-truarc-muted/50 leading-tight mt-1.5">
                                    {type.hint}
                                </p>
                            </div>

                            <div className="h-px bg-white/[0.06]" />

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

                            <Toggle
                                label="Wind"
                                hint="Live streaks showing which way it's blowing, and how hard"
                                checked={t.wind}
                                onChange={(v) => set({ wind: v })}
                            />

                            <p className="text-micro text-truarc-muted/45 leading-relaxed">
                                Terrain is drawn at true scale. These layers
                                change how the ground is lit and labelled,
                                never its shape — what you see is the slope
                                you'll throw.
                            </p>

                            <p className="text-micro text-truarc-muted/45 leading-relaxed">
                                Wind streaks show the one reading taken for this
                                course, so they run parallel everywhere. Real
                                air speeds up through gaps and stalls behind
                                trees — that isn't drawn, because nothing
                                measured it.
                            </p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

function MapTypeTile({ def, selected, onSelect }) {
    const Icon = TYPE_ICON[def.id] ?? MapIcon;
    return (
        <button
            onClick={onSelect}
            role="radio"
            aria-checked={selected}
            title={def.hint}
            className={`flex flex-col items-center gap-1 py-2 rounded-md border transition-colors duration-150 ${selected
                ? 'bg-truarc-accent/[0.14] border-truarc-accent/45 text-truarc-accent'
                : 'bg-white/[0.03] border-white/[0.07] text-truarc-muted hover:bg-white/[0.06] hover:text-truarc-text'
                }`}
        >
            <Icon size={16} />
            <span className="text-micro leading-none">{def.label}</span>
        </button>
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
