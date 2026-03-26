# TruArc Implementation Plan: Map & Planning Vision

**Goal:** Click-to-navigate 3D map with accurate distances, obstacles, realistic terrain, and disc flight path planning for personal positioning strategy.

---

## Current State vs. Target

| Capability | Current | Target |
|------------|---------|--------|
| **Map navigation** | Basic Mapbox (pan, zoom). Light style, no 3D terrain. | Full 3D: pan, rotate, pitch, orbit. Satellite imagery, 3D terrain. |
| **Distance measurement** | Point-to-point 3D (horizontal + elevation). Click tee, click target. | Same + **obstacle clearance**, **carry distance**. **Always decimal precision** in top-right/secondary placement. |
| **Terrain accuracy** | `queryTerrainElevation` used but map has no terrain (light style). | Mapbox DEM terrain + optional LiDAR for tree/object height. |
| **Flight simulation** | Physics model with disc ratings. **Ignores terrain** (passes `null` for `getGroundElev`). | Terrain-following landings. Optional obstacle collision detection. |
| **Obstacles** | None in data model or UI. | **LiDAR-derived** trees/objects. Requires extraction tool to cut course area from USGS tiles. |
| **Disc selection** | Search + bag. 200+ discs with flight numbers. | Same. Add flight path comparison (overlay multiple disc lines). |
| **Throw workflow** | Single click = throw from there. Aim via slider. | **One-click, view-aligned** aim. "Fly to landing" to view next shot from disc landing. |
| **Personal positioning** | Not explicit. | "Stand here" marker. Distance to basket, to obstacles, suggested landing zones. |

---

## Phase 1: Map Foundation (Blocking)

### 1.1 Restore 3D Map with Terrain

**Problem:** Map uses `light-v11` (no terrain). Measurements and flight sim rely on elevation.

**Tasks:**
- [ ] Switch to `satellite-streets-v12` (or `standard-satellite` if token allows)
- [ ] Add Mapbox DEM terrain source + `setTerrain`
- [ ] Ensure `queryTerrainElevation` works (requires terrain enabled)
- [ ] Add drag-to-rotate, scroll-to-zoom, pitch support (Mapbox default with terrain)
- [ ] Optional: Add `NavigationControl` and `FullscreenControl` for discoverability

**Files:** `MapCanvas.jsx`

---

### 1.2 Wire Terrain into Flight Simulation

**Problem:** `simulateDiscFlight` is called with `getGroundElev = null`. Disc lands on flat plane.

**Tasks:**
- [ ] Create `getGroundElev` that maps local (x,z) → elevation using Mapbox `queryTerrainElevation`
- [ ] Challenge: Sim runs in local meter space; need to sample terrain along trajectory and convert lng/lat → elevation
- [ ] Pass `getGroundElev` into `simulateDiscFlight` from `handleThrowClick`
- [ ] Validate landing point uses actual terrain elevation

**Files:** `MapCanvas.jsx`, `flightPhysics.js`

---

### 1.3 Measurement Precision & Placement

**Current:** 3D distance in feet/meters. Horizontal, elevation change, bearing.

**Decisions:** Always show decimals (0.1 ft precision). Place in **top-right or secondary area** — out of direct view so it doesn't clutter the main planning UI.

**Tasks:**
- [ ] Always display distance with decimal precision (e.g. `312.4 ft`)
- [ ] Move measurement stats to top-right corner or collapsible secondary panel
- [ ] Show **carry distance** (horizontal only) vs. **playspace distance** (3D)
- [ ] Optional: Multi-segment measurement (click multiple points, sum segments)

**Files:** `FlightStats.jsx`, `App.jsx` (layout)

---

## Phase 2: Throw & Planning UX

### 2.1 One-Click, View-Aligned Throw

