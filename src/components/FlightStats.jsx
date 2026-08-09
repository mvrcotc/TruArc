/**
 * FlightStats — Glassmorphism overlay showing flight simulation results
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Target, ArrowDown, ArrowUp, Ruler, Mountain, Zap, Timer, Flag, Navigation, MapPin } from 'lucide-react';
import { measure3DDistance } from '../utils/flightPhysics';

export default function FlightStats({ flightData, measurement, mode, activeHole, activeCourse, onFlyToLanding }) {
    return (
        <AnimatePresence mode="wait">
            {mode === 'measure' && measurement && (
                <MeasurementDisplay key="measure" measurement={measurement} />
            )}
            {mode === 'throw' && flightData && (
                <FlightDisplay key="flight" data={flightData} onFlyToLanding={onFlyToLanding} />
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
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="glass-panel p-3 min-w-[260px]"
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
                <div className="flex items-center gap-1.5">
                    <DataQualityBadge dataQuality={hole.dataQuality} />
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
            </div>

            <div className="grid grid-cols-3 gap-3">
                <StatBlock
                    label="Distance"
                    value={hole.distanceFt.toFixed(1)}
                    unit="ft"
                    subValue={`${(hole.distanceFt * 0.3048).toFixed(1)}m`}
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
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="glass-panel p-3 min-w-[200px]"
        >
            <div className="flex items-center gap-2 mb-3">
                <Ruler size={14} className="text-truarc-accent" />
                <span className="cad-text">Point-to-Point</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
                {/* Distance - decimal precision */}
                <StatBlock
                    label="Distance"
                    value={measurement.distanceFt.toFixed(1)}
                    unit="ft"
                    subValue={`${measurement.distanceM.toFixed(1)}m`}
                    color="#00e5ff"
                    icon={<Ruler size={12} />}
                />

                {/* Elevation Change */}
                <StatBlock
                    label="Elev Change"
                    value={`${isDownhill ? '' : '+'}${measurement.elevChangeFt.toFixed(1)}`}
                    unit="ft"
                    subValue={`${measurement.elevChangeM.toFixed(1)}m`}
                    color={isDownhill ? '#00ff88' : '#ff6b35'}
                    icon={isDownhill ? <ArrowDown size={12} /> : <ArrowUp size={12} />}
                />

                {/* Horizontal */}
                <StatBlock
                    label="Horizontal"
                    value={measurement.horizontalFt?.toFixed(1) ?? '—'}
                    unit="ft"
                    color="#8892b0"
                />

                {/* Bearing */}
                <StatBlock
                    label="Bearing"
                    value={measurement.bearingDeg?.toFixed(1) ?? '—'}
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

function FlightDisplay({ data, onFlyToLanding }) {
    const distFt = data.totalDistance * 3.28084;
    const maxHeightFt = data.maxHeight * 3.28084;
    const collision = data.collision;

    return (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="glass-panel p-3 min-w-[240px]"
        >
            <div className="flex items-center gap-2 mb-3">
                <Target size={14} className={collision?.hit ? 'text-truarc-warn' : 'text-truarc-green'} />
                <span className="cad-text">Flight Results</span>
            </div>

            <div className="grid grid-cols-3 gap-3">
                <StatBlock
                    label="Distance"
                    value={distFt.toFixed(1)}
                    unit="ft"
                    subValue={`${data.totalDistance.toFixed(1)}m`}
                    color="#00e5ff"
                    icon={<Ruler size={12} />}
                    large
                />

                <StatBlock
                    label="Max Height"
                    value={maxHeightFt.toFixed(1)}
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

            {/* Collision readout (Section 4) — only rendered when the
                course has a processed voxel grid loaded; a course
                without one simply carries no `collision` field. */}
            {collision && <CollisionReadout collision={collision} origin={data.origin} />}

            {/* Landing + Fly to landing */}
            {data.landing && (
                <div className="mt-3 pt-2 border-t border-truarc-border/30 flex items-center justify-between gap-2">
                    <div className="font-mono text-[10px] text-truarc-muted">
                        {data.landing.lat.toFixed(5)}, {data.landing.lng.toFixed(5)}
                    </div>
                    {onFlyToLanding && (
                        <button
                            onClick={onFlyToLanding}
                            className="text-[10px] font-medium text-truarc-accent hover:underline"
                        >
                            View from here
                        </button>
                    )}
                </div>
            )}
        </motion.div>
    );
}

