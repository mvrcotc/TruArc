/**
 * Toolbar — Top command bar with mode switching
 */

import React from 'react';
import { motion } from 'framer-motion';
import {
    Crosshair,
    Ruler,
    Disc3,
    SlidersHorizontal,
    RotateCcw,
    Layers,
    Zap,
} from 'lucide-react';
import FirebaseAuthBar from './FirebaseAuthBar';
import { getEngineChoice, toggleEngineChoice } from '../physics/engineFlag';

const MODES = [
    { id: 'course', icon: Layers, label: 'Courses', shortcut: 'L' },
    { id: 'measure', icon: Ruler, label: 'Measure', shortcut: 'M' },
    { id: 'throw', icon: Disc3, label: 'Throw', shortcut: 'T' },
    { id: 'calibrate', icon: SlidersHorizontal, label: 'Calibrate', shortcut: 'C' },
];

/**
 * Section 1 A/B toggle between the 6-DOF engine and the legacy
 * pseudo-force engine, for the rollout comparison period — see
 * src/physics/engineFlag.js. Remove this button along with the flag
 * once the legacy engine is retired (docs/ACCURACY_ROADMAP.md §1).
 */
function EngineToggle() {
    const [engine, setEngine] = React.useState(getEngineChoice);
    const isSixDof = engine === 'sixdof';

    return (
        <button
            onClick={() => setEngine(toggleEngineChoice())}
            title={`Physics engine: ${isSixDof ? '6-DOF (new)' : 'Legacy'} — click to switch. Applies to the next throw.`}
            className={`flex items-center gap-1 px-2 py-1.5 rounded-md text-[10px] font-mono transition-all duration-200 ${isSixDof
                ? 'text-truarc-accent bg-truarc-accent/10 border border-truarc-accent/30'
                : 'text-truarc-warn bg-truarc-warn/10 border border-truarc-warn/30'
                }`}
        >
            <Zap size={12} />
            <span className="hidden sm:inline">{isSixDof ? '6DOF' : 'LEGACY'}</span>
        </button>
    );
}

export default function Toolbar({ mode, onModeChange, onReset }) {
    return (
        <motion.div
            initial={{ y: -60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200, delay: 0.1 }}
            className="glass-panel px-3 py-2 flex items-center gap-1"
        >
            {/* Logo */}
            <div className="flex items-center gap-2 mr-3 pr-3 border-r border-truarc-border/40">
                <Crosshair size={18} className="text-truarc-accent" />
                <span className="font-mono text-truarc-accent text-sm font-bold tracking-wider">
                    TRUARC
                </span>
            </div>

            {/* Mode Buttons */}
            {MODES.map(({ id, icon: Icon, label, shortcut }) => (
                <button
                    key={id}
                    onClick={() => onModeChange(mode === id ? 'navigate' : id)}
                    className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 ${mode === id
                        ? 'text-truarc-accent bg-truarc-accent/10 border border-truarc-accent/30'
                        : 'text-truarc-muted hover:text-truarc-text hover:bg-truarc-card/50'
                        }`}
                >
                    <Icon size={14} />
                    <span className="hidden sm:inline">{label}</span>
                    <kbd className="hidden md:inline ml-1 text-[9px] text-truarc-muted bg-truarc-bg/50 px-1 py-0.5 rounded font-mono">
                        {shortcut}
                    </kbd>
                    {mode === id && (
                        <motion.div
                            layoutId="active-mode"
                            className="absolute inset-0 rounded-md border border-truarc-accent/30"
                            style={{ background: 'rgba(0, 229, 255, 0.05)' }}
                            transition={{ type: 'spring', damping: 30, stiffness: 400 }}
                        />
                    )}
                </button>
            ))}

            {/* Spacer */}
            <div className="flex-1" />

            <EngineToggle />

            <FirebaseAuthBar />

            {/* Reset */}
            <button onClick={onReset} className="btn-ghost flex items-center gap-1">
                <RotateCcw size={13} />
            </button>
        </motion.div>
    );
}
