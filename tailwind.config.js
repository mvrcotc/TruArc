/** @type {import('tailwindcss').Config} */
export default {
    content: ['./index.html', './src/**/*.{js,jsx}'],
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                truarc: {
                    bg: '#0a0e17',
                    surface: '#111827',
                    card: '#1a2235',
                    border: '#2a3a52',
                    accent: '#00e5ff',
                    glow: '#00e5ff',
                    green: '#00ff88',
                    warn: '#ff6b35',
                    danger: '#ff3366',
                    text: '#e2e8f0',
                    muted: '#8892b0',
                },
            },
            fontFamily: {
                mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
                sans: ['Inter', 'system-ui', 'sans-serif'],
            },
            backdropBlur: {
                glass: '20px',
            },
            boxShadow: {
                glow: '0 0 20px rgba(0, 229, 255, 0.15)',
                'glow-strong': '0 0 40px rgba(0, 229, 255, 0.3)',
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
