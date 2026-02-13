/**
 * CalibrationPanel — Manual LiDAR ↔ Satellite alignment nudge
 */

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { SlidersHorizontal, ArrowLeft, ArrowRight, ArrowUp, ArrowDown, RotateCcw } from 'lucide-react';
import {
    getCalibrationOffset,
    setCalibrationOffset,
    nudgeOffset,
} from '../utils/calibrationOffset';

export default function CalibrationPanel({ courseId = 'default', onOffsetChange }) {
    const [offset, setOffset] = useState({ dLng: 0, dLat: 0, dElev: 0 });
    const [stepSize, setStepSize] = useState(1); // meters

    useEffect(() => {
        const stored = getCalibrationOffset(courseId);
        setOffset(stored);
    }, [courseId]);

    function handleNudge(axis, direction) {
        const newOffset = nudgeOffset(offset, axis, stepSize * direction, 40);
        setOffset(newOffset);
        setCalibrationOffset(courseId, newOffset);
        onOffsetChange?.(newOffset);
    }

    function handleReset() {
        const zero = { dLng: 0, dLat: 0, dElev: 0 };
        setOffset(zero);
        setCalibrationOffset(courseId, zero);
        onOffsetChange?.(zero);
    }

    return (
        <motion.div
            initial={{ x: -320, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -320, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="glass-panel w-[280px] p-4"
        >
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <SlidersHorizontal size={14} className="text-truarc-warn" />
                    <span className="cad-text text-xs">LiDAR Calibration</span>
                </div>
                <button onClick={handleReset} className="btn-ghost flex items-center gap-1">
                    <RotateCcw size={12} />
                    <span className="text-[10px]">Reset</span>
                </button>
            </div>

            <p className="text-[11px] text-truarc-muted mb-3 leading-relaxed">
                Use arrow buttons to nudge the LiDAR overlay to align with satellite imagery.
            </p>

            {/* Step Size */}
            <div className="flex items-center gap-2 mb-3">
                <span className="cad-label flex-1">Step Size</span>
                <div className="flex gap-1">
                    {[0.1, 0.5, 1, 5].map((s) => (
                        <button
                            key={s}
                            onClick={() => setStepSize(s)}
                            className={`px-2 py-0.5 rounded text-[10px] font-mono transition-all ${stepSize === s
                                    ? 'bg-truarc-accent/20 text-truarc-accent border border-truarc-accent/30'
                                    : 'text-truarc-muted hover:text-truarc-text bg-truarc-bg/50'
                                }`}
                        >
                            {s}m
                        </button>
                    ))}
                </div>
            </div>

            {/* D-Pad for Lat/Lng */}
            <div className="flex flex-col items-center gap-1 mb-3">
                <span className="cad-label mb-1">Horizontal Position</span>
                <div className="grid grid-cols-3 gap-1">
                    <div />
                    <NudgeButton icon={<ArrowUp size={14} />} onClick={() => handleNudge('lat', 1)} label="N" />
                    <div />
                    <NudgeButton icon={<ArrowLeft size={14} />} onClick={() => handleNudge('lng', -1)} label="W" />
                    <div className="w-9 h-9 rounded-md bg-truarc-bg/40 border border-truarc-border/20 flex items-center justify-center">
                        <span className="text-[8px] font-mono text-truarc-muted">±{stepSize}m</span>
                    </div>
                    <NudgeButton icon={<ArrowRight size={14} />} onClick={() => handleNudge('lng', 1)} label="E" />
                    <div />
                    <NudgeButton icon={<ArrowDown size={14} />} onClick={() => handleNudge('lat', -1)} label="S" />
                    <div />
                </div>
            </div>

            {/* Elevation */}
            <div className="flex items-center gap-2 mb-3">
                <span className="cad-label flex-1">Elevation</span>
                <NudgeButton icon={<ArrowDown size={12} />} onClick={() => handleNudge('elev', -1)} small />
                <NudgeButton icon={<ArrowUp size={12} />} onClick={() => handleNudge('elev', 1)} small />
            </div>

            {/* Current Offset Values */}
            <div className="cad-divider" />
            <div className="grid grid-cols-3 gap-2 mt-2">
                <OffsetValue label="ΔLng" value={offset.dLng} precision={8} />
                <OffsetValue label="ΔLat" value={offset.dLat} precision={8} />
                <OffsetValue label="ΔElev" value={offset.dElev} precision={2} unit="m" />
            </div>
        </motion.div>
    );
}

function NudgeButton({ icon, onClick, label, small }) {
    return (
        <button
            onClick={onClick}
            className={`${small ? 'w-7 h-7' : 'w-9 h-9'} rounded-md bg-truarc-card/60 border border-truarc-border/40 
        flex items-center justify-center text-truarc-muted hover:text-truarc-accent 
        hover:border-truarc-accent/40 hover:bg-truarc-accent/5 transition-all active:scale-90`}
            title={label}
        >
            {icon}
        </button>
    );
}

function OffsetValue({ label, value, precision, unit = '°' }) {
    return (
        <div>
            <div className="cad-label">{label}</div>
            <div className="font-mono text-[10px] text-truarc-text tabular-nums">
                {value >= 0 ? '+' : ''}{value.toFixed(precision)}{unit}
            </div>
        </div>
    );
}
