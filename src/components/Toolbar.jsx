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
    MapPin,
    RotateCcw,
    Search,
} from 'lucide-react';

const MODES = [
    { id: 'navigate', icon: MapPin, label: 'Navigate', shortcut: 'N' },
    { id: 'measure', icon: Ruler, label: 'Measure', shortcut: 'M' },
    { id: 'throw', icon: Disc3, label: 'Throw', shortcut: 'T' },
    { id: 'calibrate', icon: SlidersHorizontal, label: 'Calibrate', shortcut: 'C' },
];

export default function Toolbar({ mode, onModeChange, onReset, onSearch }) {
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
                    onClick={() => onModeChange(id)}
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

            {/* Search */}
            <button
                onClick={onSearch}
                className="btn-ghost flex items-center gap-1.5"
            >
                <Search size={14} />
                <span className="hidden sm:inline">Search Course</span>
            </button>

            {/* Reset */}
            <button onClick={onReset} className="btn-ghost flex items-center gap-1">
                <RotateCcw size={13} />
            </button>
        </motion.div>
    );
}
