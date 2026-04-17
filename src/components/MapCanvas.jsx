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
    localToLngLat,
    measure3DDistance,
    smoothBezierCurve,
} from '../utils/flightPhysics';
import { courseToGeoJSON } from '../data/courses';
import { applyOffsetToGeoJSON } from '../utils/calibrationOffset';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

/** Path to LiDAR GeoJSON (place processed file at public/lidar/overlay.geojson) */
const LIDAR_GEOJSON_URL = '/lidar/overlay.geojson';

const MapCanvas = forwardRef(({ onMeasure, onFlightComplete, onMove, selectedDisc, throwSettings, wind, mode, activeCourse, activeHole, lidarEnabled, calibrationOffset }, ref) => {
    const containerRef = useRef(null);
    const mapRef = useRef(null);
    const markersRef = useRef([]);
    const holeMarkersRef = useRef([]);
    const flightSourceAdded = useRef(false);
    const landingSourceAdded = useRef(false);
    const courseLayerAdded = useRef(false);
    const [mapLoaded, setMapLoaded] = useState(false);
    const [mapError, setMapError] = useState(null);
    const teePointRef = useRef(null);
    const targetPointRef = useRef(null);

    // ─── EXPOSE METHODS ─────────────────────────────────────────
    useImperativeHandle(ref, () => ({
        flyTo(lng, lat, zoom = 17) {
            mapRef.current?.flyTo({ center: [lng, lat], zoom, pitch: 60, bearing: -20, duration: 2500 });
        },
        flyToLanding(landing, lookAt = null) {
            const map = mapRef.current;
            if (!map || !landing) return;
            let bearing = map.getBearing();
            if (lookAt) {
                const dLng = (lookAt.lng - landing.lng) * 111320 * Math.cos(landing.lat * Math.PI / 180);
                const dLat = (lookAt.lat - landing.lat) * 111320;
                bearing = Math.atan2(dLng, dLat) * 180 / Math.PI;
            }
            map.flyTo({
                center: [landing.lng, landing.lat],
                zoom: 17,
                pitch: 50,
                bearing,
                duration: 1500,
            });
        },
        standOnTee(hole) {
            const map = mapRef.current;
            if (!map || !hole) return;
            map.flyTo({
                center: [hole.tee.lng, hole.tee.lat],
                zoom: 21.5, // puts the camera extremely close to ground
                pitch: 85,  // nearly horizontal look
                bearing: hole.bearing || 0,
                duration: 2500,
            });
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
        if (mapRef.current) return;
        if (!MAPBOX_TOKEN || !MAPBOX_TOKEN.trim()) {
            setMapError('Missing Mapbox token. Add VITE_MAPBOX_TOKEN to .env');
            return;
        }
        setMapError(null);
        mapboxgl.accessToken = MAPBOX_TOKEN;

        // Satellite + 3D terrain for accurate elevation
        const map = new mapboxgl.Map({
            container: containerRef.current,
            center: [-71.8960, 42.2765],
            zoom: 17,
            pitch: 50,
            bearing: -20,
            maxPitch: 85,
            maxZoom: 22,
            minZoom: 10,
            // Mapbox standard-satellite gives true 3D volumetric trees
            style: 'mapbox://styles/mapbox/standard-satellite',
        });

        // `mapRef` is assigned only after `load`, so never use it to detect timeout —
        // that was aborting legitimate slow loads after 15s.
        let styleLoaded = false;
        let instanceRemoved = false;
        const removeMap = () => {
            if (instanceRemoved) return;
            instanceRemoved = true;
            try {
                map.remove();
            } catch {
                /* already removed */
            }
        };

        const LOAD_TIMEOUT_MS = 90_000;
        const timeoutId = setTimeout(() => {
            if (!styleLoaded) {
                setMapError(
                    'Map timed out (slow network or blocked Mapbox). Check Wi‑Fi, VPN, and ad blockers. ' +
                    'If the token uses URL restrictions: Mapbox → Account → Tokens → allow http://127.0.0.1:* and http://localhost:*'
                );
                removeMap();
            }
        }, LOAD_TIMEOUT_MS);

        map.on('error', (e) => {
            clearTimeout(timeoutId);
            setMapError(e.error?.message || 'Map failed to load.');
        });

        map.on('style.load', () => {
            if (instanceRemoved) return;
            try {
                // Mapbox Standard configs for full 3D environment
                map.setConfigProperty('basemap', 'show3dTrees', true);
                map.setConfigProperty('basemap', 'show3dObjects', true);
                
                // Register multiple custom 3D models for variety
                try {
                    map.addModel('tree1', '/models/tree_pineDefaultA.glb');
                    map.addModel('tree2', '/models/tree_thin_dark.glb');
                } catch (addErr) {
                    console.log('Models already registered or failed:', addErr.message);
                }
            } catch (e) {
                console.warn('Failed to set standard basemap config:', e);
            }
        });

        map.on('load', () => {
            clearTimeout(timeoutId);
            styleLoaded = true;
            mapRef.current = map;
            setMapLoaded(true);
            // Terrain after first frame so the loading overlay clears without waiting on DEM setup
            queueMicrotask(() => {
                if (instanceRemoved || !mapRef.current) return;
                try {
                    if (!map.getSource('mapbox-dem')) {
                        map.addSource('mapbox-dem', {
                            type: 'raster-dem',
                            url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
                            tileSize: 512,
                            maxzoom: 14,
                        });
                    }
                    map.setTerrain({ source: 'mapbox-dem', exaggeration: 2.0 });
                } catch (e) {
                    console.warn('Terrain:', e.message);
                }
            });
        });

        // Click handler
        map.on('click', (e) => {
            handleMapClick(e.lngLat, map);
        });

        // Move handler for compass
        map.on('move', () => {
            const bearing = map.getBearing();
            const pitch = map.getPitch();
            // We use a callback ref or direct prop call if provided
            if (onMove) onMove({ bearing, pitch });
        });

        return () => {
            clearTimeout(timeoutId);
            removeMap();
            mapRef.current = null;
        };
    }, []);

    // ─── CLICK HANDLERS ─────────────────────────────────────────

    const handleMapClick = useCallback((lngLat, map) => {
        const currentMode = mode;

        if (currentMode === 'measure') {
            handleMeasureClick(lngLat, map);
        } else if (currentMode === 'throw') {
            handleThrowClick(lngLat, map);
        }
    }, [mode, selectedDisc, throwSettings, wind, onMeasure, onFlightComplete, activeHole, activeCourse]);

    // Update click handler when mode changes
    useEffect(() => {
        if (!mapRef.current) return;
        const map = mapRef.current;

        const handler = (e) => handleMapClick(e.lngLat, map);
        map.off('click', handler);
        map.on('click', handler);

        // Cursor updates (canvas may be undefined before map fully loads)
        const canvas = map.getCanvas?.();
        if (canvas?.style) {
            canvas.style.cursor = mode === 'measure' || mode === 'throw' ? 'crosshair' : '';
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

    // Keep track of the last clicked location for live param updates
    const lastThrowRef = useRef(null);

    // Re-simulate on setting change if we have a standing throw
    useEffect(() => {
        if (mode === 'throw' && lastThrowRef.current && mapRef.current) {
            handleThrowClick(lastThrowRef.current, mapRef.current);
        }
    }, [throwSettings, wind, selectedDisc, activeHole, activeCourse, handleThrowClick]);

    function handleThrowClick(lngLat, map) {
        if (!selectedDisc) return;
        lastThrowRef.current = lngLat;

        try {
            const elevation = map.queryTerrainElevation?.(lngLat) ?? 0;
            const tee = { lng: lngLat.lng, lat: lngLat.lat, elevation };

            clearMarkers();
            
            // Note: We DO NOT call clearFlightPath() here because drawFlightPath 
            // uses setData() to update the existing source. Removing and adding 
            // the source in the same tick causes Mapbox WebGL worker race conditions.
            addMarker(map, lngLat, 'THROW', '#ff6b35');

            // Calculate base bearing (either to active hole basket, closest basket, or map direction)
            let baseBearing = map.getBearing?.() || 0;
            let targetBasket = activeHole?.basket;

            // If no active hole, aim at the nearest basket
            if (!targetBasket && activeCourse) {
                let closestDist = Infinity;
                activeCourse.holes.forEach(hole => {
                    const dist = Math.hypot(
                        (hole.basket.lng - lngLat.lng) * Math.cos(lngLat.lat * Math.PI / 180),
                        hole.basket.lat - lngLat.lat
                    );
                    if (dist < closestDist) {
                        closestDist = dist;
                        targetBasket = hole.basket;
                    }
                });
            }

            if (targetBasket) {
                const dy = targetBasket.lat - lngLat.lat;
                const dx = (targetBasket.lng - lngLat.lng) * Math.cos(lngLat.lat * Math.PI / 180);
                baseBearing = (Math.atan2(dx, dy) * 180) / Math.PI;
            }

            // Final aim = base bearing + aim slider
            const bearing = baseBearing + (throwSettings?.aimAngle || 0);

            // Terrain sampling: fallback if error
            const getGroundElev = (x, z) => {
                try {
                    const { lng, lat } = localToLngLat(x, z, tee, bearing);
                    const elev = map.queryTerrainElevation?.([lng, lat]);
                    const absElev = elev ?? tee.elevation ?? 0;
                    return absElev - (tee.elevation ?? 0);
                } catch (e) {
                    return 0;
                }
            };

            const flightResult = simulateDiscFlight(
                selectedDisc,
                throwSettings || { power: 80, aimAngle: 0, releaseAngle: 0, noseAngle: 12 },
                wind || { speed: 0, direction: 0 },
                getGroundElev,
            );

            // Convert to WGS84
            const wgs84Points = trajectoryToWGS84(flightResult.points, tee, bearing);

            // Draw flight path
            try {
                drawFlightPath(map, wgs84Points);
            } catch (layerErr) {
                console.error("Flight path drawing error:", layerErr);
            }

            // Mark landing
            const landing = wgs84Points[wgs84Points.length - 1];
            if (landing && !isNaN(landing.lng) && !isNaN(landing.lat)) {
                addMarker(map, { lng: landing.lng, lat: landing.lat }, 'LAND', '#00ff88');
                try {
                    drawLandingZone(map, landing);
                } catch (lzErr) {
                    console.error("Landing zone error:", lzErr);
                }
            }

            // Report
            onFlightComplete?.({
                ...flightResult,
                origin: tee,
                landing,
                wgs84Points,
            });
        } catch (e) {
            console.error("Simulation error:", e);
        }
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
            const teeMarker = new mapboxgl.Marker({ element: teeEl, anchor: 'center', pitchAlignment: 'map', rotationAlignment: 'map' })
                .setLngLat([hole.tee.lng, hole.tee.lat])
                .addTo(map);
            holeMarkersRef.current.push(teeMarker);

            // Basket marker
            const basketEl = createHoleMarker(hole.num, 'basket');
            const basketMarker = new mapboxgl.Marker({ element: basketEl, anchor: 'center', pitchAlignment: 'map', rotationAlignment: 'map' })
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

        const marker = new mapboxgl.Marker({ element: el, anchor: 'center', pitchAlignment: 'map', rotationAlignment: 'map' })
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

        // [lng, lat]
        const coordinates = smooth.map((p) => [p.x, p.z]);
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
        const map = mapRef.current;
        if (!mapLoaded || !map) return;

        const sourceId = 'lidar-points';
        const layerId = 'lidar-points-layer';

        if (!lidarEnabled) {
            if (map.getLayer(layerId)) map.removeLayer(layerId);
            if (map.getSource(sourceId)) map.removeSource(sourceId);
            return;
        }

        const ac = new AbortController();
        fetch(LIDAR_GEOJSON_URL, { signal: ac.signal })
            .then((res) => {
                if (!res.ok) throw new Error(`LiDAR file not found (${res.status}). Place processed GeoJSON at public/lidar/overlay.geojson`);
                return res.json();
            })
            .then((geojson) => {
                const offset = calibrationOffset || { dLng: 0, dLat: 0, dElev: 0 };
                const adjusted = applyOffsetToGeoJSON(geojson, offset);

                if (map.getSource(sourceId)) {
                    map.getSource(sourceId).setData(adjusted);
                } else {
                    map.addSource(sourceId, { type: 'geojson', data: adjusted });
                    map.addLayer({
                        id: layerId,
                        type: 'circle',
                        source: sourceId,
                        paint: {
                            'circle-radius': 1.5,
                            'circle-color': [
                                'match',
                                ['get', 'classification'],
                                2, 'rgba(139, 90, 43, 0.6)',   // Ground
                                3, 'rgba(34, 139, 34, 0.5)',   // Low veg
                                4, 'rgba(0, 128, 0, 0.6)',     // Mid veg
                                5, 'rgba(0, 100, 0, 0.5)',     // High veg
                                6, 'rgba(128, 128, 128, 0.5)', // Building
                                'rgba(0, 200, 255, 0.4)',      // Default
                            ],
                            'circle-opacity': 0.7,
                        },
                    });
                }
            })
            .catch((err) => {
                if (err.name !== 'AbortError') console.warn('LiDAR overlay:', err.message);
            });

        return () => {
            ac.abort();
            if (map.getLayer(layerId)) map.removeLayer(layerId);
            if (map.getSource(sourceId)) map.removeSource(sourceId);
        };
    }, [mapLoaded, lidarEnabled, calibrationOffset]);

    // ─── OBSTACLE LAYER (LiDAR trees per course) ─────────────────
    useEffect(() => {
        const map = mapRef.current;
        if (!mapLoaded || !map) return;

        const sourceId = 'obstacle-trees';
        const layerId = 'obstacle-trees-layer';
        const courseId = activeCourse?.id;

        if (!courseId) {
            if (map.getLayer(layerId)) map.removeLayer(layerId);
            if (map.getSource(sourceId)) map.removeSource(sourceId);
            return;
        }

        const ac = new AbortController();
        fetch(`/lidar/${courseId}_trees.geojson`, { signal: ac.signal })
            .then((res) => {
                if (!res.ok) throw new Error('Not found');
                return res.json();
            })
            .then((geojson) => {
                const offset = calibrationOffset || { dLng: 0, dLat: 0, dElev: 0 };
                const adjusted = applyOffsetToGeoJSON(geojson, offset);

                if (map.getSource(sourceId)) {
                    map.getSource(sourceId).setData(adjusted);
                } else {
                    map.addSource(sourceId, { type: 'geojson', data: adjusted });
                    map.addLayer({
                        id: layerId,
                        type: 'model',
                        source: sourceId,
                        layout: {
                            // Pseudo-randomly pick between the 2 models based on the tree's height
                            // multiplying heightM by 10 and modulo 2 gives a random-feeling distribution
                            'model-id': [
                                'match',
                                ['%', ['round', ['*', ['get', 'heightM'], 10]], 2],
                                0, 'tree1',
                                1, 'tree2',
                                'tree1'
                            ]
                        },
                        paint: {
                            // Dynamically scale the 3D asset based on LiDAR height data (heightM)
                            // We map 100m to a scale of [6, 6, 10] because the downloaded Kenney models 
                            // already have a large base size (approx 10 meters tall natively).
                            'model-scale': [
                                'interpolate',
                                ['linear'],
                                ['get', 'heightM'],
                                0, ['literal', [0, 0, 0]],
                                100, ['literal', [6.0, 6.0, 10.0]]
                            ],
                            'model-opacity': 1.0,
                            'model-color': '#228B22' // Adds slight foliage tinting
                        },
                    });
                }
            })
            .catch((err) => {
                console.error('Obstacle Layer Failed:', err);
                if (map.getLayer(layerId)) map.removeLayer(layerId);
                if (map.getSource(sourceId)) map.removeSource(sourceId);
            });

        return () => {
            ac.abort();
            if (map.getLayer(layerId)) map.removeLayer(layerId);
            if (map.getSource(sourceId)) map.removeSource(sourceId);
        };
    }, [mapLoaded, activeCourse?.id, calibrationOffset]);

    // ─── RENDER ─────────────────────────────────────────────────
    return (
        <div className="relative w-full h-full">
            <div ref={containerRef} className="absolute inset-0 w-full h-full" id="map-canvas" />
            {!mapLoaded && !mapError && (
                <div className="absolute inset-0 flex items-center justify-center bg-truarc-bg/80 z-10">
                    <div className="text-center">
                        <div className="w-10 h-10 border-2 border-truarc-accent border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                        <p className="text-truarc-muted text-sm">Loading map…</p>
                    </div>
                </div>
            )}
            {mapError && (
                <div className="absolute inset-0 flex items-center justify-center bg-truarc-bg/95 z-10 p-4">
                    <div className="max-w-md text-center">
                        <p className="text-truarc-warn font-medium mb-2">Map couldn&apos;t load</p>
                        <p className="text-truarc-muted text-sm mb-4">{mapError}</p>
                        <p className="text-truarc-muted text-xs">
                            Check .env has VITE_MAPBOX_TOKEN. Restart dev server after changing .env.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
});

MapCanvas.displayName = 'MapCanvas';
export default MapCanvas;
