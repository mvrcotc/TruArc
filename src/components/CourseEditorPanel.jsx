/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  CourseEditorPanel — In-App Course Editor (Section 5)            ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Controls for MapCanvas.jsx's 'edit' mode: pick what a map click
 * places (tee/basket/OB vertex/mando/dropzone), review what's been
 * placed so far, undo/reset, save a draft to Firestore, and
 * export/import JSON. All the actual edit STATE lives in App.jsx's
 * holeEditReducer (src/editor/holeEditState.js) — this component only
 * dispatches actions and renders what it's given, so its own logic is
 * thin enough that the reducer's own test suite is what actually
 * verifies correctness here.
 *
 * NOT visually verified — no Mapbox token in this environment to click
 * through the real interaction (same standing gap as Sections 3/4).
 */
import React from 'react';
import { motion } from 'framer-motion';
import {
    MapPin, Flag, Ban, CornerDownRight, Target, Undo2, RotateCcw,
    Download, Upload, Save, Info,
} from 'lucide-react';
import { EDIT_ACTIONS } from '../editor/holeEditState';

const TOOLS = [
    { id: 'tee', label: 'Tee', icon: Flag, color: '#a78bfa' },
    { id: 'basket', label: 'Basket', icon: Target, color: '#34d399' },
    { id: 'ob', label: 'OB Vertex', icon: Ban, color: '#ff6b7a' },
    { id: 'mando-left', label: 'Mando ←', icon: CornerDownRight, color: '#f5a65b' },
    { id: 'mando-right', label: 'Mando →', icon: CornerDownRight, color: '#f5a65b' },
    { id: 'dropzone', label: 'Dropzone', icon: MapPin, color: '#4cb8ff' },
];

