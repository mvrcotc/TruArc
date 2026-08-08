# TruArc Accuracy Roadmap

**Goal:** Make TruArc accurate enough that a player can trust it for disc selection and
line planning — real tree shapes, real flight behavior, real course geometry.

Each section below is a self-contained work package: what to build, how to verify it,
what it depends on, and **which Claude model to use** (to keep token spend proportional
to difficulty). Sections are ordered by dependency — 0 → 1 → 2 → 3 → 4 can't be
reordered; 5, 6, 7 can run in parallel once their dependencies are met.

**Model strategy in one line:** Opus 5 / Fable 5 designs the error-compounding cores
(physics, segmentation, coordinate math) and writes their specs; Sonnet 5 implements
everything else against those specs; Haiku 4.5 does bulk data work.

---

## Section 0 — Ground Truth & Regression Harness (prerequisite for everything)

**Why first:** The git history of this repo shows the failure mode: physics was tuned
by eye, each fix broke a prior fix, and there was no way to know if the model got
*better* or just *different*. Nothing in Sections 1–4 should be accepted without an
automated check against known-real numbers.

**Build:**
1. `tests/flight-envelopes.test.mjs` (Vitest or plain node): a table of target flight
   envelopes — for each disc archetype × power level, the expected distance range,
   lateral finish range, apex height range, and shape signature (e.g. "S-curve: max
   right excursion between 40–70% of flight, finishes left of the tee line").
   **✅ DONE — the authoritative targets live in
   `tests/ground-truth/flight-envelopes.mjs`** (23 absolute envelopes across four
   thrower tiers, 12 comparative assertions, machine-checkable shape-signature
   definitions, and conventions the harness must implement). Highlights of what it
   encodes: the distance ladder, speed-demand inversions (Katana thrown slow acts
   overstable; Leopard out-throws Destroyer for a rec arm), headwind/tailwind
   stability shifts, hyzer/anhyzer/flex lines, and nose-angle penalties.
2. A field-data format (`data/ground-truth/*.json`) so real throws (from a TechDisc,
   or measured throws at a field) can be added as they're collected, tightening the
   envelopes over time.
3. CI: envelopes run on every commit touching `flightPhysics*`.

**Acceptance:** Current engine runs against the suite and fails (documented baseline);
suite is deterministic and fast (< 5 s).

**Model:** **Opus 5 (or Fable 5)** to author the envelope table — the values encode
disc golf domain judgment and aerodynamic sanity, and wrong targets poison everything
downstream. **Sonnet 5** for the test harness plumbing and CI wiring.
Estimated size: ~1 session.

---

## Section 1 — 6-DOF Flight Physics Rebuild

**Why:** The current model (`src/utils/flightPhysics.js`) injects turn and fade as
hand-tuned lateral pseudo-forces. Turn/fade must instead *emerge* from rigid-body
physics — gyroscopic precession of a spinning disc under an aerodynamic pitching
moment — or the coefficients will never stabilize and disc-to-disc relative behavior
(the thing disc selection depends on) stays distorted. Measured today: distances run
25–40 % short and the error is worse for slow discs.

**Build:**
1. **Core engine** (`src/physics/sixDof.js`): state = position (3), velocity (3),
   orientation (quaternion), angular velocity (3). Forces/moments per Hummel &
   Hubbard (2003); the open-source Python `frispy` package is the reference
   implementation to port. Coefficient curves: CL(α), CD(α) (quadratic-in-CL drag
   polar), pitching moment CM(α), roll/pitch damping, spin-down. RK4 integration
   (keep), dt ≈ 1–2 ms internally, resampled for rendering.
2. **Flight-number mapping** (`src/physics/discCoefficients.js`): a single layer
   mapping (speed, glide, turn, fade) → coefficient curve parameters. This is the
   ONLY place tuning happens. Calibrate by optimization (grid/Nelder-Mead script in
   `tools/calibrate.mjs`) minimizing error against the Section 0 envelopes — never
   by hand-editing constants in the integrator.
3. **Throw model:** release velocity from a thrower profile (arm-speed scalar, see
   Section 6), spin from velocity (real ratio ≈ 1 rev per ~2.8 cm of circumference
   travel; advance ratio matters for turn), hyzer/anhyzer sets initial orientation,
   nose angle sets initial pitch relative to velocity.
4. **Wind:** 3-D wind vector affecting airspeed (and therefore α and all moments) —
   headwind/tailwind behavior then falls out correctly for free.
5. **Web Worker** (`src/physics/worker.js`): simulation off the main thread; API-
   compatible wrapper so `MapCanvas.jsx` keeps calling `simulateDiscFlight(disc,
   throwParams, wind, getGroundElev)` unchanged. Terrain callback becomes an async
   pre-sampled elevation profile along the aim corridor (Workers can't call Mapbox).
6. Delete `flightPhysics_debug.js`; keep the old engine behind a flag for one release
   as a visual A/B, then remove.

**Acceptance:** All Section 0 envelopes pass, including the low-power Katana and wind
inversion cases. Existing UI works unchanged.

**Model:** **Opus 5 / Fable 5** for steps 1–3 (the port, the quaternion/frame math,
and the calibration methodology — this is the highest-risk code in the project; a
frame-convention bug here costs weeks, as the git history already proved once).
**Sonnet 5** for steps 4–6 (worker plumbing, wrapper, flag).
Estimated size: 2–3 sessions Opus, 1 session Sonnet.

---

## Section 2 — LiDAR Tree Inventory Pipeline (real tree shapes)

**Why:** This is the placeholder-tree problem. USGS 3DEP LiDAR contains the actual
shape of every tree on the course; the current pipeline collapses each tree to one
height number and the app stretches two generic Kenney GLB models to match. Fix: keep
the shape.

**Build (Python, offline tool — extends `process_lidar.py` / LidarCropper):**
1. **Acquisition:** given course bounds, fetch USGS 3DEP LAZ tiles automatically
   (TNM Access API / AWS `usgs-lidar-public` EPT endpoints) instead of manual
   download. Cache locally.
2. **Preprocess (PDAL):** reproject → crop to course polygon → SMRF ground
   classification → height-above-ground (HAG) → noise filter.
3. **Segmentation:** rasterize a Canopy Height Model (0.5 m), pit-free smoothing,
   local-maxima treetop detection with height-scaled window, watershed/region-grow
   crown delineation. Tooling: `lidR` (R) is the gold standard; Python alternatives
   `pycrown` or WhiteboxTools if staying single-language. Validate on Maple Hill
   against satellite imagery.
4. **Per-tree attributes** — this is the payload that kills the generic tree:
   ```json
   {
     "lng": ..., "lat": ..., "groundElevM": ...,
     "heightM": 21.4,
     "crownRadiusM": 4.1,
     "crownBaseM": 6.2,
     "profile": [0.2, 0.5, 1.0, 0.9, 0.6, 0.2],   // crown radius fraction at 6 height slices — the real silhouette
     "form": "conifer" | "deciduous",               // classified from profile shape
     "pointCount": 1840
   }
   ```
5. **Voxel occupancy grid:** vegetation returns binned into a 1 m grid over the
   course, bit-packed binary (`{course}_voxels.bin` + JSON header with origin/dims),
   typically a few hundred KB gzipped. This is the physics-collision ground truth —
   it encodes canopy gaps no tree primitive can represent.
6. **Terrain:** export a DTM GeoTIFF + a downsampled elevation grid JSON so the flight
   sim can use LiDAR ground (more accurate than Mapbox DEM, which also currently runs
   at `exaggeration: 2.0` — visual elevation is 2× reality and must be set to 1.0
   wherever measurements are read).
7. **Outputs per course:** `{course}_trees.json`, `{course}_voxels.bin`,
   `{course}_dtm.json` → uploaded to Firebase Storage/CDN (replaces `public/lidar/`).

**Acceptance:** Maple Hill processed end-to-end; spot-check ≥ 20 trees against
satellite imagery for position (< 2 m) and crown extent (< 25 %); output for a full
course < 5 MB.

**Model:** **Opus 5** for step 3 (segmentation parameter choices and validation logic —
quality here decides whether the app is trustworthy in woods). **Sonnet 5** for steps
1–2 and 4–7 (well-trodden PDAL/CLI/serialization work).
Estimated size: 1 session Opus, 2 sessions Sonnet.

---

## Section 3 — Parametric Tree Rendering (Three.js custom layer)

**Why:** Mapbox `model` layers can only place and scale pre-made GLBs — structurally
incapable of per-tree geometry. A Mapbox `CustomLayerInterface` with Three.js renders
geometry generated from each tree's own measurements.

**Build:**
1. **Custom layer** (`src/map/TreeLayer.js`): Three.js scene sharing Mapbox's WebGL
   context; the mercator-matrix camera sync is the one genuinely tricky part
   (reference: Mapbox "add-3d-model" custom layer example, generalized to many
   objects + terrain elevation offsets).
2. **Geometry from inventory:** per tree, lathe the `profile` slices into a crown
   mesh (conifer → cone-ish stack, deciduous → ellipsoid-ish) + trunk cylinder from
   `crownBaseM`. Merge into batched `InstancedMesh`-style buffers by form; target
   < 10 k trees at 60 fps with LOD (billboard imposters beyond ~300 m).
3. **Anchoring:** trees sit on `groundElevM` from the LiDAR DTM (not Mapbox DEM) so
   they don't float/sink; respect the calibration offset system already in the app.
4. **"True view" toggle:** decimated raw point cloud per course (Three.js `Points`,
   ~300 k points max) for when the player wants to see the literal tree. (COPC
   streaming is a later upgrade; don't build it yet.)
5. Remove the GLB `model` layer and the two Kenney assets. Disable Mapbox
   `show3dTrees` on courses that have LiDAR inventory (avoid double trees).

**Acceptance:** Maple Hill hole 2 ("tight tunnel through pines") is visually
recognizable against a photo/satellite view; 60 fps on a mid-range laptop; trees stay
put under rotate/pitch/zoom and terrain.

**Model:** **Opus 5** for step 1 (coordinate sync — same class of frame math that
burned this repo before). **Sonnet 5** for steps 2–5.
Estimated size: 1 session Opus, 2 sessions Sonnet.

---

## Section 4 — Collision & Line Planning

**Why:** Rendering trees changes nothing if the disc flies through them. This section
makes obstacles *play*.

**Build:**
1. `src/physics/collision.js`: sample the simulated trajectory (~0.5 m steps) against
   (a) the voxel grid — authoritative, includes gaps — and (b) the tree inventory as
   capsules/lathed profiles for attributing *which* tree was hit.
2. Outputs per throw: first-contact point + tree, clearance margin (min distance to
   vegetation along the path), "gap validated" boolean, list of near-misses (< 2 m).
3. Flight behavior on hit: truncate flight at contact with a short randomized drop
   (kick model can stay simple — a hit is a hit for planning purposes).
4. UI (`FlightStats.jsx`, `MapCanvas.jsx`): "First tree at 182 ft", clearance readout,
   red marker at contact, path segments colored by clearance; OB-crossing warnings
   once Section 5 provides OB polygons.
5. Runs in the same Web Worker as the sim; voxel grid transferred once per course as
   an ArrayBuffer.

**Acceptance:** On Maple Hill hole 2, a full-power Destroyer on the wrong line hits a
tree in the sim; the documented correct line (straight mid on the tunnel) validates
clean. Randomized trajectories never pass through voxels marked occupied.

**Model:** **Sonnet 5** for all of it, with a one-shot **Opus 5** review pass on the
ray/capsule/voxel-traversal math (Amanatides-Woo grid traversal is easy to get subtly
wrong at cell boundaries).
Estimated size: 1–2 sessions Sonnet.

---

## Section 5 — Course Geometry Accuracy

**Why:** 9 of 10 courses compute basket positions as `tee + estimated bearing +
distance` (`courses.js`). A 10° bearing error on a 400 ft hole ≈ 70 ft of basket
error — larger than any physics error. Course data must be measured, not derived.

**Build:**
1. **Schema v2** (`courses.js` → Firestore): per hole — measured tee/basket coords
   (multiple pin positions), fairway centerline waypoints for doglegs, OB polygons,
   mando points+direction, dropzones. Keep a `dataQuality: "measured" | "estimated"`
   flag and show it in the UI (honesty builds trust).
2. **OSM importer** (`tools/import-osm.mjs`): Overpass query for
   `leisure=disc_golf_course` relations; many courses have mapped tees/baskets.
3. **In-app course editor:** extend the existing calibrate mode — click satellite
   imagery at zoom 20+ to place/drag tees, baskets, OB vertices, mandos; write to
   Firestore; export/import JSON. This is also the future community-contribution
   surface (course data is the moat).
4. Replace `basketFromTee()` usage: computed baskets remain only as a fallback and
   are always flagged `estimated`.

**Acceptance:** Maple Hill fully re-measured via editor against satellite + published
caddie book; every hole's UI shows data quality; OB renders and feeds Section 4.

**Model:** **Sonnet 5** for the editor and importer. **Haiku 4.5** for the data
grunt work (re-entering hole data, migrating the 10 existing courses to schema v2).
Estimated size: 2 sessions Sonnet, Haiku as needed.

---

## Section 6 — Thrower Calibration (personal accuracy)

**Why:** Absolute accuracy is impossible without knowing the user's arm. The honest
product target: *relative* accuracy calibrated to the individual — which is also what
makes disc recommendations credible.

**Build:**
1. Onboarding: "How far do you throw your farthest driver?" → fit the arm-speed
   scalar in the Section 1 throw model. Optional refinement: enter known distances
   for 2–3 discs in the bag → least-squares fit.
2. Power slider becomes % of *the user's* max, not an abstract number.
3. Disc comparison overlay: simulate up to 3 bag discs from the same lie, colored
   paths + per-disc landing/clearance stats (directly feeds the "buy the disc that
   makes this line" moment in Section 7).
4. Persist profile in Firestore per user (auth already exists).

**Acceptance:** A user who enters 350 ft max sees their Destroyer land 330–360 ft on
flat ground at 100 %; comparison view renders 3 discs without frame drops.

**Model:** **Sonnet 5** entirely.
Estimated size: 1 session.

---

## Section 7 — Monetization Wiring

**Why last:** Affiliate conversion depends on the credibility built in Sections 1–6.
The CTA moment is: the sim just showed the user the disc that makes the line.

**Build:**
1. Disc DB enrichment: `imageUrl`, `buyLinks: [{retailer, url, affiliateTag}]`,
   MSRP. Retailers: Infinite Discs affiliate program (best catalog coverage), Amazon
   Associates fallback. No public retailer APIs — links are curated.
2. "Buy this disc" CTA in `DiscSelector`/`FlightStats` after a successful simulated
   line; click-through tracking (Firebase Analytics event with disc + course + hole
   context — this data is itself sellable insight later).
3. Ad slots: one non-intrusive banner slot component (course-select screen, not the
   map), config-driven so direct-sold tournament/brand placements can replace network
   ads later.
4. Legal: affiliate disclosure line, privacy policy page.

**Acceptance:** Every disc in the DB resolves to at least one working buy link;
clicks tracked; disclosures present.

**Model:** **Haiku 4.5** for link/data population across 260 discs. **Sonnet 5** for
CTA components and analytics wiring.
Estimated size: 1 session Sonnet, Haiku as needed.

---

## Dependency Graph & Suggested Order

```
0 (harness) ──► 1 (physics) ──► 4 (collision) ──► 6 (calibration) ──► 7 (monetization)
                                  ▲
2 (LiDAR pipeline) ──► 3 (rendering)
                └────────────────┘
5 (course geometry) ──► 4 (OB checks)     [5 can start anytime]
```

Showcase milestone: after Sections 0–4 land for **one course (Maple Hill)**, the app
demonstrates the full vision — real trees, real flight, real collisions — and that
demo is the asset for tournament/brand marketing conversations.

## Model Assignment Summary

| Section | Opus 5 / Fable 5 | Sonnet 5 | Haiku 4.5 |
|---|---|---|---|
| 0 Ground truth | envelope targets | harness, CI | — |
| 1 Physics 6-DOF | engine, mapping, calibration | worker, wrapper | — |
| 2 LiDAR pipeline | segmentation design | PDAL pipeline, serialization | — |
| 3 Tree rendering | Mapbox↔Three camera sync | geometry, LOD, toggle | — |
| 4 Collision | math review only | implementation, UI | — |
| 5 Course geometry | — | editor, OSM import | data migration |
| 6 Thrower calibration | — | all | — |
| 7 Monetization | — | CTA, analytics | affiliate link data |

Rule of thumb: if a bug in the code would be *silent and compounding* (wrong frame
convention, biased segmentation, bad calibration targets), pay for the big model once.
If a bug would be *loud and local* (UI, plumbing, CLI), Sonnet is the economic choice.
Handoff pattern: have the big model write a short spec/interface first, then implement
against it with the cheaper model.