// ─── COLLISION READOUT (Section 4 & 5) ─────────────────────────────

function CollisionReadout({ collision, origin }) {
    if (collision.hit && collision.firstContact) {
        // "First tree at 182 ft" — docs/ACCURACY_ROADMAP.md §4's own
        // example phrasing. `origin` is the tee point MapCanvas already
        // passes through onFlightComplete; contact carries lng/lat/altitude
        // in the same WGS84 shape measure3DDistance expects.
        const contactDistFt = origin
            ? measure3DDistance(origin, {
                lng: collision.firstContact.lng,
                lat: collision.firstContact.lat,
                elevation: collision.firstContact.altitude,
            }).distanceFt
            : null;
        return (
            <div className="mt-3 pt-2 border-t border-truarc-border/30">
                <div className="flex items-center gap-1.5 text-[11px] font-mono font-semibold" style={{ color: '#ff3366' }}>
                    <Target size={11} />
                    <span>
                        {contactDistFt != null ? `First tree at ${contactDistFt.toFixed(0)} ft` : 'Tree contact'}
                        {collision.firstContact.treeIndex != null ? ` (tree #${collision.firstContact.treeIndex})` : ' (unattributed)'}
                    </span>
                </div>
            </div>
        );
    }

    // OB crossing warning (Section 5 — course geometry with OB polygons)
    if (collision.obCrossing) {
        const obDistFt = origin
            ? measure3DDistance(origin, {
                lng: collision.obCrossing.lng,
                lat: collision.obCrossing.lat,
                elevation: collision.obCrossing.altitude,
            }).distanceFt
            : null;
        return (
            <div className="mt-3 pt-2 border-t border-truarc-border/30">
                <div className="flex items-center gap-1.5 text-[11px] font-mono font-semibold" style={{ color: '#ffaa33' }}>
                    <MapPin size={11} />
                    <span>
                        {obDistFt != null ? `OB crossing at ${obDistFt.toFixed(0)} ft` : 'OB crossing'}
                    </span>
                </div>
            </div>
        );
    }

    if (collision.clearanceFt == null) return null;

    // Clearance is a SIGNED distance to the nearest crown surface, so a
    // clean flight can still read negative: the line passed inside a
    // tree's bounding crown volume while the voxel grid — which carries
    // the real canopy gaps — recorded no contact. That's not a
    // contradiction, it's the single most valuable thing this feature
    // can tell a player, so it gets said plainly rather than shown as a
    // confusing negative number.
    const threadedAGap = collision.clearanceFt < 0;
    const tight = collision.clearanceFt < 5;
    const close = collision.clearanceFt < 15;
    const color = tight ? '#ff3366' : close ? '#ff6b35' : '#00ff88';

    return (
        <div className="mt-3 pt-2 border-t border-truarc-border/30 flex items-center justify-between">
            <span className="cad-label">Clearance</span>
            <span className="font-mono font-bold text-xs" style={{ color }}>
                {threadedAGap
                    ? `${Math.abs(collision.clearanceFt).toFixed(1)} ft into canopy`
                    : `${collision.clearanceFt.toFixed(1)} ft`}
                {collision.gapValidated && (
                    <span className="ml-1.5 text-truarc-muted font-normal">
                        {threadedAGap ? '— through a gap' : '— gap validated'}
                    </span>
                )}
            </span>
        </div>
    );
}

// ─── DATA QUALITY BADGE (Section 5) ──────────────────────────
//
// Surfaces whether a hole's basket is real measured GPS or
// basketFromTee's estimate directly in the UI a player is looking at —
// "honesty builds trust" per docs/ACCURACY_ROADMAP.md §5. Renders
// nothing for 'measured' (the expected, unremarkable case) so the badge
// only draws attention to data a player should weigh with more caution.

const DATA_QUALITY_STYLES = {
    estimated: { label: 'ESTIMATED', color: '#ff6b35' },
    partial: { label: 'PARTIAL', color: '#ff3366' },
};

function DataQualityBadge({ dataQuality }) {
    const style = DATA_QUALITY_STYLES[dataQuality];
    if (!style) return null;
    return (
        <span
            className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full"
            style={{ background: `${style.color}15`, color: style.color }}
            title={dataQuality === 'estimated'
                ? 'Basket position computed from tee + distance + bearing, not measured GPS'
                : 'Incomplete data — this hole needs to be finished manually'}
        >
            {style.label}
        </span>
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
