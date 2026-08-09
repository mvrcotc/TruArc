/**
 * ThrowPanel — the ONE unified right-hand bar for throw mode: bag
 * management, throw settings, wind, the results of the throw you just
 * took, and the selected disc's reference flight profile.
 *
 * Previously these were three separate floating cards (a bag/settings
 * panel on the LEFT, flight results + a disc-profile card stacked on
 * the RIGHT) that didn't read as belonging together even though they're
 * all "the throw workflow." They're now one glass-panel, one scroll
 * region, ordered to match how a throw actually unfolds: pick a disc
 * (search/bag) → configure it (throw settings/wind) → see what happened
 * (flight results, once you've thrown) → learn what the disc does in
 * general (reference profile, always available once one's selected).
 * `FlightResultsSection` and `DiscProfileSection` are the same
 * components used nowhere else — no separate "compact" copies to drift
 * from the real ones.
 *
 * Layout contract inside the bag/settings zone (soft-premium pass):
 * search (sticky), BAG (what you own), THROW (what you're about to do)
 * — because adding discs and executing a throw are different tasks and
 * used to blur together. Color discipline: the accent is the only
 * interactive hue; disc-type identity survives only as a small dot;
 * every slider is the same color because none of them is more
 * "dangerous" than another.
 */

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Disc3, ChevronDown, Wind, Gauge, Briefcase, Search, Plus, X, RotateCcw } from 'lucide-react';
import { DISC_DATABASE } from '../utils/flightPhysics';
import { DEFAULT_THROW_SETTINGS } from '../physics/throwerProfile';
import { FlightResultsSection } from './FlightStats';
import { DiscProfileSection } from './DiscProfilePanel';

const DISC_TYPES = ['Distance Driver', 'Fairway Driver', 'Midrange', 'Putter'];

// Muted identity dots — type is metadata, not decoration.
const TYPE_COLORS = {
    'Distance Driver': '#ff7a90',
    'Fairway Driver': '#f5a65b',
    'Midrange': '#4cb8ff',
    'Putter': '#34d399',
};

