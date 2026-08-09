/**
 * FlightStats — LEFT-column readouts: which hole you're looking at
 * (course mode) and point-to-point measurements (measure mode).
 *
 * Throw-mode flight results moved OUT of this component and into
 * ThrowPanel.jsx (as `FlightResultsSection`, exported below) so a
 * thrown disc's results live in the same unified right-hand bar as the
 * bag/throw-settings/disc-profile that produced them, rather than a
 * separate floating card. This file keeps FlightResultsSection's
 * markup so the readout itself — and its collision/OB logic — has one
 * implementation, not two copies that could drift.
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Target, ArrowDown, ArrowUp, Ruler, Mountain, Zap, Timer, Flag, Navigation, MapPin } from 'lucide-react';
import { measure3DDistance } from '../utils/flightPhysics';
import AnimatedNumber from './AnimatedNumber';

export default function FlightStats({ measurement, mode, activeHole, activeCourse }) {
    return (
        <AnimatePresence mode="wait">
            {mode === 'measure' && measurement && (
                <MeasurementDisplay key="measure" measurement={measurement} />
            )}
            {mode === 'course' && activeHole && (
                <HoleDisplay key="hole" hole={activeHole} course={activeCourse} />
            )}
        </AnimatePresence>
    );
}

// ─── HOLE INFO DISPLAY ──────────────────────────────────────

function HoleDisplay({ hole, course }) {
    const parColor = hole.par >= 4 ? '#ff6b7a' : '#4cb8ff';

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="glass-panel p-3.5 w-[320px]"
        >
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <Flag size={14} className="text-truarc-accent" />
                    <span className="cad-text">
                        Hole {hole.num}
                    </span>
                    {course && (
                        <span className="text-micro text-truarc-muted/60 truncate max-w-[110px]">
                            {course.name}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-1.5">
                    <DataQualityBadge dataQuality={hole.dataQuality} />
                    <span
                        className="text-micro font-medium px-2 py-0.5 rounded-full"
                        style={{ background: parColor + '1a', color: parColor }}
                    >
                        Par {hole.par}
                    </span>
                </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
                <StatBlock
                    label="Distance"
                    value={hole.distanceFt}
                    decimals={1}
                    unit="ft"
                    subValue={`${(hole.distanceFt * 0.3048).toFixed(1)}m`}
                    color="#4cb8ff"
                    icon={<Ruler size={12} />}
                    large
                />

                <StatBlock
                    label="Bearing"
                    value={hole.bearing || '—'}
                    unit="°"
                    color="#a78bfa"
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
                <div className="mt-3 pt-2.5 border-t border-white/[0.06]">
                    <div className="text-micro text-truarc-muted/80 leading-relaxed italic">
                        "{hole.notes}"
                    </div>
                </div>
            )}

            <div className="mt-2 pt-2 border-t border-white/[0.06]">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-sm" style={{ background: '#a78bfa' }} />
                        <span className="text-micro font-mono text-truarc-muted/70">TEE</span>
                        <span className="text-micro font-mono text-truarc-muted/50">
                            {hole.tee.lat.toFixed(5)}, {hole.tee.lng.toFixed(5)}
                        </span>
                    </div>
                    <div className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full" style={{ background: '#34d399' }} />
                        <span className="text-micro font-mono text-truarc-muted/70">BASKET</span>
                        <span className="text-micro font-mono text-truarc-muted/50">
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
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="glass-panel p-3.5 w-[320px]"
        >
            <div className="flex items-center gap-2 mb-3">
                <Ruler size={14} className="text-truarc-accent" />
                <span className="cad-text">Point-to-Point</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
                {/* Distance - decimal precision */}
                <StatBlock
                    label="Distance"
                    value={measurement.distanceFt}
                    decimals={1}
                    unit="ft"
                    subValue={`${measurement.distanceM.toFixed(1)}m`}
                    color="#4cb8ff"
                    icon={<Ruler size={12} />}
                />

                {/* Elevation Change */}
                <StatBlock
                    label="Elev Change"
                    value={`${isDownhill ? '' : '+'}${measurement.elevChangeFt.toFixed(1)}`}
                    unit="ft"
                    subValue={`${measurement.elevChangeM.toFixed(1)}m`}
                    color={isDownhill ? '#34d399' : '#f5a65b'}
                    icon={isDownhill ? <ArrowDown size={12} /> : <ArrowUp size={12} />}
                />

                {/* Horizontal */}
                <StatBlock
                    label="Horizontal"
                    value={measurement.horizontalFt?.toFixed(1) ?? '—'}
                    unit="ft"
                    color="#98a1b5"
                />

                {/* Bearing */}
                <StatBlock
                    label="Bearing"
                    value={measurement.bearingDeg?.toFixed(1) ?? '—'}
                    unit="°"
                    color="#98a1b5"
                />
            </div>

            {/* Elevation indicator bar */}
            <div className="mt-3 flex items-center gap-2">
                <div className="flex-1 h-1 bg-white/[0.07] rounded-full overflow-hidden">
                    <div
                        className="h-full rounded-full transition-all"
                        style={{
                            width: `${Math.min(100, Math.abs(measurement.elevChangeFt) / 2)}%`,
                            background: isDownhill
                                ? 'linear-gradient(to right, #34d399, #4cb8ff)'
                                : 'linear-gradient(to right, #f5a65b, #ff6b7a)',
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

// ─── FLIGHT RESULTS SECTION ─────────────────────────────────
//
// Content-only (no glass-panel wrapper, no fixed width): embedded
// directly inside ThrowPanel.jsx's own panel/scroll area so a thrown
// disc's results sit in the same unified bar as the bag and settings
// that produced them, rather than a second floating card. Exported for
// that one caller; kept in this file so the collision/OB readout logic
// isn't duplicated.

export function FlightResultsSection({ data, onFlyToLanding }) {
    const distFt = data.totalDistance * 3.28084;
    const maxHeightFt = data.maxHeight * 3.28084;
    const collision = data.collision;

    return (
        <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        >
            <div className="flex items-center gap-2 mb-2.5">
                <Target size={14} className={collision?.hit ? 'text-truarc-danger' : 'text-truarc-green'} />
                <span className="cad-text">Flight Results</span>
            </div>

            <div className="grid grid-cols-3 gap-3">
                <StatBlock
                    label="Distance"
                    value={distFt}
                    decimals={1}
                    unit="ft"
                    subValue={`${data.totalDistance.toFixed(1)}m`}
                    color="#4cb8ff"
                    icon={<Ruler size={12} />}
                    large
                />

                <StatBlock
                    label="Max Height"
                    value={maxHeightFt}
                    decimals={1}
                    unit="ft"
                    subValue={`${data.maxHeight.toFixed(1)}m`}
                    color="#f5a65b"
                    icon={<Mountain size={12} />}
                    large
                />

                <StatBlock
                    label="Flight Time"
                    value={data.points.length * 0.03}
                    decimals={1}
                    unit="s"
                    color="#34d399"
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
                <div className="mt-3 pt-2.5 border-t border-white/[0.06] flex items-center justify-between gap-2">
                    <div className="font-mono text-micro text-truarc-muted/70 tabular-nums">
                        {data.landing.lat.toFixed(5)}, {data.landing.lng.toFixed(5)}
                    </div>
                    {onFlyToLanding && (
                        <button
                            onClick={onFlyToLanding}
                            className="text-micro font-medium text-truarc-accent px-2 py-1 -mr-1 rounded-md hover:bg-truarc-accent/[0.1] transition-colors duration-150"
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
            <div className="mt-3 pt-2.5 border-t border-white/[0.06]">
                <div className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 bg-truarc-danger/[0.08] text-label font-medium text-truarc-danger">
                    <Target size={12} className="shrink-0" />
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
            <div className="mt-3 pt-2.5 border-t border-white/[0.06]">
                <div className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 bg-truarc-warn/[0.08] text-label font-medium text-truarc-warn">
                    <MapPin size={12} className="shrink-0" />
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
    const color = tight ? '#ff6b7a' : close ? '#f5a65b' : '#34d399';

    return (
        <div className="mt-3 pt-2.5 border-t border-white/[0.06] flex items-center justify-between">
            <span className="cad-label">Clearance</span>
            <span className="font-mono font-semibold text-xs tabular-nums" style={{ color }}>
                {threadedAGap
                    ? `${Math.abs(collision.clearanceFt).toFixed(1)} ft into canopy`
                    : `${collision.clearanceFt.toFixed(1)} ft`}
                {collision.gapValidated && (
                    <span className="ml-1.5 text-truarc-muted/70 font-normal">
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
    estimated: { label: 'ESTIMATED', color: '#f5a65b' },
    partial: { label: 'PARTIAL', color: '#ff6b7a' },
};

function DataQualityBadge({ dataQuality }) {
    const style = DATA_QUALITY_STYLES[dataQuality];
    if (!style) return null;
    return (
        <span
            className="text-micro font-medium px-2 py-0.5 rounded-full"
            style={{ background: `${style.color}1a`, color: style.color }}
            title={dataQuality === 'estimated'
                ? 'Basket position computed from tee + distance + bearing, not measured GPS'
                : 'Incomplete data — this hole needs to be finished manually'}
        >
            {style.label}
        </span>
    );
}

// ─── STAT BLOCK ─────────────────────────────────────────────

function StatBlock({ label, value, unit, subValue, color, icon, large, decimals = 0 }) {
    return (
        <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1 mb-1">
                {icon && <span style={{ color }} className="opacity-70 shrink-0">{icon}</span>}
                <span className="cad-label truncate">{label}</span>
            </div>
            <div className="flex items-baseline gap-1">
                <AnimatedNumber
                    value={value}
                    decimals={decimals}
                    className={`font-mono font-semibold tabular-nums ${large ? 'text-lg' : 'text-value'}`}
                    style={{ color }}
                />
                <span className="text-truarc-muted/70 text-micro font-mono">{unit}</span>
            </div>
            {subValue && (
                <span className="text-truarc-muted/50 text-micro font-mono mt-0.5 tabular-nums">{subValue}</span>
            )}
        </div>
    );
}