export default function CourseEditorPanel({
    hole,
    editState,
    dispatch,
    activeTool,
    onToolChange,
    onSave,
    saving,
    saveError,
    savedAt,
    signedIn,
    onExport,
    onImport,
}) {
    if (!hole || !editState) {
        return (
            <motion.div
                initial={{ x: -320, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -320, opacity: 0 }}
                className="glass-panel w-[280px] p-4"
            >
                <div className="flex items-center gap-2 mb-2">
                    <MapPin size={14} className="text-truarc-accent" />
                    <span className="cad-text text-xs">Course Editor</span>
                </div>
                <p className="text-label text-truarc-muted leading-relaxed">
                    Select a course and hole (Courses panel) to start editing.
                </p>
            </motion.div>
        );
    }

    const bothPlaced = !!(editState.tee && editState.basket);
    const drawingOb = !!editState.activePolygon;

    return (
        <motion.div
            initial={{ x: -320, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -320, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="glass-panel w-[280px] p-4 max-h-[calc(100vh-140px)] overflow-y-auto custom-scrollbar"
        >
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <MapPin size={14} className="text-truarc-accent" />
                    <span className="cad-text text-xs">Editing Hole {editState.holeNum}</span>
                </div>
                <span
                    className="text-micro font-mono font-bold px-2 py-0.5 rounded-full"
                    style={{
                        background: bothPlaced ? '#34d39915' : '#f5a65b15',
                        color: bothPlaced ? '#34d399' : '#f5a65b',
                    }}
                    title={bothPlaced ? 'Saving will mark this basket as measured' : 'Place both a tee and a basket to mark this hole measured'}
                >
                    {bothPlaced ? 'MEASURED' : 'INCOMPLETE'}
                </span>
            </div>

            {drawingOb && (
                <div className="mb-3 p-2 rounded-lg bg-truarc-warn/10 border border-truarc-warn/30 text-micro text-truarc-warn">
                    Drawing OB polygon — {editState.activePolygon.length} vertex(es). Click the map to add more.
                </div>
            )}

            {/* Tool selector */}
            <div className="cad-label mb-1.5">Placement Tool</div>
            <div className="grid grid-cols-2 gap-1.5 mb-3">
                {TOOLS.map(({ id, label, icon: Icon, color }) => (
                    <button
                        key={id}
                        onClick={() => {
                            onToolChange(id);
                            if (id === 'ob' && !drawingOb) dispatch({ type: EDIT_ACTIONS.START_OB_POLYGON });
                        }}
                        className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-micro font-mono transition-all ${activeTool === id
                            ? 'border'
                            : 'text-truarc-muted hover:text-truarc-text bg-white/[0.03] border border-transparent'
                            }`}
                        style={activeTool === id ? { background: `${color}15`, color, borderColor: `${color}40` } : undefined}
                    >
                        <Icon size={12} />
                        {label}
                    </button>
                ))}
            </div>

            {drawingOb && (
                <div className="flex gap-1.5 mb-3">
                    <button
                        onClick={() => dispatch({ type: EDIT_ACTIONS.FINISH_OB_POLYGON })}
                        disabled={editState.activePolygon.length < 3}
                        className="flex-1 py-1.5 rounded-lg bg-truarc-accent/20 border border-truarc-accent/40 text-truarc-accent text-micro font-mono font-bold hover:bg-truarc-accent/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                        Finish Polygon
                    </button>
                    <button
                        onClick={() => dispatch({ type: EDIT_ACTIONS.CANCEL_OB_POLYGON })}
                        className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.07] text-truarc-muted text-micro font-mono hover:text-truarc-text transition-colors"
                    >
                        Cancel
                    </button>
                </div>
            )}

            {/* Placed features */}
            <FeatureList
                label={`OB Polygons (${editState.obPolygons.length})`}
                items={editState.obPolygons}
                renderLabel={(_, i) => `Polygon ${i + 1} (${editState.obPolygons[i].length} pts)`}
                onRemove={(i) => dispatch({ type: EDIT_ACTIONS.REMOVE_OB_POLYGON, index: i })}
            />
            <FeatureList
                label={`Mandos (${editState.mandos.length})`}
                items={editState.mandos}
                renderLabel={(m) => `Mando (${m.direction})`}
                onRemove={(i) => dispatch({ type: EDIT_ACTIONS.REMOVE_MANDO, index: i })}
            />
            <FeatureList
                label={`Dropzones (${editState.dropzones.length})`}
                items={editState.dropzones}
                renderLabel={(_, i) => `Dropzone ${i + 1}`}
                onRemove={(i) => dispatch({ type: EDIT_ACTIONS.REMOVE_DROPZONE, index: i })}
            />

            {/* Undo / Reset */}
            <div className="flex gap-1.5 mt-2 mb-3">
                <button
                    onClick={() => dispatch({ type: EDIT_ACTIONS.UNDO })}
                    disabled={editState.history.length === 0}
                    className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.07] text-truarc-muted text-micro font-mono hover:text-truarc-text disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                    <Undo2 size={11} /> Undo
                </button>
                <button
                    onClick={() => dispatch({ type: EDIT_ACTIONS.RESET })}
                    className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.07] text-truarc-muted text-micro font-mono hover:text-truarc-warn transition-colors"
                >
                    <RotateCcw size={11} /> Reset
                </button>
            </div>

            <div className="cad-divider mb-2" />

            {/* Save / Export / Import */}
            <button
                onClick={onSave}
                disabled={saving || !signedIn}
                title={!signedIn ? 'Sign in to save a draft' : undefined}
                className="w-full flex items-center justify-center gap-1.5 py-2 mb-2 rounded-lg bg-truarc-accent/20 border border-truarc-accent/40 text-truarc-accent text-label font-mono font-bold hover:bg-truarc-accent/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
                <Save size={12} />
                {saving ? 'Saving…' : 'Save Draft'}
            </button>
            {saveError && (
                <div className="text-micro text-truarc-warn mb-2 flex items-start gap-1">
                    <Info size={10} className="mt-0.5 shrink-0" />
                    {saveError}
                </div>
            )}
            {savedAt && !saveError && (
                <div className="text-micro text-truarc-muted/70 mb-2">Saved {new Date(savedAt).toLocaleTimeString()}</div>
            )}

            <div className="flex gap-1.5">
                <button
                    onClick={onExport}
                    className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.07] text-truarc-muted text-micro font-mono hover:text-truarc-text transition-colors"
                >
                    <Download size={11} /> Export
                </button>
                <label className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.07] text-truarc-muted text-micro font-mono hover:text-truarc-text transition-colors cursor-pointer">
                    <Upload size={11} /> Import
                    <input
                        type="file"
                        accept="application/json"
                        className="hidden"
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) onImport(file);
                            e.target.value = '';
                        }}
                    />
                </label>
            </div>

            <p className="text-micro text-truarc-muted/60 leading-relaxed mt-3">
                "Save Draft" writes to your own Firestore profile — it does not
                change the shared course database. Export the JSON to share it.
            </p>
        </motion.div>
    );
}

function FeatureList({ label, items, renderLabel, onRemove }) {
    if (items.length === 0) return null;
    return (
        <div className="mb-2">
            <div className="cad-label mb-1">{label}</div>
            <div className="flex flex-col gap-1">
                {items.map((item, i) => (
                    <div
                        key={i}
                        className="flex items-center justify-between px-2 py-1 rounded bg-white/[0.03] text-micro text-truarc-muted font-mono"
                    >
                        <span>{renderLabel(item, i)}</span>
                        <button onClick={() => onRemove(i)} className="text-truarc-muted/60 hover:text-truarc-warn transition-colors">
                            ×
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}
