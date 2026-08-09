/**
 * Toolbar — Top command bar with mode switching
 */

import React from 'react';
import { motion } from 'framer-motion';
import {
    Crosshair,
    Ruler,
    Disc3,
    RotateCcw,
    Layers,
    Zap,
} from 'lucide-react';
import FirebaseAuthBar from './FirebaseAuthBar';
import { getEngineChoice, toggleEngineChoice } from '../physics/engineFlag';

// 'edit' (course-geometry editor) and 'calibrate' (LiDAR↔satellite
// alignment) are deliberately absent from this list — they're
// course-setup tooling for whoever maintains a course's data, not
// something every player should see as a mode alongside "throw" or
// "measure". A published course is expected to already be calibrated.
// Both modes still exist and are reachable by their keyboard shortcuts
// (App.jsx) for whoever needs them; see that file's comment for why
// they weren't deleted outright.
const MODES = [
    { id: 'course', icon: Layers, label: 'Courses', shortcut: 'L' },
    { id: 'measure', icon: Ruler, label: 'Measure', shortcut: 'M' },
    { id: 'throw', icon: Disc3, label: 'Throw', shortcut: 'T' },
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
            className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-micro font-mono transition-all duration-150 border active:scale-[0.97] ${isSixDof
                ? 'text-truarc-accent/90 bg-truarc-accent/[0.08] border-transparent'
                : 'text-truarc-warn/90 bg-truarc-warn/[0.08] border-transparent'
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
            initial={{ y: -12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="glass-panel px-3 py-2 flex items-center gap-1"
        >
            {/* Logo */}
            <div className="flex items-center gap-2 mr-3 pr-3 border-r border-white/[0.07]">
                <Crosshair size={17} className="text-truarc-accent" />
                <span className="font-mono text-truarc-text text-sm font-bold tracking-[0.14em]">
                    TRUARC
                </span>
            </div>

            {/* Mode Buttons — the morphing pill IS the active state; text
                color is the only other change. No competing borders. */}
            {MODES.map(({ id, icon: Icon, label, shortcut }) => (
                <button
                    key={id}
                    onClick={() => onModeChange(mode === id ? 'navigate' : id)}
                    className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors duration-150 ${mode === id
                        ? 'text-truarc-accent'
                        : 'text-truarc-muted hover:text-truarc-text'
                        }`}
                >
                    {mode === id && (
                        <motion.div
                            layoutId="active-mode"
                            className="absolute inset-0 rounded-lg bg-truarc-accent/[0.11]"
                            transition={{ type: 'spring', damping: 32, stiffness: 420 }}
                        />
                    )}
                    <Icon size={14} className="relative" />
                    <span className="hidden sm:inline relative">{label}</span>
                    <kbd className="hidden md:inline relative ml-0.5 text-micro text-truarc-muted/45 font-mono">
                        {shortcut}
                    </kbd>
                </button>
            ))}

            {/* Spacer */}
            <div className="flex-1" />

            <EngineToggle />

            <FirebaseAuthBar />

            {/* Reset */}
            <button onClick={onReset} className="btn-ghost flex items-center gap-1" title="Clear flight path & measurement">
                <RotateCcw size={13} />
            </button>
        </motion.div>
    );
}
