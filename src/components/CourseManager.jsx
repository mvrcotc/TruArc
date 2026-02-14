/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  CourseManager — Interactive Course Browser & Hole Navigator     ║
 * ║  Browse courses, view hole details, fly to positions             ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

import React, { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    MapPin, Flag, ChevronDown, ChevronLeft, ChevronRight,
    Star, Navigation, Info, Target, Crosshair, Layers
} from 'lucide-react';
import { getAllCourses, searchCourses, getCourseById } from '../data/courses';

const DIFF_COLORS = {
    'Championship': '#ff3366',
    'Pro': '#ff6b35',
    'Advanced': '#00e5ff',
    'Intermediate': '#00ff88',
};

const TAG_COLORS = {
    'DGPT': '#ff3366',
    'USDGC': '#ff6b35',
    'Woods': '#00ff88',
    'Open': '#00e5ff',
    'Water': '#3388ff',
    'Wind': '#8892b0',
    'Elevation': '#ff6b35',
    'Desert': '#ffaa33',
    'Technical': '#aa66ff',
    'European Open': '#ff3366',
    'Dynamic Discs Open': '#ff6b35',
    'Masters Cup': '#ff3366',
    'Scenic': '#00e5ff',
    'OB Heavy': '#ff3366',
    'Punishing OB': '#ff3366',
    'Extreme Elevation': '#ff6b35',
    'Long': '#00e5ff',
    'Hilly': '#ff6b35',
    'Blind Shots': '#8892b0',
};

