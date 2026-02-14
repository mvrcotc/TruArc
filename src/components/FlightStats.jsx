/**
 * FlightStats — Glassmorphism overlay showing flight simulation results
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Target, ArrowDown, ArrowUp, Ruler, Mountain, Zap, Timer, Flag, Navigation, MapPin } from 'lucide-react';

export default function FlightStats({ flightData, measurement, mode, activeHole, activeCourse }) {
    return (
        <AnimatePresence mode="wait">
            {mode === 'measure' && measurement && (
                <MeasurementDisplay key="measure" measurement={measurement} />
            )}
            {mode === 'throw' && flightData && (
                <FlightDisplay key="flight" data={flightData} />
            )}
            {mode === 'course' && activeHole && (
                <HoleDisplay key="hole" hole={activeHole} course={activeCourse} />
            )}
        </AnimatePresence>
    );
}

// ─── HOLE INFO DISPLAY ──────────────────────────────────────

function HoleDisplay({ hole, course }) {
    const parColor = hole.par >= 4 ? '#ff3366' : '#00e5ff';

    return (
        <motion.div
            initial={{ y: 60, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 60, opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="glass-panel p-4 min-w-[340px]"
        >
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <Flag size={14} className="text-truarc-accent" />
                    <span className="cad-text">
                        Hole {hole.num}
                    </span>
                    {course && (
                        <span className="text-[10px] font-mono text-truarc-muted/60">
                            — {course.name}
                        </span>
                    )}
                </div>
                <span
                    className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full"
                    style={{
                        background: parColor + '15',
                        color: parColor,
                    }}
                >
                    Par {hole.par}
                </span>
            </div>

            <div className="grid grid-cols-3 gap-3">
                <StatBlock
                    label="Distance"
                    value={hole.distanceFt}
                    unit="ft"
                    subValue={`${(hole.distanceFt * 0.3048).toFixed(0)}m`}
                    color="#00e5ff"
                    icon={<Ruler size={12} />}
                    large
                />

                <StatBlock
                    label="Bearing"
                    value={hole.bearing || '—'}
                    unit="°"
                    color="#aa66ff"
                    icon={<Navigation size={12} />}
                    large
                />

                <StatBlock
                    label="Par"
                    value={hole.par}
                    unit=""
                    color={parColor}
                    icon={<Target size={12} />}
                    large
                />
            </div>

            {hole.notes && (
                <div className="mt-3 pt-2 border-t border-truarc-border/30">
                    <div className="text-[10px] text-truarc-muted/80 leading-relaxed italic">
                        "{hole.notes}"
                    </div>
                </div>
            )}

            <div className="mt-2 pt-2 border-t border-truarc-border/20">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-sm" style={{ background: '#aa66ff' }} />
                        <span className="text-[9px] font-mono text-truarc-muted/60">TEE</span>
                        <span className="text-[9px] font-mono text-truarc-muted/40">
                            {hole.tee.lat.toFixed(5)}, {hole.tee.lng.toFixed(5)}
                        </span>
                    </div>
                    <div className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full" style={{ background: '#00ff88' }} />
                        <span className="text-[9px] font-mono text-truarc-muted/60">BASKET</span>
                        <span className="text-[9px] font-mono text-truarc-muted/40">
                            {hole.basket.lat.toFixed(5)}, {hole.basket.lng.toFixed(5)}
                        </span>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}

// ─── MEASUREMENT DISPLAY ────────────────────────────────────

function MeasurementDisplay({ measurement }) {
    const isDownhill = measurement.elevChangeFt < 0;

    return (
        <motion.div
            initial={{ y: 60, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 60, opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="glass-panel p-4 min-w-[280px]"
        >
            <div className="flex items-center gap-2 mb-3">
                <Ruler size={14} className="text-truarc-accent" />
                <span className="cad-text">Point-to-Point</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
                {/* Distance */}
                <StatBlock
                    label="Distance"
                    value={Math.round(measurement.distanceFt)}
                    unit="ft"
                    subValue={`${measurement.distanceM.toFixed(1)}m`}
                    color="#00e5ff"
                    icon={<Ruler size={12} />}
                />

                {/* Elevation Change */}
                <StatBlock
                    label="Elev Change"
                    value={`${isDownhill ? '' : '+'}${Math.round(measurement.elevChangeFt)}`}
                    unit="ft"
                    subValue={`${measurement.elevChangeM.toFixed(1)}m`}
                    color={isDownhill ? '#00ff88' : '#ff6b35'}
                    icon={isDownhill ? <ArrowDown size={12} /> : <ArrowUp size={12} />}
                />

                {/* Horizontal */}
                <StatBlock
                    label="Horizontal"
                    value={Math.round(measurement.horizontalFt)}
                    unit="ft"
                    color="#8892b0"
                />

                {/* Bearing */}
                <StatBlock
                    label="Bearing"
                    value={measurement.bearingDeg.toFixed(1)}
                    unit="°"
                    color="#8892b0"
                />
            </div>

            {/* Elevation indicator bar */}
            <div className="mt-3 flex items-center gap-2">
                <div className="flex-1 h-1 bg-truarc-border/40 rounded-full overflow-hidden">
                    <div
                        className="h-full rounded-full transition-all"
                        style={{
                            width: `${Math.min(100, Math.abs(measurement.elevChangeFt) / 2)}%`,
                            background: isDownhill
                                ? 'linear-gradient(to right, #00ff88, #00e5ff)'
                                : 'linear-gradient(to right, #ff6b35, #ff3366)',
                        }}
                    />
                </div>
                <span className="cad-label">
                    {isDownhill ? 'DOWNHILL' : 'UPHILL'}
                </span>
            </div>
        </motion.div>
    );
}

