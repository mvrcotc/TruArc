/**
 * FloatingCompass — A 3D-aware compass that points north relative to the
 * camera bearing, with a numeric heading readout.
 *
 * Enlarged from 48px to 60px in the soft-premium pass: at 48 the cardinal
 * letters rendered at 8px, below the readable floor, and the pitch ring
 * was invisible. It also now shows the bearing as a number — a compass
 * you have to eyeball is decoration; one you can read is an instrument.
 */

import React from 'react';

export default function FloatingCompass({ bearing, pitch }) {
    const heading = Math.round(((bearing % 360) + 360) % 360);

    return (
        <div className="flex flex-col items-center gap-1">
            <div className="glass-panel w-[60px] h-[60px] rounded-full flex items-center justify-center relative">
                {/* Rotating rose */}
                <div
                    className="w-full h-full absolute inset-0 transition-transform duration-100 ease-out"
                    style={{ transform: `rotate(${-bearing}deg)` }}
                >
                    {/* North Indicator */}
                    <div className="absolute top-[5px] left-1/2 -translate-x-1/2 w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-b-[9px] border-b-truarc-accent" />

                    {/* South Indicator */}
                    <div className="absolute bottom-[5px] left-1/2 -translate-x-1/2 w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[9px] border-t-truarc-muted/40" />

                    {/* Only N is lettered. E/W/S were unreadable at this
                        size and fought the pitch ring for the same pixels;
                        the numeric heading below carries the precision. */}
                    <span className="absolute top-[16px] left-1/2 -translate-x-1/2 text-micro font-semibold text-truarc-accent">N</span>
                </div>

                {/* Pitch / tilt ring — opacity tracks how oblique the camera is */}
                <div
                    className="w-6 h-6 rounded-full border absolute pointer-events-none transition-colors"
                    style={{
                        transform: `rotateX(${pitch}deg)`,
                        borderColor: `rgba(152, 161, 181, ${0.15 + Math.min(0.5, pitch / 180)})`,
                    }}
                />

                {/* Center */}
                <div className="w-1 h-1 bg-truarc-muted/60 rounded-full" />
            </div>

            {/* Numeric heading */}
            <div className="font-mono text-micro text-truarc-muted/70 tabular-nums px-1.5 py-0.5 rounded-md bg-truarc-card/70 backdrop-blur-sm">
                {String(heading).padStart(3, '0')}°
            </div>
        </div>
    );
}
