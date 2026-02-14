import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
    plugins: [react()],
    base: command === 'build' ? '/TruArc/' : '/',
    server: {
        port: 3000,
        host: '127.0.0.1',
        hmr: {
            overlay: true,
        },
        watch: {
            usePolling: false,
        },
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
