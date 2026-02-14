/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  MapCanvas — Mapbox GL JS v3 + Three.js Integration            ║
 * ║  Renders 3D terrain with satellite imagery, flight paths,       ║
 * ║  course layouts, and LiDAR overlays.                            ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

import React, { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import mapboxgl from 'mapbox-gl';
import {
    simulateDiscFlight,
    trajectoryToWGS84,
    measure3DDistance,
    smoothBezierCurve,
} from '../utils/flightPhysics';
import { courseToGeoJSON } from '../data/courses';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

const MapCanvas = forwardRef(({ onMeasure, onFlightComplete, selectedDisc, throwSettings, wind, mode, activeCourse, activeHole }, ref) => {
    const containerRef = useRef(null);
    const mapRef = useRef(null);
    const markersRef = useRef([]);
    const holeMarkersRef = useRef([]);
    const flightSourceAdded = useRef(false);
    const landingSourceAdded = useRef(false);
    const courseLayerAdded = useRef(false);
    const [mapLoaded, setMapLoaded] = useState(false);
    const teePointRef = useRef(null);
    const targetPointRef = useRef(null);

    // ─── EXPOSE METHODS ─────────────────────────────────────────
    useImperativeHandle(ref, () => ({
        flyTo(lng, lat, zoom = 17) {
            mapRef.current?.flyTo({ center: [lng, lat], zoom, pitch: 60, bearing: -20, duration: 2500 });
        },
        getMap() {
            return mapRef.current;
        },
        clearFlightPath() {
            clearFlightPath();
        },
        clearMeasurement() {
            clearMarkers();
        },
        simulateThrow() {
            doFlightSimulation();
        },
        drawCourseLayout(course) {
            drawCourse(course);
        },
        highlightHole(hole) {
            highlightActiveHole(hole);
        },
    }));

    // ─── INITIALIZE MAP ─────────────────────────────────────────
    useEffect(() => {
        if (!MAPBOX_TOKEN || mapRef.current) return;
        mapboxgl.accessToken = MAPBOX_TOKEN;

        const map = new mapboxgl.Map({
            container: containerRef.current,
            style: 'mapbox://styles/mapbox/satellite-streets-v12',
            center: [-71.8960, 42.2765], // Default: Maple Hill (corrected)
            zoom: 17,
            pitch: 60,
            bearing: -20,
            antialias: true,
            maxZoom: 22,
            minZoom: 10,
        });

        map.on('load', () => {
            // Enable 3D terrain
            map.addSource('mapbox-dem', {
                type: 'raster-dem',
                url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
                tileSize: 512,
                maxzoom: 14,
            });
            map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 });

            // Add sky atmosphere
            map.addLayer({
                id: 'sky',
                type: 'sky',
                paint: {
                    'sky-type': 'atmosphere',
                    'sky-atmosphere-sun': [0, 20],
                    'sky-atmosphere-sun-intensity': 5,
                },
            });

            // Add 3D buildings for context
            map.addLayer({
                id: '3d-buildings',
                source: 'composite',
                'source-layer': 'building',
                filter: ['==', 'extrude', 'true'],
                type: 'fill-extrusion',
                minzoom: 14,
                paint: {
                    'fill-extrusion-color': '#1a2235',
                    'fill-extrusion-height': ['get', 'height'],
                    'fill-extrusion-base': ['get', 'min_height'],
                    'fill-extrusion-opacity': 0.6,
                },
            });

            mapRef.current = map;
            setMapLoaded(true);
        });

        // Click handler
        map.on('click', (e) => {
            handleMapClick(e.lngLat, map);
        });

        return () => map.remove();
    }, []);

    // ─── CLICK HANDLERS ─────────────────────────────────────────

    const handleMapClick = useCallback((lngLat, map) => {
        const currentMode = mode;

        if (currentMode === 'measure') {
            handleMeasureClick(lngLat, map);
        } else if (currentMode === 'throw') {
            handleThrowClick(lngLat, map);
        }
    }, [mode, selectedDisc, throwSettings, wind, onMeasure, onFlightComplete]);

    // Update click handler when mode changes
    useEffect(() => {
        if (!mapRef.current) return;
        const map = mapRef.current;

        const handler = (e) => handleMapClick(e.lngLat, map);
        map.off('click', handler);
        map.on('click', handler);

        // Cursor updates
        if (mode === 'measure' || mode === 'throw') {
            map.getCanvas().style.cursor = 'crosshair';
        } else {
            map.getCanvas().style.cursor = '';
        }

        return () => {
            map.off('click', handler);
        };
    }, [handleMapClick, mode]);

    // ─── MEASURE MODE ──────────────────────────────────────────

    function handleMeasureClick(lngLat, map) {
        const elevation = map.queryTerrainElevation(lngLat) || 0;
        const point = { lng: lngLat.lng, lat: lngLat.lat, elevation };

        if (!teePointRef.current) {
            // First click: Tee
            clearMarkers();
            teePointRef.current = point;
            addMarker(map, lngLat, 'TEE', '#00e5ff');
        } else {
            // Second click: Target
            targetPointRef.current = point;
            addMarker(map, lngLat, 'TARGET', '#00ff88');

            // Draw measurement line
            drawMeasurementLine(map, teePointRef.current, targetPointRef.current);

            // Calculate distance
            const measurement = measure3DDistance(teePointRef.current, targetPointRef.current);
            onMeasure?.(measurement);

            // Reset for next measurement
            teePointRef.current = null;
            targetPointRef.current = null;
        }
    }

    // ─── THROW MODE ────────────────────────────────────────────

    function handleThrowClick(lngLat, map) {
        if (!selectedDisc) return;

        const elevation = map.queryTerrainElevation(lngLat) || 0;
        const tee = { lng: lngLat.lng, lat: lngLat.lat, elevation };

        clearMarkers();
        clearFlightPath();
        addMarker(map, lngLat, 'THROW', '#ff6b35');

        // Run flight simulation
        const flightResult = simulateDiscFlight(
            selectedDisc,
            throwSettings || { power: 80, aimAngle: 0, releaseAngle: 0, noseAngle: 12 },
            wind || { speed: 0, direction: 0 },
            null,
        );

        // Convert to WGS84
        const bearing = throwSettings?.aimAngle || 0;
        const wgs84Points = trajectoryToWGS84(flightResult.points, tee, bearing);

        // Draw flight path
        drawFlightPath(map, wgs84Points);

        // Mark landing
        const landing = wgs84Points[wgs84Points.length - 1];
        addMarker(map, { lng: landing.lng, lat: landing.lat }, 'LAND', '#00ff88');
        drawLandingZone(map, landing);

        // Report
        onFlightComplete?.({
            ...flightResult,
            origin: tee,
            landing,
            wgs84Points,
        });
    }

    // ─── COURSE LAYOUT DRAWING ─────────────────────────────────

    function drawCourse(course) {
        const map = mapRef.current;
        if (!map) return;

        // Clear any existing course layers
        clearCourseLayout();

        const geojson = courseToGeoJSON(course.id);
        if (!geojson) return;

        // Add fairway lines source
        const fairwayFeatures = geojson.features.filter(f => f.properties.type === 'fairway');
        map.addSource('course-fairways', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: fairwayFeatures },
        });

        // Fairway glow
        map.addLayer({
            id: 'course-fairways-glow',
            type: 'line',
            source: 'course-fairways',
            paint: {
                'line-color': '#aa66ff',
                'line-width': 6,
                'line-blur': 5,
                'line-opacity': 0.2,
            },
        });

        // Fairway line
        map.addLayer({
            id: 'course-fairways-line',
            type: 'line',
            source: 'course-fairways',
            paint: {
                'line-color': '#aa66ff',
                'line-width': 2,
                'line-dasharray': [6, 4],
                'line-opacity': 0.6,
            },
        });

        // Active hole highlight source (empty initially)
        map.addSource('course-active-hole', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
        });

        map.addLayer({
            id: 'course-active-hole-glow',
            type: 'line',
            source: 'course-active-hole',
            paint: {
                'line-color': '#00e5ff',
                'line-width': 10,
                'line-blur': 6,
                'line-opacity': 0.4,
            },
        });

        map.addLayer({
            id: 'course-active-hole-line',
            type: 'line',
            source: 'course-active-hole',
            paint: {
                'line-color': '#00e5ff',
                'line-width': 3,
                'line-opacity': 0.9,
            },
        });

        // Add tee and basket markers via DOM markers
        clearHoleMarkers();
        course.holes.forEach(hole => {
            // Tee marker
            const teeEl = createHoleMarker(hole.num, 'tee');
            const teeMarker = new mapboxgl.Marker({ element: teeEl, anchor: 'center' })
                .setLngLat([hole.tee.lng, hole.tee.lat])
                .addTo(map);
            holeMarkersRef.current.push(teeMarker);

            // Basket marker
            const basketEl = createHoleMarker(hole.num, 'basket');
            const basketMarker = new mapboxgl.Marker({ element: basketEl, anchor: 'center' })
                .setLngLat([hole.basket.lng, hole.basket.lat])
                .addTo(map);
            holeMarkersRef.current.push(basketMarker);
        });

        courseLayerAdded.current = true;
    }

    function createHoleMarker(holeNum, type) {
        const el = document.createElement('div');
        el.className = 'truarc-hole-marker';

        const color = type === 'tee' ? '#aa66ff' : '#00ff88';
        const icon = type === 'tee' ? `${holeNum}` : '🏁';
        const size = type === 'tee' ? '28px' : '22px';
        const fontSize = type === 'tee' ? '10px' : '11px';

        el.innerHTML = `
            <div style="
                width: ${size}; height: ${size}; border-radius: ${type === 'tee' ? '4px' : '50%'};
                background: ${color}20; border: 1.5px solid ${color}80;
                display: flex; align-items: center; justify-content: center;
                font-family: 'JetBrains Mono', monospace; font-size: ${fontSize};
                color: ${color}; font-weight: 700;
                box-shadow: 0 0 8px ${color}30;
                backdrop-filter: blur(4px);
                transition: all 0.2s ease;
                cursor: pointer;
            ">${icon}</div>
        `;

        el.addEventListener('mouseenter', () => {
            el.firstElementChild.style.transform = 'scale(1.2)';
            el.firstElementChild.style.boxShadow = `0 0 16px ${color}60`;
        });
        el.addEventListener('mouseleave', () => {
            el.firstElementChild.style.transform = 'scale(1)';
            el.firstElementChild.style.boxShadow = `0 0 8px ${color}30`;
        });

        return el;
    }

    function highlightActiveHole(hole) {
        const map = mapRef.current;
        if (!map || !map.getSource('course-active-hole')) return;

        // Update the active hole line
        map.getSource('course-active-hole').setData({
            type: 'FeatureCollection',
            features: [{
                type: 'Feature',
                geometry: {
                    type: 'LineString',
                    coordinates: [
                        [hole.tee.lng, hole.tee.lat],
                        [hole.basket.lng, hole.basket.lat],
                    ],
                },
                properties: {
                    holeNum: hole.num,
                    distance: hole.distanceFt,
                },
            }],
        });

        // Fly to the hole with an optimal viewing angle
        const midLng = (hole.tee.lng + hole.basket.lng) / 2;
        const midLat = (hole.tee.lat + hole.basket.lat) / 2;

        // Calculate bearing from tee to basket for optimal camera angle
        const dx = (hole.basket.lng - hole.tee.lng) * Math.cos(hole.tee.lat * (Math.PI / 180));
        const dy = hole.basket.lat - hole.tee.lat;
        let bearing = Math.atan2(dx, dy) * (180 / Math.PI);

        map.flyTo({
            center: [midLng, midLat],
            zoom: 18.5,
            pitch: 65,
            bearing: bearing - 30, // Offset for a cinematic angle
            duration: 1800,
        });
    }

    function clearCourseLayout() {
        const map = mapRef.current;
        if (!map) return;

        // Remove layers
        ['course-fairways-glow', 'course-fairways-line', 'course-active-hole-glow', 'course-active-hole-line'].forEach(id => {
            if (map.getLayer(id)) map.removeLayer(id);
        });

        // Remove sources
        ['course-fairways', 'course-active-hole'].forEach(id => {
            if (map.getSource(id)) map.removeSource(id);
        });

        clearHoleMarkers();
        courseLayerAdded.current = false;
    }

    function clearHoleMarkers() {
        holeMarkersRef.current.forEach(m => m.remove());
        holeMarkersRef.current = [];
    }

    // ─── DRAWING HELPERS ───────────────────────────────────────

    function addMarker(map, lngLat, label, color) {
        const el = document.createElement('div');
        el.className = 'truarc-marker';
        el.innerHTML = `
      <div style="
        width: 32px; height: 32px; border-radius: 50%;
        background: ${color}20; border: 2px solid ${color};
        display: flex; align-items: center; justify-content: center;
        font-family: 'JetBrains Mono', monospace; font-size: 8px;
        color: ${color}; letter-spacing: 0.1em; font-weight: 600;
        box-shadow: 0 0 12px ${color}40;
        backdrop-filter: blur(4px);
      ">${label}</div>
    `;

        const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
            .setLngLat([lngLat.lng, lngLat.lat])
            .addTo(map);

        markersRef.current.push(marker);
    }

    function clearMarkers() {
        markersRef.current.forEach((m) => m.remove());
        markersRef.current = [];
        teePointRef.current = null;
        targetPointRef.current = null;

        // Remove measurement line
        if (mapRef.current?.getSource('measurement-line')) {
            mapRef.current.removeLayer('measurement-line-layer');
            mapRef.current.removeSource('measurement-line');
        }
    }

    function drawMeasurementLine(map, from, to) {
        const id = 'measurement-line';

        if (map.getSource(id)) {
            map.removeLayer(`${id}-layer`);
            map.removeSource(id);
        }

        map.addSource(id, {
            type: 'geojson',
            data: {
                type: 'Feature',
                geometry: {
                    type: 'LineString',
                    coordinates: [
                        [from.lng, from.lat, from.elevation],
                        [to.lng, to.lat, to.elevation],
                    ],
                },
            },
        });

        map.addLayer({
            id: `${id}-layer`,
            type: 'line',
            source: id,
            paint: {
                'line-color': '#00e5ff',
                'line-width': 3,
                'line-dasharray': [3, 2],
                'line-opacity': 0.8,
            },
        });
    }

    function drawFlightPath(map, wgs84Points) {
        const smooth = smoothBezierCurve(
            wgs84Points.map((p) => ({ x: p.lng, y: p.altitude, z: p.lat })),
            200,
        );

        const coordinates = smooth.map((p) => [p.x, p.z, p.y]);
        const id = 'flight-path';

        if (map.getSource(id)) {
            map.getSource(id).setData({
                type: 'Feature',
                geometry: { type: 'LineString', coordinates },
            });
        } else {
            map.addSource(id, {
                type: 'geojson',
                data: {
                    type: 'Feature',
                    geometry: { type: 'LineString', coordinates },
                },
            });

            // Glow layer (underneath)
            map.addLayer({
                id: `${id}-glow`,
                type: 'line',
                source: id,
                paint: {
                    'line-color': '#00e5ff',
                    'line-width': 8,
                    'line-blur': 6,
                    'line-opacity': 0.3,
                },
            });

            // Main path
            map.addLayer({
                id: `${id}-layer`,
                type: 'line',
                source: id,
                paint: {
                    'line-color': '#00e5ff',
                    'line-width': 3,
                    'line-opacity': 0.9,
                },
            });

            // Shadow on terrain
            map.addLayer({
                id: `${id}-shadow`,
                type: 'line',
                source: id,
                paint: {
                    'line-color': '#000000',
                    'line-width': 2,
                    'line-opacity': 0.2,
                },
                layout: {
                    'line-cap': 'round',
                },
            });

            flightSourceAdded.current = true;
        }
    }

    function clearFlightPath() {
        const map = mapRef.current;
        if (!map) return;

        ['flight-path-glow', 'flight-path-layer', 'flight-path-shadow'].forEach((id) => {
            if (map.getLayer(id)) map.removeLayer(id);
        });
        if (map.getSource('flight-path')) map.removeSource('flight-path');

        ['landing-zone-fill', 'landing-zone-stroke'].forEach((id) => {
            if (map.getLayer(id)) map.removeLayer(id);
        });
        if (map.getSource('landing-zone')) map.removeSource('landing-zone');

        flightSourceAdded.current = false;
        landingSourceAdded.current = false;
    }

    function drawLandingZone(map, landing) {
        const id = 'landing-zone';
        const circle1Points = generateCircle(landing.lng, landing.lat, 10, 36);
        const circle2Points = generateCircle(landing.lng, landing.lat, 20, 36);

        if (map.getSource(id)) {
            map.getSource(id).setData({
                type: 'FeatureCollection',
                features: [
                    { type: 'Feature', geometry: { type: 'Polygon', coordinates: [circle1Points] }, properties: { ring: 'c1' } },
                    { type: 'Feature', geometry: { type: 'Polygon', coordinates: [circle2Points] }, properties: { ring: 'c2' } },
                ],
            });
        } else {
            map.addSource(id, {
                type: 'geojson',
                data: {
                    type: 'FeatureCollection',
                    features: [
                        { type: 'Feature', geometry: { type: 'Polygon', coordinates: [circle1Points] }, properties: { ring: 'c1' } },
                        { type: 'Feature', geometry: { type: 'Polygon', coordinates: [circle2Points] }, properties: { ring: 'c2' } },
                    ],
                },
            });

            map.addLayer({
                id: `${id}-fill`,
                type: 'fill',
                source: id,
                paint: {
                    'fill-color': ['match', ['get', 'ring'], 'c1', '#00ff88', '#00e5ff'],
                    'fill-opacity': ['match', ['get', 'ring'], 'c1', 0.15, 0.08],
                },
            });

            map.addLayer({
                id: `${id}-stroke`,
                type: 'line',
                source: id,
                paint: {
                    'line-color': ['match', ['get', 'ring'], 'c1', '#00ff88', '#00e5ff'],
                    'line-width': 2,
                    'line-dasharray': [4, 3],
                    'line-opacity': 0.6,
                },
            });

            landingSourceAdded.current = true;
        }
    }

    function generateCircle(lngCenter, latCenter, radiusMeters, numPoints) {
        const coords = [];
        const DEG_TO_RAD = Math.PI / 180;
        const mPerDegLat = 111320;
        const mPerDegLng = mPerDegLat * Math.cos(latCenter * DEG_TO_RAD);

        for (let i = 0; i <= numPoints; i++) {
            const angle = (i / numPoints) * Math.PI * 2;
            coords.push([
                lngCenter + (radiusMeters * Math.cos(angle)) / mPerDegLng,
                latCenter + (radiusMeters * Math.sin(angle)) / mPerDegLat,
            ]);
        }
        return coords;
    }

    // ─── LIDAR LAYER ────────────────────────────────────────────
    useEffect(() => {
        if (!mapLoaded || !mapRef.current) return;
    }, [mapLoaded]);

    // ─── RENDER ─────────────────────────────────────────────────
    return (
        <div ref={containerRef} className="absolute inset-0 w-full h-full" id="map-canvas" />
    );
});

MapCanvas.displayName = 'MapCanvas';
export default MapCanvas;
