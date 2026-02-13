/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  TruArc — 3D Course Visualizer                                 ║
 * ║  Main Application Shell                                        ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';

import MapCanvas from './components/MapCanvas';
import Toolbar from './components/Toolbar';
import DiscSelector from './components/DiscSelector';
import FlightStats from './components/FlightStats';
import CalibrationPanel from './components/CalibrationPanel';
import CourseSearch from './components/CourseSearch';

export default function App() {
    const mapRef = useRef(null);

    // ─── STATE ──────────────────────────────────────────────────
    const [mode, setMode] = useState('navigate'); // navigate | measure | throw | calibrate
    const [selectedDisc, setSelectedDisc] = useState(null);
    const [throwSettings, setThrowSettings] = useState({
        power: 80,
        aimAngle: 0,
        releaseAngle: 0,
        noseAngle: 12,
    });
    const [wind, setWind] = useState({ speed: 0, direction: 0 });
    const [measurement, setMeasurement] = useState(null);
    const [flightData, setFlightData] = useState(null);
    const [searchOpen, setSearchOpen] = useState(false);

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
            }
        };

        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, []);

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
        mapRef.current?.flyTo(course.lng, course.lat, course.zoom || 17);
    }, []);

    const handleCalibrationOffset = useCallback((offset) => {
        // Will push offset to map layer when LiDAR tileset is loaded
        console.log('Calibration offset updated:', offset);
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
            />

            {/* Tactical Grid Overlay */}
            <div className="tactical-grid absolute inset-0 z-10" />

            {/* Top Toolbar */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30">
                <Toolbar
                    mode={mode}
                    onModeChange={handleModeChange}
                    onReset={handleReset}
                    onSearch={() => setSearchOpen(true)}
                />
            </div>

            {/* Left Panel: Disc Selector or Calibration */}
            <div className="absolute top-24 left-4 z-20">
                <AnimatePresence mode="wait">
                    {mode === 'throw' && (
                        <DiscSelector
                            key="disc-selector"
                            selectedDisc={selectedDisc}
                            onSelectDisc={setSelectedDisc}
                            throwSettings={throwSettings}
                            onUpdateThrow={setThrowSettings}
                            wind={wind}
                            onUpdateWind={setWind}
                        />
                    )}
                    {mode === 'calibrate' && (
                        <CalibrationPanel
                            key="calibration"
                            courseId="default"
                            onOffsetChange={handleCalibrationOffset}
                        />
                    )}
                </AnimatePresence>
            </div>

            {/* Bottom Center: Stats Display */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20">
                <FlightStats
                    mode={mode}
                    flightData={flightData}
                    measurement={measurement}
                />
            </div>

            {/* Mode Indicator Corners */}
            <CornerIndicators mode={mode} />

            {/* Course Search Modal */}
            <CourseSearch
                isOpen={searchOpen}
                onClose={() => setSearchOpen(false)}
                onSelectCourse={handleSelectCourse}
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
    };

    const modeColors = {
        navigate: '#8892b0',
        measure: '#00e5ff',
        throw: '#ff6b35',
        calibrate: '#00ff88',
    };

    return (
        <>
            {/* Top-Left Corner */}
            <div className="absolute top-4 left-4 z-10 pointer-events-none">
                <div className="w-8 h-8 border-l-2 border-t-2 rounded-tl-sm" style={{ borderColor: modeColors[mode] + '30' }} />
            </div>

            {/* Top-Right Corner */}
            <div className="absolute top-4 right-4 z-10 pointer-events-none flex flex-col items-end gap-1">
                <div className="w-8 h-8 border-r-2 border-t-2 rounded-tr-sm" style={{ borderColor: modeColors[mode] + '30' }} />
                <div
                    className="font-mono text-[10px] tracking-[0.3em] mr-1"
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
