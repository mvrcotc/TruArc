/**
 * DiscSelector — Glassmorphism overlay for disc selection & throw settings
 * Search to add discs to your bag, select from bag to throw.
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Disc3, ChevronDown, Wind, Gauge, Briefcase, Search, Plus, X } from 'lucide-react';
import { DISC_DATABASE } from '../utils/flightPhysics';

const DISC_TYPES = ['Distance Driver', 'Fairway Driver', 'Midrange', 'Putter'];

const TYPE_COLORS = {
    'Distance Driver': '#ff3366',
    'Fairway Driver': '#ff6b35',
    'Midrange': '#00e5ff',
    'Putter': '#00ff88',
};

export default function DiscSelector({ selectedDisc, onSelectDisc, myBag = [], onBagChange, throwSettings, onUpdateThrow, wind, onUpdateWind }) {
    const [showWind, setShowWind] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
    const searchInputRef = useRef(null);

    // Update dropdown position when search is active - use rAF to ensure layout is complete
    useEffect(() => {
        if (!searchQuery.trim()) return;
        const updatePos = () => {
            if (searchInputRef.current) {
                const rect = searchInputRef.current.getBoundingClientRect();
                setDropdownPosition({
                    top: rect.bottom + 4,
                    left: rect.left,
                    width: Math.max(rect.width, 268),
                });
            }
        };
        requestAnimationFrame(updatePos);
    }, [searchQuery]);

    const searchResults = useMemo(() => {
        if (!searchQuery.trim()) return [];
        const q = searchQuery.toLowerCase().trim();
        return DISC_DATABASE.filter(
            (d) =>
                d.name.toLowerCase().includes(q) ||
                d.brand.toLowerCase().includes(q) ||
                d.type.toLowerCase().includes(q)
        ).slice(0, 12);
    }, [searchQuery]);

    const addToBag = (e, disc) => {
        e?.preventDefault?.();
        e?.stopPropagation?.();
        if (!myBag.some(d => d.brand === disc.brand && d.name === disc.name)) {
            onBagChange?.([...myBag, disc]);
            onSelectDisc(disc);
            requestAnimationFrame(() => searchInputRef.current?.focus());
        }
    };

    const removeFromBag = (disc) => {
        const remaining = myBag.filter(d => !(d.brand === disc.brand && d.name === disc.name));
        onBagChange?.(remaining);
        if (selectedDisc && selectedDisc.brand === disc.brand && selectedDisc.name === disc.name) {
            onSelectDisc(remaining[0] || null);
        }
    };

    const isDiscInBag = (disc) => myBag.some(d => d.brand === disc.brand && d.name === disc.name);

    return (
        <div
            className="glass-panel w-[300px] p-4 flex flex-col gap-3 max-h-[calc(100vh-120px)] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
        >
            {/* Sticky Search Section - always visible at top */}
            <div className="shrink-0 sticky top-0 z-10 -m-4 p-4 pb-2 bg-truarc-card backdrop-blur-md border-b border-truarc-border/30 mb-1">
                {/* Header */}
                <div className="flex items-center gap-2 mb-2">
                    <Disc3 size={16} className="text-truarc-accent" />
                    <h2 className="cad-text text-sm">My Bag</h2>
                </div>

                {/* Search Bar */}
                <div className="relative">
                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-truarc-muted" />
                    <input
                        ref={searchInputRef}
                        id="disc-search-input"
                        type="text"
                        autoComplete="off"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => e.stopPropagation()}
                        placeholder="Search discs to add..."
                        className="w-full pl-8 pr-3 py-2 rounded-lg bg-truarc-card/60 border border-truarc-border/40 text-sm text-truarc-text placeholder:text-truarc-muted/60 focus:outline-none focus:border-truarc-accent/50 transition-colors"
                    />
                    {searchQuery && (
                        <button
                            type="button"
                            onClick={() => setSearchQuery('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-truarc-muted hover:text-truarc-text p-0.5"
                        >
                            <X size={14} />
                        </button>
                    )}
                </div>

                {/* Search Results - rendered via PORTAL to document.body so they're never clipped by parent overflow */}
                {searchQuery.trim() && createPortal(
                    <div
                        className="fixed z-[9999] rounded-lg border border-truarc-border/50 bg-truarc-card shadow-xl overflow-hidden"
                        style={{
                            top: dropdownPosition.top,
                            left: dropdownPosition.left,
                            width: dropdownPosition.width || 268,
                            maxHeight: 200,
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="text-[10px] font-bold text-truarc-muted px-2 py-1.5 uppercase tracking-wider border-b border-truarc-border/30">
                            Add to bag
                        </div>
                        <div className="flex flex-col max-h-[168px] overflow-y-auto">
                            {searchResults.length === 0 ? (
                                <div className="py-4 text-center text-xs text-truarc-muted">No discs found</div>
                            ) : (
                                searchResults.map((disc) => (
                                    <div
                                        key={`${disc.brand}-${disc.name}`}
                                        className="flex items-center justify-between py-2 px-2 hover:bg-truarc-card/80 transition-colors border-b border-truarc-border/20 last:border-0"
                                    >
                                        <div className="flex items-center gap-2 min-w-0">
                                            <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: TYPE_COLORS[disc.type] }} />
                                            <span className="font-medium text-truarc-text truncate">{disc.name}</span>
                                            <span className="text-truarc-muted shrink-0 text-[10px]">{disc.brand}</span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={(e) => addToBag(e, disc)}
                                            disabled={isDiscInBag(disc)}
                                            className={`shrink-0 flex items-center gap-1 px-2 py-1 rounded text-[10px] transition-all ${isDiscInBag(disc)
                                                ? 'text-truarc-accent/60 cursor-default'
                                                : 'text-truarc-accent hover:bg-truarc-accent/20 border border-truarc-accent/30'
                                                }`}
                                        >
                                            <Plus size={12} />
                                            {isDiscInBag(disc) ? 'In bag' : 'Add'}
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>,
                    document.body
                )}
            </div>

            {/* Scrollable content below */}
            <div className="flex-1 overflow-y-auto min-h-0 flex flex-col gap-3">
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
                        <div className="flex flex-col items-end gap-1">
                            <div
                                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-mono"
                                style={{ background: TYPE_COLORS[selectedDisc.type] + '15', color: TYPE_COLORS[selectedDisc.type] }}
                            >
                                {selectedDisc.speed}
                            </div>
                            <button
                                onClick={() => removeFromBag(selectedDisc)}
                                className="text-[9px] px-1.5 py-0.5 rounded border border-truarc-border/40 text-truarc-muted hover:border-truarc-danger/40 hover:text-truarc-danger transition-colors"
                            >
                                Remove
                            </button>
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

            {/* My Bag */}
            <div className="flex flex-col gap-1 min-h-[120px]">
                <div className="flex items-center gap-2">
                    <Briefcase size={12} className="text-truarc-muted" />
                    <span className="text-[10px] font-bold text-truarc-muted uppercase tracking-wider">
                        Bag ({myBag.length})
                    </span>
                </div>
                {myBag.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-6 text-truarc-muted/40">
                        <Briefcase size={20} className="mb-2 opacity-50" />
                        <div className="text-xs text-center">Your bag is empty</div>
                        <div className="text-[10px] text-center mt-1">Search above to add discs</div>
                    </div>
                ) : (
                    DISC_TYPES.map(type => {
                        const discsInType = myBag.filter(d => d.type === type);
                        if (discsInType.length === 0) return null;

                        return (
                            <div key={type} className="mb-2">
                                <div className="text-[10px] font-bold text-truarc-muted px-2 mb-1 uppercase tracking-wider opacity-60">
                                    {type}
                                </div>
                                {discsInType.map(disc => (
                                    <div
                                        key={`${disc.brand}-${disc.name}`}
                                        className={`group flex items-center justify-between py-1.5 px-2 rounded text-xs transition-all mb-0.5 ${selectedDisc && selectedDisc.brand === disc.brand && selectedDisc.name === disc.name
                                            ? 'bg-truarc-accent/10 text-truarc-accent border border-truarc-accent/30'
                                            : 'text-truarc-muted hover:text-truarc-text hover:bg-truarc-card/40'
                                            }`}
                                    >
                                        <button
                                            onClick={() => onSelectDisc(disc)}
                                            className="flex-1 flex items-center justify-between min-w-0 text-left"
                                        >
                                            <div className="flex items-center gap-2 min-w-0">
                                                <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: TYPE_COLORS[type] }} />
                                                <span className="font-medium truncate">{disc.name}</span>
                                            </div>
                                            <span className="font-mono text-[10px] opacity-60 shrink-0 ml-2">
                                                {disc.speed}/{disc.glide}/{disc.turn}/{disc.fade}
                                            </span>
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); removeFromBag(disc); }}
                                            className="opacity-40 hover:opacity-100 p-0.5 rounded text-truarc-muted hover:text-truarc-danger hover:bg-truarc-danger/10 transition-all shrink-0"
                                            title="Remove from bag"
                                        >
                                            <X size={12} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        );
                    })
                )}
            </div>

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
            </div>
        </div>
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
