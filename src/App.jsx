/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  TruArc — 3D Course Visualizer                                 ║
 * ║  Main Application Shell                                        ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { getCalibrationOffset } from './utils/calibrationOffset';

import MapCanvas from './components/MapCanvas';
import Toolbar from './components/Toolbar';
import DiscSelector from './components/DiscSelector';
import CalibrationPanel from './components/CalibrationPanel';
import CourseManager from './components/CourseManager';
import FlightStats from './components/FlightStats';
import CourseSearch from './components/CourseSearch';
import FloatingCompass from './components/FloatingCompass';

export default function App() {
    const mapRef = useRef(null);

    // ─── STATE ──────────────────────────────────────────────────
    const [mode, setMode] = useState('navigate'); // navigate | measure | throw | calibrate | course
    const [selectedDisc, setSelectedDisc] = useState(null);
    const [viewState, setViewState] = useState({ bearing: 0, pitch: 60 });
    const [throwSettings, setThrowSettings] = useState({
        power: 80,
        aimAngle: 0,
        releaseAngle: 0,
        noseAngle: 2,
    });
    const [wind, setWind] = useState({ speed: 0, direction: 0 });
    const [measurement, setMeasurement] = useState(null);
    const [flightData, setFlightData] = useState(null);
    const [searchOpen, setSearchOpen] = useState(false);

    // Course state
    const [activeCourse, setActiveCourse] = useState(null);
    const [activeHole, setActiveHole] = useState(null);

    // Disc bag
    const [myBag, setMyBag] = useState([]);

    // LiDAR overlay
    const [lidarEnabled, setLidarEnabled] = useState(false);
    const [trueViewEnabled, setTrueViewEnabled] = useState(false);
    const [calibrationOffset, setCalibrationOffset] = useState({ dLng: 0, dLat: 0, dElev: 0 });

    // ─── KEYBOARD SHORTCUTS ─────────────────────────────────────
    useEffect(() => {
        const handleKey = (e) => {
            // Don't intercept when typing in inputs
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            switch (e.key.toLowerCase()) {
                case 'n': setMode('navigate'); break;
                case 'm': setMode('measure'); break;
                case 't': setMode('throw'); break;
                case 'c': setMode('calibrate'); break;
                case 'l': setMode('course'); break;
                case '/':
                case 'k':
                    if (e.metaKey || e.ctrlKey) {
                        e.preventDefault();
                        setSearchOpen(true);
                    }
                    break;
                case 'escape':
                    setSearchOpen(false);
                    setMode('navigate');
                    break;
                case 'arrowleft':
                    if (mode === 'course' && activeCourse && activeHole) {
                        const prevNum = activeHole.num > 1 ? activeHole.num - 1 : activeCourse.holes.length;
                        const hole = activeCourse.holes.find(h => h.num === prevNum);
                        if (hole) handleSelectHole(hole, activeCourse);
                    }
                    break;
                case 'arrowright':
                    if (mode === 'course' && activeCourse && activeHole) {
                        const nextNum = activeHole.num < activeCourse.holes.length ? activeHole.num + 1 : 1;
                        const hole = activeCourse.holes.find(h => h.num === nextNum);
                        if (hole) handleSelectHole(hole, activeCourse);
                    }
                    break;
            }
        };

        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [mode, activeCourse, activeHole]);

    // ─── HANDLERS ───────────────────────────────────────────────
    const handleModeChange = useCallback((newMode) => {
        setMode(newMode);
        if (newMode !== 'measure') setMeasurement(null);
        if (newMode !== 'throw') setFlightData(null);
    }, []);

    const handleReset = useCallback(() => {
        setMeasurement(null);
        setFlightData(null);
        mapRef.current?.clearFlightPath();
        mapRef.current?.clearMeasurement();
    }, []);

    const handleMeasure = useCallback((data) => {
        setMeasurement(data);
    }, []);

    const handleFlightComplete = useCallback((data) => {
        setFlightData(data);
    }, []);

    const handleSelectCourse = useCallback((course) => {
        setActiveCourse(course);
        setActiveHole(null);
        mapRef.current?.drawCourseLayout(course);
    }, []);

    const handleSelectHole = useCallback((hole, course) => {
        setActiveHole(hole);
        if (course) setActiveCourse(course);
        mapRef.current?.highlightHole(hole);
    }, []);

    const handleFlyTo = useCallback((lng, lat, zoom) => {
        mapRef.current?.flyTo(lng, lat, zoom);
    }, []);

    const handleStandOnTee = useCallback((hole) => {
        mapRef.current?.standOnTee?.(hole);
    }, []);

    const handleFlyToLanding = useCallback(() => {
        if (!flightData?.landing) return;
        const lookAt = activeHole?.basket || null;
        mapRef.current?.flyToLanding?.(flightData.landing, lookAt);
    }, [flightData?.landing, activeHole?.basket]);

    const handleSelectCourseFromSearch = useCallback((course) => {
        mapRef.current?.flyTo(course.lng, course.lat, course.zoom || 17);
    }, []);

    const handleCalibrationOffset = useCallback((offset) => {
        setCalibrationOffset(offset || { dLng: 0, dLat: 0, dElev: 0 });
    }, []);

    // Sync calibration offset when opening calibrate mode or changing course
    useEffect(() => {
        const courseId = activeCourse?.id || 'default';
        setCalibrationOffset(getCalibrationOffset(courseId));
    }, [mode, activeCourse?.id]);

    const handleMapMove = useCallback(({ bearing, pitch }) => {
        setViewState({ bearing, pitch });
    }, []);

    // ─── RENDER ─────────────────────────────────────────────────
    return (
        <div className="relative w-screen h-screen bg-truarc-bg overflow-hidden">
            {/* 3D Map (Full viewport) */}
            <MapCanvas
                ref={mapRef}
                mode={mode}
                selectedDisc={selectedDisc}
                throwSettings={throwSettings}
                wind={wind}
                onMeasure={handleMeasure}
                onFlightComplete={handleFlightComplete}
                onMove={handleMapMove}
                activeCourse={activeCourse}
                activeHole={activeHole}
                lidarEnabled={lidarEnabled}
                trueViewEnabled={trueViewEnabled}
                calibrationOffset={calibrationOffset}
            />

            {/* Tactical Grid Overlay */}
            <div className="tactical-grid absolute inset-0 z-10" />

            {/* Top Toolbar */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30">
                <Toolbar
                    mode={mode}
                    onModeChange={handleModeChange}
                    onReset={handleReset}

                />
            </div>

            {/* Left Panel: Always mount all panels (use visibility) so DiscSelector never unmounts - fixes search bug */}
            <div className="absolute top-24 left-4 z-20 pointer-events-auto">
                <div style={{ display: mode === 'throw' ? 'block' : 'none' }}>
                    <DiscSelector
                        selectedDisc={selectedDisc}
                        onSelectDisc={setSelectedDisc}
                        myBag={myBag}
                        onBagChange={setMyBag}
                        throwSettings={throwSettings}
                        onUpdateThrow={setThrowSettings}
                        wind={wind}
                        onUpdateWind={setWind}
                    />
                </div>
                <div style={{ display: mode === 'calibrate' ? 'block' : 'none' }}>
                    <CalibrationPanel
                        courseId={activeCourse?.id || 'default'}
                        onOffsetChange={handleCalibrationOffset}
                        lidarEnabled={lidarEnabled}
                        onLidarToggle={setLidarEnabled}
                        trueViewEnabled={trueViewEnabled}
                        onTrueViewToggle={setTrueViewEnabled}
                    />
                </div>
                <div style={{ display: mode === 'course' ? 'block' : 'none' }}>
                    <CourseManager
                        onSelectCourse={handleSelectCourse}
                        onSelectHole={handleSelectHole}
                        onFlyToLocation={handleFlyTo}
                        onStandOnTee={handleStandOnTee}
                        activeCourseId={activeCourse?.id}
                        activeHoleNum={activeHole?.num}
                    />
                </div>
            </div>

            {/* Top Right: Stats (measure/flight/course) - out of direct view */}
            <div className="absolute top-16 right-4 z-20 flex flex-col gap-2">
                <FlightStats
                    mode={mode}
                    flightData={flightData}
                    measurement={measurement}
                    activeHole={activeHole}
                    activeCourse={activeCourse}
                    onFlyToLanding={handleFlyToLanding}
                />
            </div>

            {/* Floating Compass (Top Right, above stats) */}
            <div className="absolute top-4 right-4 z-30 pointer-events-none">
                <FloatingCompass bearing={viewState.bearing} pitch={viewState.pitch} />
            </div>

            {/* Mode Indicator Corners */}
            <CornerIndicators mode={mode} />

            {/* Course Search Modal */}
            <CourseSearch
                isOpen={searchOpen}
                onClose={() => setSearchOpen(false)}
                onSelectCourse={handleSelectCourseFromSearch}
            />
        </div>
    );
}

// ─── CORNER INDICATORS ─────────────────────────────────────

function CornerIndicators({ mode }) {
    const modeLabels = {
        navigate: 'NAV',
        measure: 'MSR',
        throw: 'THR',
        calibrate: 'CAL',
        course: 'CRS',
    };

    const modeColors = {
        navigate: '#8892b0',
        measure: '#00e5ff',
        throw: '#ff6b35',
        calibrate: '#00ff88',
        course: '#aa66ff',
    };

    return (
        <>
            {/* Top-Left Corner */}
            <div className="absolute top-4 left-4 z-10 pointer-events-none">
                <div className="w-8 h-8 border-l-2 border-t-2 rounded-tl-sm" style={{ borderColor: modeColors[mode] + '30' }} />
            </div>

            {/* Top-Right Corner - Replaced by Compass, but keeping border style for consistency if desired. 
                Actually, let's keep the Mode Label as it's useful. I'll offset it slightly or just let them coexist. 
                The compass is absolute top-4 right-4. The corner indicator is also top-4 right-4.
                I will move the mode label down slightly.
            */}
            <div className="absolute top-16 right-4 z-10 pointer-events-none flex flex-col items-end gap-1">
                <div
                    className="font-mono text-[10px] tracking-[0.3em] mr-1 opacity-50"
                    style={{ color: modeColors[mode] }}
                >
                    {modeLabels[mode]}
                </div>
            </div>

            {/* Bottom-Left Corner */}
            <div className="absolute bottom-4 left-4 z-10 pointer-events-none">
                <div className="w-8 h-8 border-l-2 border-b-2 rounded-bl-sm" style={{ borderColor: modeColors[mode] + '30' }} />
                <div className="font-mono text-[9px] text-truarc-muted/40 mt-1">
                    EPSG:4326
                </div>
            </div>

            {/* Bottom-Right Corner */}
            <div className="absolute bottom-4 right-4 z-10 pointer-events-none">
                <div className="w-8 h-8 border-r-2 border-b-2 rounded-br-sm" style={{ borderColor: modeColors[mode] + '30' }} />
            </div>
        </>
    );
}