export default function ThrowPanel({
    selectedDisc, onSelectDisc, myBag = [], onBagChange,
    throwSettings, onUpdateThrow, wind, onUpdateWind,
    flightData, onFlyToLanding,
}) {
    const [showWind, setShowWind] = useState(false);
    // Collapsed by default: a player picks one disc and then works the
    // sliders, so an always-open bag list mostly serves to push the
    // flight chart off-screen. See the layout comment below.
    const [showBag, setShowBag] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
    const searchInputRef = useRef(null);

    // Aim is included here even though the flight CHART ignores it (it
    // rotates rather than reshapes the flight): Reset is about the
    // sliders the player touched, and the map does honour aim.
    const throwIsModified = useMemo(
        () => Object.keys(DEFAULT_THROW_SETTINGS)
            .some((k) => throwSettings?.[k] !== DEFAULT_THROW_SETTINGS[k]),
        [throwSettings],
    );

    const handleResetThrow = useCallback(
        () => onUpdateThrow({ ...DEFAULT_THROW_SETTINGS }),
        [onUpdateThrow],
    );

    // Update dropdown position when search is active - use rAF to ensure layout is complete
    useEffect(() => {
        if (!searchQuery.trim()) return;
        const updatePos = () => {
            if (searchInputRef.current) {
                const rect = searchInputRef.current.getBoundingClientRect();
                setDropdownPosition({
                    top: rect.bottom + 6,
                    left: rect.left,
                    width: Math.max(rect.width, 288),
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
            className="glass-panel w-[320px] p-4 flex flex-col gap-3 max-h-[calc(100vh-120px)] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
        >
            {/* Sticky Search Section - always visible at top */}
            <div className="shrink-0 sticky top-0 z-10 -m-4 p-4 pb-3 bg-truarc-card/95 backdrop-blur-md border-b border-white/[0.06] mb-0">
                {/* Header */}
                <div className="flex items-center gap-2 mb-2.5">
                    <Disc3 size={15} className="text-truarc-accent" />
                    <h2 className="cad-text">My Bag</h2>
                </div>

                {/* Search Bar */}
                <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-truarc-muted/70" />
                    <input
                        ref={searchInputRef}
                        id="disc-search-input"
                        type="text"
                        autoComplete="off"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => e.stopPropagation()}
                        placeholder="Search discs to add…"
                        className="w-full pl-9 pr-8 py-2 rounded-lg bg-white/[0.04] border border-white/[0.07] text-body text-truarc-text placeholder:text-truarc-muted/50 focus:outline-none focus:border-truarc-accent/40 focus:bg-white/[0.06] transition-colors duration-150"
                    />
                    {searchQuery && (
                        <button
                            type="button"
                            onClick={() => setSearchQuery('')}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-truarc-muted/60 hover:text-truarc-text p-0.5 transition-colors"
                        >
                            <X size={14} />
                        </button>
                    )}
                </div>

                {/* Search Results - rendered via PORTAL to document.body so they're never clipped by parent overflow */}
                {searchQuery.trim() && createPortal(
                    <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.15, ease: 'easeOut' }}
                        className="fixed z-[9999] rounded-xl border border-white/[0.09] bg-truarc-surface shadow-elev-3 overflow-hidden"
                        style={{
                            top: dropdownPosition.top,
                            left: dropdownPosition.left,
                            width: dropdownPosition.width || 288,
                            maxHeight: 224,
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="cad-label px-3 py-2 border-b border-white/[0.06]">
                            Add to bag
                        </div>
                        <div className="flex flex-col max-h-[184px] overflow-y-auto custom-scrollbar">
                            {searchResults.length === 0 ? (
                                <div className="py-4 text-center text-body text-truarc-muted">No discs found</div>
                            ) : (
                                searchResults.map((disc) => (
                                    <div
                                        key={`${disc.brand}-${disc.name}`}
                                        className="flex items-center justify-between py-2 px-3 hover:bg-white/[0.04] transition-colors duration-100"
                                    >
                                        <div className="flex items-center gap-2 min-w-0">
                                            <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: TYPE_COLORS[disc.type] }} />
                                            <span className="text-body font-medium text-truarc-text truncate">{disc.name}</span>
                                            <span className="text-truarc-muted/70 shrink-0 text-micro">{disc.brand}</span>
                                            <span className="font-mono text-micro text-truarc-muted/50 shrink-0">
                                                {disc.speed}/{disc.glide}/{disc.turn}/{disc.fade}
                                            </span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={(e) => addToBag(e, disc)}
                                            disabled={isDiscInBag(disc)}
                                            className={`shrink-0 flex items-center gap-1 px-2 py-1 rounded-md text-micro font-medium transition-all duration-150 ${isDiscInBag(disc)
                                                ? 'text-truarc-muted/50 cursor-default'
                                                : 'text-truarc-accent bg-truarc-accent/[0.08] hover:bg-truarc-accent/[0.16] active:scale-[0.97]'
                                                }`}
                                        >
                                            <Plus size={12} />
                                            {isDiscInBag(disc) ? 'In bag' : 'Add'}
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    </motion.div>,
                    document.body
                )}
            </div>

            {/* Scrollable content, ordered by how a throw actually
                unfolds and by what a player looks at most:
                  1. the selected disc + its live flight chart
                  2. the settings that reshape that chart
                  3. the results of the throw just taken
                  4. the bag — LAST and collapsed by default, because a
                     player picks one disc and then spends their time on
                     the sliders; keeping an 18-disc list permanently
                     expanded pushed the chart off-screen for the 95% of
                     the session where nobody is switching discs. */}
            <div className="flex-1 overflow-y-auto min-h-0 flex flex-col gap-3 custom-scrollbar">

                {/* Selected disc + live flight chart. This is the thing
                    the panel exists to show, so it sits at the top and is
                    visible at all times. */}
                {selectedDisc ? (
                    <DiscProfileSection
                        disc={selectedDisc}
                        throwSettings={throwSettings}
                        wind={wind}
                    />
                ) : (
                    <div className="flex flex-col items-center justify-center py-8 rounded-xl border border-dashed border-white/[0.07] text-truarc-muted/50">
                        <Disc3 size={20} className="mb-2 opacity-60" />
                        <div className="text-body">No disc selected</div>
                        <div className="text-micro mt-1 text-truarc-muted/40">Search above to add one</div>
                    </div>
                )}

                {/* Throw Settings */}
                <div className="cad-divider" />
                <div>
                    <div className="flex items-center justify-between gap-2 mb-2.5">
                        <div className="flex items-center gap-2 min-w-0">
                            <Gauge size={14} className="text-truarc-muted/70" />
                            <span className="cad-text">Throw Settings</span>
                        </div>
                        {/* Escape hatch: the chart above reacts to every
                            slider, so it is easy to wander somewhere
                            strange and lose the baseline. Only offered
                            when something actually differs, so it is not
                            a permanently-dead control. */}
                        {throwIsModified && (
                            <button
                                onClick={handleResetThrow}
                                title="Reset power, aim, release and nose to the app default"
                                className="flex items-center gap-1 text-micro font-medium px-2 py-1 rounded-md text-truarc-accent bg-truarc-accent/[0.08] hover:bg-truarc-accent/[0.16] active:scale-[0.97] transition-all duration-150 shrink-0"
                            >
                                <RotateCcw size={11} />
                                Reset
                            </button>
                        )}
                    </div>

                    <div className="flex flex-col gap-3.5">
                        <SliderControl
                            label="Power"
                            value={throwSettings.power}
                            onChange={(v) => onUpdateThrow({ ...throwSettings, power: v })}
                            min={30}
                            max={100}
                            unit="%"
                        />
                        <SliderControl
                            label="Aim Angle"
                            value={throwSettings.aimAngle}
                            onChange={(v) => onUpdateThrow({ ...throwSettings, aimAngle: v })}
                            min={-45}
                            max={45}
                            unit="°"
                        />
                        <SliderControl
                            label="Release (Hyzer/Anhyzer)"
                            value={throwSettings.releaseAngle}
                            onChange={(v) => onUpdateThrow({ ...throwSettings, releaseAngle: v })}
                            min={-30}
                            max={30}
                            unit="°"
                        />
                        <SliderControl
                            label="Nose Angle"
                            value={throwSettings.noseAngle}
                            onChange={(v) => onUpdateThrow({ ...throwSettings, noseAngle: v })}
                            min={0}
                            max={30}
                            unit="°"
                        />
                    </div>
                </div>

                {/* Wind */}
                <div className="cad-divider" />
                <button
                    onClick={() => setShowWind(!showWind)}
                    className="flex items-center gap-2 w-full py-1 group"
                >
                    <Wind size={14} className="text-truarc-muted/70" />
                    <span className="cad-text group-hover:text-truarc-text transition-colors duration-150">Wind Conditions</span>
                    {wind.speed > 0 && (
                        <span className="font-mono text-micro text-truarc-accent/80 tabular-nums">{wind.speed} m/s</span>
                    )}
                    <ChevronDown size={12} className={`ml-auto text-truarc-muted/60 transition-transform duration-200 ${showWind ? 'rotate-180' : ''}`} />
                </button>

                <AnimatePresence>
                    {showWind && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2, ease: 'easeOut' }}
                            className="overflow-hidden flex flex-col gap-3.5"
                        >
                            <SliderControl
                                label="Wind Speed"
                                value={wind.speed}
                                onChange={(v) => onUpdateWind({ ...wind, speed: v })}
                                min={0}
                                max={15}
                                unit="m/s"
                                step={0.5}
                            />
                            <SliderControl
                                label="Wind Direction"
                                value={wind.direction}
                                onChange={(v) => onUpdateWind({ ...wind, direction: v })}
                                min={0}
                                max={360}
                                unit="°"
                                step={5}
                            />
                            <div className="text-center pb-1">
                                <WindCompass direction={wind.direction} />
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Flight Results — only once this disc has actually been
                    thrown. Above the bag because "what just happened"
                    matters more than disc management. */}
                {flightData && (
                    <>
                        <div className="cad-divider" />
                        <FlightResultsSection data={flightData} onFlyToLanding={onFlyToLanding} />
                    </>
                )}

                {/* Bag — last, and collapsed by default. Expanding is one
                    click and the count stays visible while collapsed, so
                    nothing is hidden, just folded away. */}
                <div className="cad-divider" />
                <div className="flex flex-col gap-1">
                    <button
                        onClick={() => setShowBag(!showBag)}
                        className="flex items-center gap-2 w-full py-1 group"
                        aria-expanded={showBag}
                    >
                        <Briefcase size={14} className="text-truarc-muted/70" />
                        <span className="cad-text group-hover:text-truarc-text transition-colors duration-150">
                            Bag
                        </span>
                        <span className="font-mono text-micro text-truarc-muted/60 tabular-nums">
                            {myBag.length}
                        </span>
                        <ChevronDown size={12} className={`ml-auto text-truarc-muted/60 transition-transform duration-200 ${showBag ? 'rotate-180' : ''}`} />
                    </button>

                    <AnimatePresence>
                        {showBag && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2, ease: 'easeOut' }}
                                className="overflow-hidden"
                            >
                                {myBag.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-7 rounded-xl border border-dashed border-white/[0.07] text-truarc-muted/50">
                                        <Briefcase size={18} className="mb-2 opacity-60" />
                                        <div className="text-body">Your bag is empty</div>
                                        <div className="text-micro mt-1 text-truarc-muted/40">Search above to add discs</div>
                                    </div>
                                ) : (
                                    DISC_TYPES.map(type => {
                                        const discsInType = myBag.filter(d => d.type === type);
                                        if (discsInType.length === 0) return null;

                                        return (
                                            <div key={type} className="mb-1.5">
                                                <div className="cad-label px-2 mb-1 opacity-70">
                                                    {type}
                                                </div>
                                                {discsInType.map(disc => {
                                                    const isSelected = selectedDisc && selectedDisc.brand === disc.brand && selectedDisc.name === disc.name;
                                                    return (
                                                        <div
                                                            key={`${disc.brand}-${disc.name}`}
                                                            className={`group flex items-center justify-between py-1.5 px-2 rounded-lg text-body transition-colors duration-100 mb-0.5 ${isSelected
                                                                ? 'bg-truarc-accent/[0.09] text-truarc-text'
                                                                : 'text-truarc-muted hover:text-truarc-text hover:bg-white/[0.04]'
                                                                }`}
                                                        >
                                                            <button
                                                                onClick={() => onSelectDisc(disc)}
                                                                className="flex-1 flex items-center justify-between min-w-0 text-left"
                                                            >
                                                                <div className="flex items-center gap-2 min-w-0">
                                                                    <div
                                                                        className={`w-1.5 h-1.5 rounded-full shrink-0 transition-opacity ${isSelected ? '' : 'opacity-60'}`}
                                                                        style={{ background: TYPE_COLORS[type] }}
                                                                    />
                                                                    <span className={`truncate ${isSelected ? 'font-semibold' : 'font-medium'}`}>{disc.name}</span>
                                                                </div>
                                                                <span className="font-mono text-micro opacity-50 shrink-0 ml-2 tabular-nums">
                                                                    {disc.speed}/{disc.glide}/{disc.turn}/{disc.fade}
                                                                </span>
                                                            </button>
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); removeFromBag(disc); }}
                                                                className="opacity-0 group-hover:opacity-60 hover:!opacity-100 p-0.5 rounded text-truarc-muted hover:text-truarc-danger transition-all duration-100 shrink-0"
                                                                title="Remove from bag"
                                                            >
                                                                <X size={12} />
                                                            </button>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        );
                                    })
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
}

// ─── SLIDER CONTROL ─────────────────────────────────────────
//
// One color for every slider. The old version gave each its own hue
// (power orange, aim cyan, release green, nose gray), which implied a
// semantic difference that doesn't exist — none of these is a warning.

const SLIDER_FILL = 'rgba(76, 184, 255, 0.9)';
const SLIDER_TRACK = 'rgba(255, 255, 255, 0.08)';

function SliderControl({ label, value, onChange, min, max, unit, step = 1 }) {
    const pct = ((value - min) / (max - min)) * 100;
    return (
        <div>
            <div className="flex justify-between items-baseline mb-1.5">
                <span className="cad-label">{label}</span>
                <span className="font-mono text-xs text-truarc-text tabular-nums">
                    {typeof value === 'number' ? value.toFixed(step < 1 ? 1 : 0) : value}
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
                style={{
                    background: `linear-gradient(to right, ${SLIDER_FILL} ${pct}%, ${SLIDER_TRACK} ${pct}%)`,
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
                <circle cx="24" cy="24" r="22" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
                <text x="24" y="8" textAnchor="middle" fill="#98a1b5" fontSize="6" fontFamily="monospace">N</text>
                <text x="42" y="26" textAnchor="middle" fill="#98a1b5" fontSize="6" fontFamily="monospace">E</text>
                <text x="24" y="44" textAnchor="middle" fill="#98a1b5" fontSize="6" fontFamily="monospace">S</text>
                <text x="6" y="26" textAnchor="middle" fill="#98a1b5" fontSize="6" fontFamily="monospace">W</text>
                <line
                    x1="24" y1="24"
                    x2={24 + 14 * Math.sin((direction * Math.PI) / 180)}
                    y2={24 - 14 * Math.cos((direction * Math.PI) / 180)}
                    stroke="#4cb8ff"
                    strokeWidth="2"
                    strokeLinecap="round"
                />
                <circle cx="24" cy="24" r="2" fill="#4cb8ff" />
            </svg>
        </div>
    );
}
