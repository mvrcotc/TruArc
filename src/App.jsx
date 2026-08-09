/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  TruArc — 3D Course Visualizer                                 ║
 * ║  Main Application Shell                                        ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

import React, { useState, useRef, useReducer, useCallback, useEffect } from 'react';
import { getCalibrationOffset } from './utils/calibrationOffset';
import { loadBag, saveBag, loadSelectedDisc, saveSelectedDisc } from './utils/discBag';
import { DEFAULT_THROW_SETTINGS } from './physics/throwerProfile';
import { useAuth } from './context/AuthContext';
import { holeEditReducer, createEditState, EDIT_ACTIONS } from './editor/holeEditState';
import { exportHoleEdit, importHoleEdit } from './editor/courseEditExport';
import { saveCourseEdit } from './firebase/courseEdits';

import MapCanvas from './components/MapCanvas';
import Toolbar from './components/Toolbar';
import ThrowPanel from './components/ThrowPanel';
import CalibrationPanel from './components/CalibrationPanel';
import CourseManager from './components/CourseManager';
import CourseEditorPanel from './components/CourseEditorPanel';
import FlightStats from './components/FlightStats';
import CourseSearch from './components/CourseSearch';
import FloatingCompass from './components/FloatingCompass';

export default function App() {
    const mapRef = useRef(null);

    const { user } = useAuth();

    // ─── STATE ──────────────────────────────────────────────────
    const [mode, setMode] = useState('navigate'); // navigate | measure | throw | calibrate | course | edit
    const [viewState, setViewState] = useState({ bearing: 0, pitch: 60 });
    // Shared with ThrowPanel's "Reset" button via DEFAULT_THROW_SETTINGS,
    // so Reset provably returns the player to where they started rather
    // than to a second, drifting copy of "default". Spread because the
    // exported constant is frozen and this is mutable state.
    const [throwSettings, setThrowSettings] = useState({ ...DEFAULT_THROW_SETTINGS });
    const [wind, setWind] = useState({ speed: 0, direction: 0 });
    const [measurement, setMeasurement] = useState(null);
    const [flightData, setFlightData] = useState(null);
    const [searchOpen, setSearchOpen] = useState(false);

    // Course state
    const [activeCourse, setActiveCourse] = useState(null);
    const [activeHole, setActiveHole] = useState(null);

    // Disc bag — restored from localStorage on first render. A lazy
    // initializer (not an effect) so the bag is never briefly empty
    // before being repopulated, and storage is read exactly ONCE: the
    // selection has to resolve against the same array the bag holds, not
    // a second independently-loaded copy. See src/utils/discBag.js.
    const [restored] = useState(() => {
        const bag = loadBag();
        return { bag, selected: loadSelectedDisc(bag) };
    });
    const [myBag, setMyBag] = useState(restored.bag);
    const [selectedDisc, setSelectedDisc] = useState(restored.selected);

    // Persist on change. Both store identity only, so a later correction
    // to a disc's published flight numbers reaches every saved bag.
    useEffect(() => { saveBag(myBag); }, [myBag]);
    useEffect(() => { saveSelectedDisc(selectedDisc); }, [selectedDisc]);

    // LiDAR overlay
    const [lidarEnabled, setLidarEnabled] = useState(false);
    const [trueViewEnabled, setTrueViewEnabled] = useState(false);
    const [calibrationOffset, setCalibrationOffset] = useState({ dLng: 0, dLat: 0, dElev: 0 });

    // ─── COURSE EDITOR (Section 5) ────────────────────────────────
    // The edit state's identity is tied to (courseId, holeNum) — a new
    // hole means a new reducer state, not a mutation of the last one, so
    // switching holes never leaks one hole's in-progress edit into
    // another's.
    const [editState, editDispatch] = useReducer(
        holeEditReducer,
        createEditState(activeCourse?.id ?? null, activeHole?.num ?? null),
    );
    const [editTool, setEditTool] = useState('tee');
    const [editSaving, setEditSaving] = useState(false);
    const [editSaveError, setEditSaveError] = useState(null);
    const [editSavedAt, setEditSavedAt] = useState(null);

    // Reset the edit ONLY when the (courseId, holeNum) pair actually
    // changes — not on every entry into 'edit' mode. Without the key
    // check, toggling away to 'course' mode to pick a different hole
    // and back to 'edit' for the SAME hole would silently wipe whatever
    // was placed but not yet saved.
    const editKeyRef = useRef(null);
    useEffect(() => {
        if (mode !== 'edit') return;
        const key = `${activeCourse?.id ?? ''}:${activeHole?.num ?? ''}`;
        if (editKeyRef.current === key) return;
        editKeyRef.current = key;
        editDispatch({ type: EDIT_ACTIONS.LOAD, edit: createEditState(activeCourse?.id ?? null, activeHole?.num ?? null) });
        setEditSaveError(null);
        setEditSavedAt(null);
    }, [activeCourse?.id, activeHole?.num, mode]);

    const handleEditSave = useCallback(async () => {
        if (!user) return;
        setEditSaving(true);
        setEditSaveError(null);
        try {
            await saveCourseEdit(user.uid, exportHoleEdit(editState));
            setEditSavedAt(Date.now());
        } catch (err) {
            setEditSaveError(err?.message || 'Save failed');
        } finally {
            setEditSaving(false);
        }
    }, [user, editState]);

    const handleEditExport = useCallback(() => {
        const json = JSON.stringify(exportHoleEdit(editState), null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${editState.courseId || 'course'}_hole${editState.holeNum ?? ''}_edit.json`;
        a.click();
        URL.revokeObjectURL(url);
    }, [editState]);

    const handleEditImport = useCallback(async (file) => {
        try {
            const text = await file.text();
            const imported = importHoleEdit(JSON.parse(text));
            editDispatch({ type: EDIT_ACTIONS.LOAD, edit: imported });
            setEditSaveError(null);
        } catch (err) {
            setEditSaveError(`Import failed: ${err?.message || err}`);
        }
    }, []);

    // ─── KEYBOARD SHORTCUTS ─────────────────────────────────────
    // 'edit' and 'calibrate' are deliberately NOT buttons in Toolbar.jsx
    // — they're course-setup tooling (LiDAR↔satellite alignment, placing
    // tees/baskets/OB), not something a player throwing a round should
    // see as an option. A published course is expected to already be
    // calibrated. The modes themselves, and their shortcuts here, are
    // left intact rather than deleted: someone still has to be able to
    // reach them to calibrate/edit a course in the first place (e.g. the
    // Section 5 data-entry pass), and there's no admin-role system in
    // this app to gate a visible button behind instead. So: reachable by
    // keyboard for whoever already knows to look for it, invisible to
    // everyone else.
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
                case 'e': setMode('edit'); break;
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
                editState={editState}
                editTool={editTool}
                editDispatch={editDispatch}
            />

            {/* Tactical Grid Overlay */}
            <div className="tactical-grid absolute inset-0 z-10" />

            {/* Top Toolbar */}
            <div className="absolute top-5 left-1/2 -translate-x-1/2 z-30">
                <Toolbar
                    mode={mode}
                    onModeChange={handleModeChange}
                    onReset={handleReset}

                />
            </div>

            {/* Left Panel: course browsing, the active hole's detail, and
                point-to-point measurements — "where am I / what am I
                looking at" context, as opposed to the right panel's
                "what am I about to throw" workflow. FlightStats renders
                first (top) so the active hole's tee/basket/bearing detail
                sits above the browsable course/hole list beneath it —
                current status, then drill-down. It has no mode gate of
                its own here because it already no-ops for any mode that
                isn't 'measure' or 'course' internally.
                Calibrate/Edit are always mounted (display:none when
                inactive) for the same reason DiscSelector used to be:
                mode toggling must not reset their in-progress state. They
                have no Toolbar button (see the keyboard-shortcut comment
                above) but stay reachable by their shortcuts. */}
            <div className="absolute top-[104px] left-5 z-20 pointer-events-auto flex flex-col gap-2.5 max-h-[calc(100vh-128px)] overflow-y-auto custom-scrollbar pr-0.5">
                <FlightStats
                    mode={mode}
                    measurement={measurement}
                    activeHole={activeHole}
                    activeCourse={activeCourse}
                />
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
                <div style={{ display: mode === 'edit' ? 'block' : 'none' }}>
                    <CourseEditorPanel
                        hole={activeHole}
                        editState={mode === 'edit' ? editState : null}
                        dispatch={editDispatch}
                        activeTool={editTool}
                        onToolChange={setEditTool}
                        onSave={handleEditSave}
                        saving={editSaving}
                        saveError={editSaveError}
                        savedAt={editSavedAt}
                        signedIn={!!user}
                        onExport={handleEditExport}
                        onImport={handleEditImport}
                    />
                </div>
            </div>

            {/* Right Panel: ThrowPanel is the ONE unified bar for the
                throw workflow — bag, throw settings, wind, this throw's
                results, and the selected disc's reference profile all
                live inside it now (see ThrowPanel.jsx). Always mounted
                (display:none when inactive), same reason as before:
                unmounting on every mode toggle would reset the search
                input and lose bag-search-portal position state. */}
            <div className="absolute top-[104px] right-5 z-20 pointer-events-auto">
                <div style={{ display: mode === 'throw' ? 'block' : 'none' }}>
                    <ThrowPanel
                        selectedDisc={selectedDisc}
                        onSelectDisc={setSelectedDisc}
                        myBag={myBag}
                        onBagChange={setMyBag}
                        throwSettings={throwSettings}
                        onUpdateThrow={setThrowSettings}
                        wind={wind}
                        onUpdateWind={setWind}
                        flightData={flightData}
                        onFlyToLanding={handleFlyToLanding}
                    />
                </div>
            </div>

            {/* Floating Compass (Top Right, above stats) */}
            <div className="absolute top-5 right-5 z-30 pointer-events-none">
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
        edit: 'EDT',
    };

    const modeColors = {
        navigate: '#98a1b5',
        measure: '#4cb8ff',
        throw: '#f5a65b',
        calibrate: '#34d399',
        course: '#a78bfa',
        edit: '#ff6b7a',
    };

    return (
        <>
            {/* Top-Left Corner */}
            <div className="absolute top-5 left-5 z-10 pointer-events-none">
                <div className="w-7 h-7 border-l border-t rounded-tl-md" style={{ borderColor: modeColors[mode] + '2e' }} />
            </div>

            {/* Top-Right Corner - Replaced by Compass, but keeping border style for consistency if desired. 
                Actually, let's keep the Mode Label as it's useful. I'll offset it slightly or just let them coexist. 
                The compass is absolute top-4 right-4. The corner indicator is also top-4 right-4.
                I will move the mode label down slightly.
            */}


            {/* Bottom-Left Corner. No bottom-RIGHT bracket: Mapbox's
                attribution bar lives there and the two collided. */}
            <div className="absolute bottom-5 left-5 z-10 pointer-events-none">
                <div className="w-7 h-7 border-l border-b rounded-bl-md" style={{ borderColor: modeColors[mode] + '2e' }} />
                {/* Mode label lives here, not top-right: it used to sit
                    directly under the compass and collided with its
                    heading badge. */}
                <div className="mt-1.5 flex items-baseline gap-2">
                    <span className="font-mono text-micro tracking-[0.28em] opacity-70" style={{ color: modeColors[mode] }}>
                        {modeLabels[mode]}
                    </span>
                    <span className="font-mono text-micro text-truarc-muted/30">EPSG:4326</span>
                </div>
            </div>
        </>
    );
}