export default function CourseManager({
    onSelectCourse,
    onSelectHole,
    onFlyToLocation,
    activeCourseId,
    activeHoleNum,
}) {
    const [view, setView] = useState('courses'); // courses | holes
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCourseId, setSelectedCourseId] = useState(activeCourseId || null);

    const courses = useMemo(() => searchCourses(searchQuery), [searchQuery]);
    const selectedCourse = useMemo(() => getCourseById(selectedCourseId), [selectedCourseId]);

    const handleSelectCourse = useCallback((course) => {
        setSelectedCourseId(course.id);
        setView('holes');
        onSelectCourse?.(course);
        onFlyToLocation?.(course.center.lng, course.center.lat, course.zoom || 16);
    }, [onSelectCourse, onFlyToLocation]);

    const handleSelectHole = useCallback((hole) => {
        onSelectHole?.(hole, selectedCourse);
        // Fly to midpoint between tee and basket
        const midLng = (hole.tee.lng + hole.basket.lng) / 2;
        const midLat = (hole.tee.lat + hole.basket.lat) / 2;
        onFlyToLocation?.(midLng, midLat, 18);
    }, [onSelectHole, selectedCourse, onFlyToLocation]);

    const handlePrevHole = useCallback(() => {
        if (!selectedCourse || !activeHoleNum) return;
        const prevNum = activeHoleNum > 1 ? activeHoleNum - 1 : selectedCourse.holes.length;
        const hole = selectedCourse.holes.find(h => h.num === prevNum);
        if (hole) handleSelectHole(hole);
    }, [selectedCourse, activeHoleNum, handleSelectHole]);

    const handleNextHole = useCallback(() => {
        if (!selectedCourse || !activeHoleNum) return;
        const nextNum = activeHoleNum < selectedCourse.holes.length ? activeHoleNum + 1 : 1;
        const hole = selectedCourse.holes.find(h => h.num === nextNum);
        if (hole) handleSelectHole(hole);
    }, [selectedCourse, activeHoleNum, handleSelectHole]);

    return (
        <motion.div
            initial={{ x: -340, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -340, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="glass-panel w-[320px] p-0 flex flex-col max-h-[calc(100vh-120px)] overflow-hidden"
        >
            {/* ─── Header ──────────────────────── */}
            <div className="px-4 pt-4 pb-2 border-b border-truarc-border/20">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                        {view === 'holes' && (
                            <button
                                onClick={() => setView('courses')}
                                className="text-truarc-muted hover:text-truarc-text transition-colors"
                            >
                                <ChevronLeft size={16} />
                            </button>
                        )}
                        <Layers size={14} className="text-truarc-accent" />
                        <h2 className="cad-text text-sm">
                            {view === 'courses' ? 'Course Browser' : selectedCourse?.name}
                        </h2>
                    </div>
                    {view === 'holes' && selectedCourse && (
                        <span className="text-[9px] font-mono px-2 py-0.5 rounded-full"
                            style={{
                                background: DIFF_COLORS[selectedCourse.difficulty] + '15',
                                color: DIFF_COLORS[selectedCourse.difficulty],
                            }}
                        >
                            PAR {selectedCourse.par}
                        </span>
                    )}
                </div>

                {/* Search (courses view only) */}
                {view === 'courses' && (
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search courses, locations, tags..."
                        className="w-full bg-truarc-bg/50 border border-truarc-border/20 rounded-md px-3 py-1.5 text-xs text-truarc-text placeholder:text-truarc-muted/40 font-mono outline-none focus:border-truarc-accent/40 transition-colors"
                    />
                )}
            </div>

            {/* ─── Content ──────────────────────── */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                <AnimatePresence mode="wait">
                    {view === 'courses' ? (
                        <motion.div
                            key="courses"
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="p-2"
                        >
                            {courses.map(course => (
                                <CourseCard
                                    key={course.id}
                                    course={course}
                                    isActive={course.id === activeCourseId}
                                    onClick={() => handleSelectCourse(course)}
                                />
                            ))}
                            {courses.length === 0 && (
                                <div className="text-center py-8 text-truarc-muted text-xs font-mono">
                                    No courses match your search
                                </div>
                            )}
                        </motion.div>
                    ) : (
                        <motion.div
                            key="holes"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            className="p-2"
                        >
                            {/* Course Info Banner */}
                            {selectedCourse && (
                                <div className="glass-panel-sm p-3 mb-2">
                                    <div className="flex items-start gap-2 mb-2">
                                        <MapPin size={12} className="text-truarc-accent mt-0.5" />
                                        <div>
                                            <div className="text-[11px] text-truarc-muted">{selectedCourse.location}</div>
                                            <div className="text-[10px] text-truarc-muted/60">{selectedCourse.layout} Layout</div>
                                        </div>
                                    </div>
                                    <p className="text-[10px] text-truarc-muted/80 leading-relaxed">{selectedCourse.description}</p>
                                    <div className="flex flex-wrap gap-1 mt-2">
                                        {selectedCourse.tags.map(tag => (
                                            <span
                                                key={tag}
                                                className="text-[8px] font-mono px-1.5 py-0.5 rounded-full"
                                                style={{
                                                    background: (TAG_COLORS[tag] || '#8892b0') + '15',
                                                    color: TAG_COLORS[tag] || '#8892b0',
                                                }}
                                            >
                                                {tag.toUpperCase()}
                                            </span>
                                        ))}
                                    </div>

                                    {/* Course Stats */}
                                    <div className="grid grid-cols-3 gap-2 mt-3 pt-2 border-t border-truarc-border/15">
                                        <StatBlock label="HOLES" value={selectedCourse.holes.length} color="#00e5ff" />
                                        <StatBlock label="PAR" value={selectedCourse.par} color="#00ff88" />
                                        <StatBlock label="TOTAL" value={`${(selectedCourse.totalDistanceFt / 1000).toFixed(1)}k'`} color="#ff6b35" />
                                    </div>
                                </div>
                            )}

                            {/* Hole Navigation Controls */}
                            {activeHoleNum && selectedCourse && (
                                <div className="flex items-center justify-between px-2 py-1.5 mb-2">
                                    <button
                                        onClick={handlePrevHole}
                                        className="w-7 h-7 rounded-md bg-truarc-card/50 flex items-center justify-center text-truarc-muted hover:text-truarc-text hover:bg-truarc-card transition-colors"
                                    >
                                        <ChevronLeft size={14} />
                                    </button>
                                    <div className="text-center">
                                        <div className="text-xs font-mono text-truarc-accent">
                                            Hole {activeHoleNum} of {selectedCourse.holes.length}
                                        </div>
                                    </div>
                                    <button
                                        onClick={handleNextHole}
                                        className="w-7 h-7 rounded-md bg-truarc-card/50 flex items-center justify-center text-truarc-muted hover:text-truarc-text hover:bg-truarc-card transition-colors"
                                    >
                                        <ChevronRight size={14} />
                                    </button>
                                </div>
                            )}

                            {/* Hole List */}
                            <div className="flex flex-col gap-1">
                                {selectedCourse?.holes.map(hole => (
                                    <HoleCard
                                        key={hole.num}
                                        hole={hole}
                                        isActive={hole.num === activeHoleNum}
                                        onClick={() => handleSelectHole(hole)}
                                    />
                                ))}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </motion.div>
    );
}

// ─── COURSE CARD ────────────────────────────────────────────

function CourseCard({ course, isActive, onClick }) {
    return (
        <button
            onClick={onClick}
            className={`w-full text-left p-3 rounded-lg mb-1.5 transition-all group ${isActive
                    ? 'bg-truarc-accent/10 border border-truarc-accent/30'
                    : 'hover:bg-truarc-card/50 border border-transparent'
                }`}
        >
            <div className="flex items-start justify-between mb-1">
                <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-truarc-text truncate">{course.name}</div>
                    <div className="text-[10px] text-truarc-muted flex items-center gap-1 mt-0.5">
                        <MapPin size={10} className="shrink-0" />
                        <span className="truncate">{course.location}</span>
                    </div>
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-2">
                    {Array.from({ length: course.rating }, (_, i) => (
                        <Star key={i} size={8} className="fill-truarc-warn text-truarc-warn" />
                    ))}
                </div>
            </div>

            <div className="flex items-center gap-2 mt-2">
                <span
                    className="text-[8px] font-mono px-1.5 py-0.5 rounded-full"
                    style={{
                        background: DIFF_COLORS[course.difficulty] + '15',
                        color: DIFF_COLORS[course.difficulty],
                    }}
                >
                    {course.difficulty.toUpperCase()}
                </span>
                <span className="text-[9px] font-mono text-truarc-muted">
                    {course.holes.length}H · Par {course.par}
                </span>
                <span className="text-[9px] font-mono text-truarc-muted/60">
                    {(course.totalDistanceFt / 1000).toFixed(1)}k ft
                </span>
            </div>

            <div className="flex flex-wrap gap-1 mt-2">
                {course.tags.slice(0, 4).map(tag => (
                    <span
                        key={tag}
                        className="text-[7px] font-mono px-1 py-0.5 rounded-full opacity-70 group-hover:opacity-100 transition-opacity"
                        style={{
                            background: (TAG_COLORS[tag] || '#8892b0') + '10',
                            color: TAG_COLORS[tag] || '#8892b0',
                        }}
                    >
                        {tag}
                    </span>
                ))}
            </div>
        </button>
    );
}

// ─── HOLE CARD ──────────────────────────────────────────────

function HoleCard({ hole, isActive, onClick }) {
    const parColor = hole.par >= 4 ? '#ff3366' : hole.par === 3 ? '#00e5ff' : '#00ff88';

    return (
        <button
            onClick={onClick}
            className={`w-full text-left px-3 py-2.5 rounded-lg transition-all group ${isActive
                    ? 'bg-truarc-accent/10 border border-truarc-accent/30'
                    : 'hover:bg-truarc-card/40 border border-transparent'
                }`}
        >
            <div className="flex items-center gap-3">
                {/* Hole Number */}
                <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-mono font-bold shrink-0 ${isActive ? 'ring-1 ring-truarc-accent/50' : ''
                        }`}
                    style={{
                        background: isActive ? '#00e5ff20' : '#1a223510',
                        color: isActive ? '#00e5ff' : '#8892b0',
                    }}
                >
                    {hole.num}
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-medium text-truarc-text">
                            {hole.distanceFt} ft
                        </span>
                        <span
                            className="text-[9px] font-mono px-1.5 py-0.5 rounded-full"
                            style={{
                                background: parColor + '15',
                                color: parColor,
                            }}
                        >
                            Par {hole.par}
                        </span>
                    </div>
                    {hole.notes && (
                        <div className="text-[10px] text-truarc-muted/70 mt-0.5 truncate">
                            {hole.notes}
                        </div>
                    )}
                </div>

                {/* Arrow */}
                <Navigation
                    size={12}
                    className={`shrink-0 transition-all ${isActive ? 'text-truarc-accent' : 'text-truarc-muted/30 group-hover:text-truarc-muted'
                        }`}
                    style={{ transform: `rotate(${hole.bearing || 0}deg)` }}
                />
            </div>
        </button>
    );
}

// ─── STAT BLOCK ─────────────────────────────────────────────

function StatBlock({ label, value, color }) {
    return (
        <div className="text-center">
            <div className="text-[9px] font-mono text-truarc-muted/60 tracking-wider">{label}</div>
            <div className="text-sm font-mono font-bold" style={{ color }}>{value}</div>
        </div>
    );
}
