/**
 * DiscSelector — Glassmorphism overlay for disc selection & throw settings
 */

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Disc3, ChevronDown, Wind, Gauge, RotateCcw } from 'lucide-react';
import { DISC_DATABASE } from '../utils/flightPhysics';

const DISC_TYPES = ['Distance Driver', 'Fairway Driver', 'Midrange', 'Putter'];

const TYPE_COLORS = {
    'Distance Driver': '#ff3366',
    'Fairway Driver': '#ff6b35',
    'Midrange': '#00e5ff',
    'Putter': '#00ff88',
};

export default function DiscSelector({ selectedDisc, onSelectDisc, throwSettings, onUpdateThrow, wind, onUpdateWind }) {
    const [expandedType, setExpandedType] = useState(null);
    const [showWind, setShowWind] = useState(false);

    const discsByType = useMemo(() => {
        const grouped = {};
        DISC_TYPES.forEach((t) => {
            grouped[t] = DISC_DATABASE.filter((d) => d.type === t);
        });
        return grouped;
    }, []);

    return (
        <motion.div
            initial={{ x: -320, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="glass-panel w-[300px] p-4 flex flex-col gap-3 max-h-[calc(100vh-120px)] overflow-y-auto"
        >
            {/* Header */}
            <div className="flex items-center gap-2 mb-1">
                <Disc3 size={16} className="text-truarc-accent" />
                <h2 className="cad-text text-sm">Disc Selection</h2>
            </div>

            {/* Selected Disc Display */}
            {selectedDisc && (
                <motion.div
                    layout
                    className="glass-panel-sm p-3"
                    style={{ borderColor: TYPE_COLORS[selectedDisc.type] + '40' }}
                >
                    <div className="flex justify-between items-start mb-2">
                        <div>
                            <div className="text-truarc-text font-medium text-sm">{selectedDisc.name}</div>
                            <div className="cad-label">{selectedDisc.brand} · {selectedDisc.type}</div>
                        </div>
                        <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-mono"
                            style={{ background: TYPE_COLORS[selectedDisc.type] + '15', color: TYPE_COLORS[selectedDisc.type] }}
                        >
                            {selectedDisc.speed}
                        </div>
                    </div>

                    {/* Flight Numbers */}
                    <div className="grid grid-cols-4 gap-2 mt-2">
                        {[
                            { label: 'SPD', value: selectedDisc.speed, color: '#ff3366' },
                            { label: 'GLD', value: selectedDisc.glide, color: '#ff6b35' },
                            { label: 'TRN', value: selectedDisc.turn, color: '#00e5ff' },
                            { label: 'FDE', value: selectedDisc.fade, color: '#00ff88' },
                        ].map(({ label, value, color }) => (
                            <div key={label} className="text-center">
                                <div className="cad-label">{label}</div>
                                <div className="font-mono text-sm font-bold" style={{ color }}>{value}</div>
                            </div>
                        ))}
                    </div>
                </motion.div>
            )}

            {/* Disc Categories */}
            {DISC_TYPES.map((type) => (
                <div key={type}>
                    <button
                        onClick={() => setExpandedType(expandedType === type ? null : type)}
                        className="w-full flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-truarc-card/50 transition-colors"
                    >
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full" style={{ background: TYPE_COLORS[type] }} />
                            <span className="text-xs font-medium text-truarc-text">{type}</span>
                            <span className="text-[10px] text-truarc-muted">({discsByType[type].length})</span>
                        </div>
                        <ChevronDown
                            size={14}
                            className={`text-truarc-muted transition-transform ${expandedType === type ? 'rotate-180' : ''}`}
                        />
                    </button>

                    <AnimatePresence>
                        {expandedType === type && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="overflow-hidden"
                            >
                                <div className="flex flex-col gap-0.5 py-1 pl-4">
                                    {discsByType[type].map((disc) => (
                                        <button
                                            key={disc.name}
                                            onClick={() => onSelectDisc(disc)}
                                            className={`flex items-center justify-between py-1.5 px-2 rounded text-xs transition-all ${selectedDisc?.name === disc.name
                                                    ? 'bg-truarc-accent/10 text-truarc-accent border border-truarc-accent/30'
                                                    : 'text-truarc-muted hover:text-truarc-text hover:bg-truarc-card/40'
                                                }`}
                                        >
                                            <span className="font-medium">{disc.name}</span>
                                            <span className="font-mono text-[10px] opacity-60">
                                                {disc.speed}/{disc.glide}/{disc.turn}/{disc.fade}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            ))}

            {/* Divider */}
            <div className="cad-divider" />

            {/* Throw Settings */}
            <div>
                <div className="flex items-center gap-2 mb-2">
                    <Gauge size={14} className="text-truarc-warn" />
                    <span className="cad-text text-xs">Throw Settings</span>
                </div>

                <div className="flex flex-col gap-3">
                    <SliderControl
                        label="Power"
                        value={throwSettings.power}
                        onChange={(v) => onUpdateThrow({ ...throwSettings, power: v })}
                        min={30}
                        max={100}
                        unit="%"
                        color="#ff6b35"
                    />
                    <SliderControl
                        label="Aim Angle"
                        value={throwSettings.aimAngle}
                        onChange={(v) => onUpdateThrow({ ...throwSettings, aimAngle: v })}
                        min={-45}
                        max={45}
                        unit="°"
                        color="#00e5ff"
                    />
                    <SliderControl
                        label="Release (Hyzer/Anhyzer)"
                        value={throwSettings.releaseAngle}
                        onChange={(v) => onUpdateThrow({ ...throwSettings, releaseAngle: v })}
                        min={-30}
                        max={30}
                        unit="°"
                        color="#00ff88"
                    />
                    <SliderControl
                        label="Nose Angle"
                        value={throwSettings.noseAngle}
                        onChange={(v) => onUpdateThrow({ ...throwSettings, noseAngle: v })}
                        min={0}
                        max={30}
                        unit="°"
                        color="#8892b0"
                    />
                </div>
            </div>

            {/* Wind Toggle */}
            <div className="cad-divider" />
            <button
                onClick={() => setShowWind(!showWind)}
                className="flex items-center gap-2 w-full py-1 hover:text-truarc-text transition-colors"
            >
                <Wind size={14} className="text-truarc-accent" />
                <span className="cad-text text-xs">Wind Conditions</span>
                <ChevronDown size={12} className={`ml-auto text-truarc-muted transition-transform ${showWind ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
                {showWind && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden flex flex-col gap-3"
                    >
                        <SliderControl
                            label="Wind Speed"
                            value={wind.speed}
                            onChange={(v) => onUpdateWind({ ...wind, speed: v })}
                            min={0}
                            max={15}
                            unit="m/s"
                            color="#00e5ff"
                            step={0.5}
                        />
                        <SliderControl
                            label="Wind Direction"
                            value={wind.direction}
                            onChange={(v) => onUpdateWind({ ...wind, direction: v })}
                            min={0}
                            max={360}
                            unit="°"
                            color="#00e5ff"
                            step={5}
                        />
                        <div className="text-center">
                            <WindCompass direction={wind.direction} />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

// ─── SLIDER CONTROL ─────────────────────────────────────────

function SliderControl({ label, value, onChange, min, max, unit, color, step = 1 }) {
    return (
        <div>
            <div className="flex justify-between mb-1">
                <span className="cad-label">{label}</span>
                <span className="font-mono text-xs" style={{ color }}>
                    {typeof value === 'number' ? value.toFixed(step < 1 ? 1 : 0) : value}{unit}
                </span>
            </div>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) => onChange(parseFloat(e.target.value))}
                className="w-full h-1 rounded-full appearance-none cursor-pointer"
                style={{
                    background: `linear-gradient(to right, ${color} ${((value - min) / (max - min)) * 100}%, #2a3a52 ${((value - min) / (max - min)) * 100}%)`,
                    accentColor: color,
                }}
            />
        </div>
    );
}

// ─── WIND COMPASS ───────────────────────────────────────────

function WindCompass({ direction }) {
    return (
        <div className="relative w-12 h-12 mx-auto">
            <svg viewBox="0 0 48 48" className="w-full h-full">
                <circle cx="24" cy="24" r="22" fill="none" stroke="#2a3a52" strokeWidth="1" />
                <text x="24" y="8" textAnchor="middle" fill="#8892b0" fontSize="6" fontFamily="monospace">N</text>
                <text x="42" y="26" textAnchor="middle" fill="#8892b0" fontSize="6" fontFamily="monospace">E</text>
                <text x="24" y="44" textAnchor="middle" fill="#8892b0" fontSize="6" fontFamily="monospace">S</text>
                <text x="6" y="26" textAnchor="middle" fill="#8892b0" fontSize="6" fontFamily="monospace">W</text>
                <line
                    x1="24" y1="24"
                    x2={24 + 14 * Math.sin((direction * Math.PI) / 180)}
                    y2={24 - 14 * Math.cos((direction * Math.PI) / 180)}
                    stroke="#00e5ff"
                    strokeWidth="2"
                    strokeLinecap="round"
                />
                <circle cx="24" cy="24" r="2" fill="#00e5ff" />
            </svg>
        </div>
    );
}