// ─── FLIGHT DISPLAY ─────────────────────────────────────────

function FlightDisplay({ data }) {
    const distFt = data.totalDistance * 3.28084;
    const maxHeightFt = data.maxHeight * 3.28084;

    return (
        <motion.div
            initial={{ y: 60, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 60, opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="glass-panel p-4 min-w-[320px]"
        >
            <div className="flex items-center gap-2 mb-3">
                <Target size={14} className="text-truarc-green" />
                <span className="cad-text">Flight Results</span>
            </div>

            <div className="grid grid-cols-3 gap-3">
                <StatBlock
                    label="Distance"
                    value={Math.round(distFt)}
                    unit="ft"
                    subValue={`${data.totalDistance.toFixed(1)}m`}
                    color="#00e5ff"
                    icon={<Ruler size={12} />}
                    large
                />

                <StatBlock
                    label="Max Height"
                    value={Math.round(maxHeightFt)}
                    unit="ft"
                    subValue={`${data.maxHeight.toFixed(1)}m`}
                    color="#ff6b35"
                    icon={<Mountain size={12} />}
                    large
                />

                <StatBlock
                    label="Flight Time"
                    value={(data.points.length * 0.03).toFixed(1)}
                    unit="s"
                    color="#00ff88"
                    icon={<Timer size={12} />}
                    large
                />
            </div>

            {/* Landing coordinates */}
            {data.landing && (
                <div className="mt-3 pt-2 border-t border-truarc-border/30">
                    <div className="cad-label mb-1">Landing Coordinates</div>
                    <div className="font-mono text-[11px] text-truarc-muted">
                        {data.landing.lat.toFixed(6)}, {data.landing.lng.toFixed(6)}
                    </div>
                </div>
            )}
        </motion.div>
    );
}

// ─── STAT BLOCK ─────────────────────────────────────────────

function StatBlock({ label, value, unit, subValue, color, icon, large }) {
    return (
        <div className="flex flex-col">
            <div className="flex items-center gap-1 mb-0.5">
                {icon && <span style={{ color }} className="opacity-60">{icon}</span>}
                <span className="cad-label">{label}</span>
            </div>
            <div className="flex items-baseline gap-1">
                <span
                    className={`font-mono font-bold ${large ? 'text-lg' : 'text-sm'}`}
                    style={{ color }}
                >
                    {value}
                </span>
                <span className="text-truarc-muted text-[10px] font-mono">{unit}</span>
            </div>
            {subValue && (
                <span className="text-truarc-muted text-[10px] font-mono mt-0.5">{subValue}</span>
            )}
        </div>
    );
}