**Decision:** Single click = throw from there. **Aim = current map bearing** (where you're looking). No manual aim slider for primary flow.

**Rationale:** User orients the map to face the line they want to throw, then clicks. If the disc lands elsewhere, they can **fly to landing** to view the next shot from that angle.

**Tasks:**
- [ ] Use map bearing as throw aim when user clicks (replace/supplement aimAngle slider)
- [ ] Add **"Fly to landing"** button/action — camera flies to landing point, oriented toward basket (or previous target)
- [ ] Optional: Keep aim slider as override for power users
- [ ] Landing marker remains; user can click "view from here" to re-center

**Files:** `MapCanvas.jsx`, `DiscSelector.jsx`, `FlightStats.jsx`, `App.jsx`

---

### 2.2 Personal Positioning Marker

**Concept:** "I'm standing here" — a persistent marker for planning.

**Tasks:**
- [ ] New mode or sub-mode: "Position" — click to place "you are here"
- [ ] Show distances: you → basket, you → obstacles, you → landing zone
- [ ] Persist position when switching holes (optional)
- [ ] Integrate with measurement: "distance from my position to X"

**Files:** `MapCanvas.jsx`, `Toolbar.jsx`, `FlightStats.jsx`, `App.jsx`

---

### 2.3 Disc Comparison (Multiple Flight Paths)

**Concept:** Overlay 2–3 disc flights to compare lines.

**Tasks:**
- [ ] Allow "add to compare" from bag — e.g. select 3 discs
- [ ] From same tee/target, simulate each disc
- [ ] Draw multiple flight paths (different colors)
- [ ] Stats panel shows landing distance for each

**Files:** `MapCanvas.jsx`, `DiscSelector.jsx`, `FlightStats.jsx`

---

## Phase 3: LidarCropper (Separate App)

**Decision:** Use LiDAR for obstacles. **LidarCropper** is a standalone app (not part of TruArc) for clipping USGS LiDAR to course bounds.

### 3.0 LidarCropper App

**Location:** `../LidarCropper/` (sibling project)

**Purpose:** Load USGS LAZ → clip to bounds → export trees + terrain. Output will be dropped into a database that TruArc will later query.

**Flow:**
1. User drops LAZ in `input/`
2. User provides bounds (JSON file or bbox string)
3. PDAL: read, reproject, crop, classify, HAG
4. Export: `{prefix}_trees.geojson`, `{prefix}_terrain.geojson`
5. Output to `output/` (later: ingest into DB)

**Tasks:**
- [x] Standalone LidarCropper app
- [ ] Add map UI for drawing bounds (future)
- [ ] DB ingestion pipeline (future)

**Files:** `../LidarCropper/` (separate repo/app)

---

## Phase 4: Obstacles & Data Model

### 4.1 Obstacle Data Model

**Source:** LiDAR extraction output (trees) + manual OB/mandos per hole.

```js
// In courses.js hole object
obstacles: [
  { type: 'tree', lng, lat, heightM: 15, radiusM: 2, source: 'lidar' },
  { type: 'ob', geometry: 'LineString' | 'Polygon', coordinates: [...] },
  { type: 'mando', lng, lat, direction: 'left' | 'right' },
]
```

**Tasks:**
- [ ] Extend hole schema with optional `obstacles` array
- [ ] Load LiDAR-derived obstacles from `{course_id}_trees.geojson` (or baked into course JSON)
- [ ] Add OB/mando as manual overlays in course data

**Files:** `courses.js`, data loaders

---

### 4.2 Obstacle Display on Map

**Tasks:**
- [ ] Render OB zones as semi-transparent polygons (red/pink)
- [ ] Render trees as circles or 3D extrusions (height = cylinder)
- [ ] Render mandos as directional markers
- [ ] Layer ordering: terrain < LiDAR < obstacles < fairway < flight path

**Files:** `MapCanvas.jsx`, `courseToGeoJSON`

---

### 4.3 Obstacle-Aware Planning

**Tasks:**
- [ ] **Clearance check:** Does flight path pass above tree height? Flag if not.
- [ ] **OB in play:** Does path cross OB? Show warning.
- [ ] **Distance to obstacle:** "First tree at 180 ft"
- [ ] Optional: Flight path collision — does disc hit tree? (ray vs. cylinder)

**Files:** `flightPhysics.js`, `MapCanvas.jsx`, new `obstacleUtils.js`

---

## Phase 5: Realism & Polish

### 5.1 LiDAR Integration (App)

**Current:** LiDAR overlay exists. Calibration panel. Load from `/lidar/overlay.geojson`.

**With extraction tool:** Load course-specific LiDAR outputs (terrain + trees). Trees become obstacle layer; terrain augments Mapbox DEM where available.

**Tasks:**
- [ ] Load course-specific LiDAR: `lidar/{course_id}_trees.geojson`, `lidar/{course_id}_terrain.geojson`
- [ ] Render tree obstacles from LiDAR (circles or 3D by height)
- [ ] Ensure LiDAR point cloud overlay works with terrain + satellite
- [ ] Calibration offset applies to LiDAR layers

**Files:** `MapCanvas.jsx`, `App.jsx`

---

### 5.2 Satellite Imagery Quality

**Tasks:**
- [ ] Use best available Mapbox style (Standard Satellite if plan allows)
- [ ] Document map style options in MAP_QUALITY.md
- [ ] Consider high-zoom tile caching for offline (future)

---

### 5.3 Navigate Mode = Free Exploration

**Current:** Navigate mode exists but click does nothing (only measure/throw consume clicks).

**Tasks:**
- [ ] Ensure navigate mode is clearly "explore" — drag, rotate, zoom
- [ ] Optional: Double-click to fly to location
- [ ] Optional: Right-click context menu (measure from here, plan throw from here)

---

## Implementation Order

| Order | Phase | Rationale |
|-------|-------|-----------|
| 1 | **1.1** Map Foundation | Without terrain, nothing else is accurate |
| 2 | **1.2** Terrain in Flight Sim | Core to realistic landings |
| 3 | **1.3** Measurement Precision & Placement | Decimals always; top-right, out of direct view |
| 4 | **2.1** One-Click View-Aligned Throw + Fly to Landing | UX: aim = bearing; view from landing |
| 5 | **3.0** LiDAR Extraction Tool | Cuts course area from USGS tiles; outputs for app |
| 6 | **4.1–4.2** Obstacle Data & Display | Load LiDAR obstacles; render on map |
| 7 | **2.2** Personal Positioning | Enhances planning |
| 8 | **4.3** Obstacle-Aware Planning | Clearance, OB warnings |
| 9 | **2.3** Disc Comparison | Nice-to-have |
| 10 | **5.x** Polish | LiDAR app integration, satellite quality |

---

## Non-Goals (Out of Scope for Now)

- Real-time GPS "you are here"
- Multiplayer or shared sessions
- Scorekeeping / round tracking
- Mobile-native app (web-first)

---

## File Change Summary

| File | Changes |
|------|---------|
| `MapCanvas.jsx` | Map style, terrain, getGroundElev, view-aligned throw, fly-to-landing, obstacles |
| `flightPhysics.js` | Ensure getGroundElev contract; optional obstacle collision |
| `courses.js` | Obstacle schema, LiDAR-derived obstacle loading |
| `DiscSelector.jsx` | View-aligned aim UI, disc comparison mode |
| `FlightStats.jsx` | Decimal precision always; top-right placement; fly-to-landing button |
| `App.jsx` | Layout for top-right stats; position mode; comparison state |
| `obstacleUtils.js` | New: clearance, OB check, collision |
| `tools/extract_lidar_course.py` | New: clip USGS LiDAR to course bounds, export trees/terrain |

---

## Design Decisions (Locked)

| Decision | Choice |
|----------|--------|
| **Obstacle source** | LiDAR. Requires separate extraction tool to cut course area from USGS tiles. |
| **Throw flow** | One-click, view-aligned. Aim = map bearing. "Fly to landing" to view next shot from disc landing. |
| **Precision display** | Always decimals. Top-right or secondary placement — out of direct view. |
| **Map style** | Satellite + terrain (satellite-streets or standard-satellite). |
