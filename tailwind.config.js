/** @type {import('tailwindcss').Config} */
//
// Design tokens — "soft premium" pass. One accent, muted semantics,
// layered elevation. The neon palette (#00e5ff / #00ff88 / #ff3366) is
// retired from UI chrome; map-layer colors stay vivid in MapCanvas
// because visibility over satellite imagery is functional, not styling.
export default {
    content: ['./index.html', './src/**/*.{js,jsx}'],
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                truarc: {
                    bg: '#0b0d12',       // near-black, blue cast
                    surface: '#12151d',  // elevated ground (dropdowns, inputs)
                    card: '#151924',     // panel fill (under blur)
                    border: '#252b3a',   // hairlines at /40–/60
                    accent: '#4cb8ff',   // the one accent — softened sky
                    glow: '#4cb8ff',
                    green: '#34d399',    // success / downhill
                    warn: '#f5a65b',     // caution / estimated
                    danger: '#ff6b7a',   // hits / OB / destructive
                    violet: '#a78bfa',   // course/tee identity color
                    text: '#f0f2f7',
                    muted: '#98a1b5',    // brightened for contrast (was #8892b0)
                },
            },
            fontFamily: {
                mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
                sans: ['Inter', 'system-ui', 'sans-serif'],
            },
            fontSize: {
                // The type scale. Anything smaller than micro is banned —
                // the old 7–9px one-offs read "cramped dashboard".
                micro: ['0.625rem', { lineHeight: '0.875rem' }],   // 10px — captions, axis labels
                label: ['0.6875rem', { lineHeight: '1rem' }],      // 11px — section labels
                body: ['0.8125rem', { lineHeight: '1.25rem' }],    // 13px — default copy
                value: ['0.9375rem', { lineHeight: '1.25rem' }],   // 15px — data readouts
            },
            backdropBlur: {
                glass: '20px',
            },
            boxShadow: {
                // Elevation system: 1 = resting card, 2 = floating panel,
                // 3 = overlay (dropdowns, modals). Soft and layered — no
                // neon halos on chrome.
                'elev-1': '0 1px 2px rgba(0,0,0,0.28), 0 2px 8px rgba(0,0,0,0.22)',
                'elev-2': '0 2px 4px rgba(0,0,0,0.30), 0 10px 32px rgba(0,0,0,0.38)',
                'elev-3': '0 4px 12px rgba(0,0,0,0.38), 0 20px 56px rgba(0,0,0,0.5)',
                glow: '0 0 20px rgba(76, 184, 255, 0.12)',
                'glow-strong': '0 0 40px rgba(76, 184, 255, 0.2)',
            },
            animation: {
                'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
                'scan-line': 'scanLine 3s linear infinite',
            },
            keyframes: {
                pulseGlow: {
                    '0%, 100%': { opacity: 0.6 },
                    '50%': { opacity: 1 },
                },
                scanLine: {
                    '0%': { transform: 'translateY(-100%)' },
                    '100%': { transform: 'translateY(100%)' },
                },
            },
        },
    },
    plugins: [],
};
