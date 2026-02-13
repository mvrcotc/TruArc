import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
    plugins: [react()],
    base: command === 'build' ? '/TruArc/' : '/',
    server: {
        port: 3000,
        host: '0.0.0.0',
    },
    resolve: {
        alias: {
            '@': '/src',
        },
    },
    optimizeDeps: {
        include: [
            'react',
            'react-dom',
            'mapbox-gl',
            'framer-motion',
            'lucide-react',
            'proj4',
        ],
        exclude: [
            'three',
            '@react-three/fiber',
            '@react-three/drei',
        ],
    },
}));
