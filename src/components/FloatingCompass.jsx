/**
 * FloatingCompass — A 3D-aware compass that points north relative to the camera bearing.
 */

import React from 'react';

export default function FloatingCompass({ bearing, pitch }) {
    return (
        <div className="glass-panel w-12 h-12 rounded-full flex items-center justify-center relative shadow-lg">
            {/* Compass Rose */}
            <div
                className="w-full h-full absolute inset-0 transition-transform duration-75 ease-out"
                style={{ transform: `rotate(${-bearing}deg)` }}
            >
                {/* North Indicator */}
                <div className="absolute top-1 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-b-[8px] border-b-truarc-accent drop-shadow-[0_0_4px_rgba(0,229,255,0.6)]" />

                {/* South Indicator */}
                <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[8px] border-t-truarc-muted opacity-50" />

                {/* Cardinal Points */}
                <span className="absolute top-3 left-1/2 -translate-x-1/2 text-[8px] font-mono font-bold text-truarc-accent">N</span>
                <span className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[8px] font-mono font-bold text-truarc-muted">S</span>
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[8px] font-mono font-bold text-truarc-muted">E</span>
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[8px] font-mono font-bold text-truarc-muted">W</span>
            </div>

            {/* Pitch / Tilt Indicator (Inner Ring) */}
            <div
                className="w-6 h-6 rounded-full border border-truarc-border/30 absolute pointer-events-none"
                style={{
                    transform: `rotateX(${pitch}deg)`,
                    borderColor: `rgba(136, 146, 176, ${Math.min(1, pitch / 90)})`
                }}
            />

            {/* Crosshair Center */}
            <div className="w-1 h-1 bg-truarc-muted/50 rounded-full" />
        </div>
    );
}
