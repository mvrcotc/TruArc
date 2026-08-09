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
   **✅ DONE — `tests/ground-truth/field-data/README.md`** documents the JSON row
   format and precedence rule; directory is empty and ready for real throws.
3. CI: envelopes run on every commit touching `flightPhysics*`.
   **✅ DONE:**
   - `tests/ground-truth/metrics.mjs` — engine-agnostic metric extraction
     (distance/lateral-finish/apex/max-right-excursion) and the six shape-signature
     classifiers (straight/sCurve/hyzerOut/turnover/fadeOut/flex) plus universal
     invariants (no NaN, apex position, flight-time sanity, no mid-flight energy gain).
   - `tests/ground-truth/adapters/currentEngine.mjs` — bridges the ground-truth
     vocabulary (thrower tier release speed in mph) to the current engine's API
     (which ties velocity to `disc.speed` rating, not release speed — itself part of
     what Section 1 fixes). This adapter is throwaway: delete it when Section 1 lands.
   - `tests/flight-envelopes.test.mjs` — Node's built-in test runner (`node --test`,
     zero new dependencies), wired via `npm run test:physics`.
   - `.github/workflows/physics-baseline.yml` — runs on every PR/push touching
     physics files, `continue-on-error: true` since the baseline is known-red (see
     below), so it stays visible without blocking unrelated PRs.

**Acceptance:** Current engine runs against the suite and fails (documented baseline);
suite is deterministic and fast (< 5 s). **✅ MET — measured baseline: 8/35 passing
(23%)** — 2/23 absolute envelopes (`aviar-adv-flat`, `boss-adv-flat`) and 6/12
comparatives. Notably `boss-adv-flat` passes its absolute range while the comparative
`speed-demand-tern-beats-boss` still fails — the engine lands in the right numeric
window for the wrong structural reason, exactly the kind of false-positive the
comparative assertions exist to catch. Every headwind/tailwind direction-of-effect
check fails (`headwind-increases-turn`, `tailwind-hardens-fade`), confirming the
turn/fade-as-pseudo-force model has no real aerodynamic coupling to airspeed. This is
the scoreboard Section 1 needs to move to green.

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
1. **Core engine** (`src/physics/sixDof.js`): forces/moments per Hummel & Hubbard
   (2003). Coefficient curves: CL(α) with soft stall, CD(α) quadratic drag polar,
   pitching moment Cm(α), roll/pitch damping, advancing-blade coupling, spin-down.
   **✅ DONE.**
   - **Deviation from the original plan — no quaternion.** A disc is axisymmetric, so
     its spin *phase* is dynamically irrelevant; integrating it would force dt small
     enough to resolve ~1200 rpm (tens of thousands of steps per flight) for
     information immediately discarded. The state is instead `(r, v, n̂, ω_t, s)` —
     position, velocity, top normal, transverse angular velocity, signed spin — which
     is exact for an axisymmetric rigid body and puts the gyroscopic term on one
     readable line. Measured payoff: results agree to **under a foot from dt = 0.001
     to 0.008 s** (asserted in `tests/physics-invariants.test.mjs`).
   - **The mechanism.** Cm(α) crosses zero at a mold-specific trim angle. A disc must
     fly at low α when fast and high α when slow, so: below trim → nose-down moment →
     precesses into right bank → TURN; above trim → nose-up moment → left bank →
     FADE. The S-curve, the beginner meat-hook, and both wind effects are consequences
     of that one line, not scripted phases.
2. **Flight-number mapping** (`src/physics/discCoefficients.js`): the ONLY place
   tuning is allowed. Speed → CD0 and CL0 (low CL0 at high speed is what creates
   "speed demand" and therefore the meat-hook); glide → CLa; turn and fade → the
   Cm(α) line jointly (they are two readings of one curve, which is why they cannot
   be mapped independently). **✅ DONE**, with hard bounds per parameter in
   `CALIBRATION_BOUNDS`.
3. **Throw model:** release speed accepted directly (mph/m·s⁻¹, matching what a launch
   monitor measures — the legacy engine's disc-speed-derived velocity is gone), spin
   scaling with power, hyzer/anhyzer as initial bank, nose angle as true initial angle
   of attack. Handedness/throw style are inputs, so **forehand and left-handed play
   come free** from the spin sign. **✅ DONE.**
   - Calibration: `tools/calibrate.mjs` (Nelder-Mead, 19 parameters, all 35 cases
     scored simultaneously so no case can be improved by silently trading another).
     `npm run calibrate`. **✅ DONE.**
4. **Wind:** 3-D wind vector affecting airspeed (and therefore α and all moments) —
   headwind/tailwind behavior then falls out correctly for free. **✅ DONE in the
   core** (wind is inseparable from correct aerodynamics: `v_air = v − w`); verified
   directionally — headwind lowers α and increases turn, tailwind raises α, kills the
   turn phase and flattens the flight.
5. **Web Worker** (`src/physics/worker.js`): simulation off the main thread; API-
   compatible wrapper so `MapCanvas.jsx` keeps calling `simulateDiscFlight(disc,
   throwParams, wind, getGroundElev)` unchanged. Terrain callback becomes an async
   pre-sampled elevation profile along the aim corridor (Workers can't call Mapbox).
6. Delete `flightPhysics_debug.js`; keep the old engine behind a flag for one release
   as a visual A/B, then remove.

**Acceptance:** All Section 0 envelopes pass, including the low-power Katana and wind
inversion cases. Existing UI works unchanged.

### Status: core physics complete and verified; calibration in progress

`tests/physics-invariants.test.mjs` — **11/11 passing.** These assert engine
properties that are independent of calibration and therefore must hold at all times
(CI runs them as a *blocking* step, unlike the calibration-dependent envelope suite):
frames and spin signs, timestep convergence, overstable discs never crossing right,
hyzer/anhyzer line placement, turn increasing with arm speed, the slow-arm meat-hook,
wind direction-of-effect, LHBH mirroring RHBH exactly, and no energy creation.

**Two sign errors were found and fixed during this work**, both in the derivation
rather than the code structure, and both caught by instrumenting a real flight rather
than by re-reading the math:

1. **Bank ↔ normal geometry was inverted.** The claim "banking right tips the normal
   left" is false — a surface sloping right has a normal tilting *right*. This made
   α-above-trim produce turn instead of fade, so the sign of the Cm(α) slope had to
   flip. The header of `sixDof.js` now carries the surface analogy and a
   hand-checkable precession walkthrough; verify against it before touching a sign.
2. **The same inverted geometry was repeated in the release-angle code**, so a hyzer
   input produced a *right* bank.

Neither would have been caught by the envelope suite alone — a wrong-signed model can
still be fitted to roughly-correct distances, which is precisely why the invariants
file exists alongside it. This is the concrete argument for spending the stronger
model on this section.

**Also fixed (Section 0 bug):** `checkInvariants` hardcoded the legacy engine's
sampling constants and was reporting 18-second drives. Flight time now comes from the
engine; adapters for engines that don't report it compute it from known constants
rather than guessing.

**Resolved — the ground-truth target was wrong, confirmed by the user.** The
`tailwind-hardens-fade` comparative asserted a tailwind throw finishes further LEFT
than calm. It was confounded: a tailwind flight is also *shorter*, so it can fade
harder per second and still finish less far left. Renamed to `tailwind-kills-turn` and
re-measured on `maxRightExcursionFt`, which reads the stability shift directly. Two
more targets turned out wrong the same way and were fixed alongside it: **apex targets
for banked releases** (flex/hyzer/anhyzer had apex set *higher* than the flat throw,
when banking tilts the lift vector and must produce a *lower* apex — a direction error,
not a judgment call), and **one release speed applied to every disc regardless of
speed rating**, which produced a perfectly monotonic distance error (+18% on a putter
→ −13% on a driver) and is now `releaseSpeedMphFor()` / `discReleaseFactor()`, shared
between the test suite and production code (`src/physics/throwerProfile.js`) so they
can never drift apart.

**Calibration status:** `npm run calibrate` (Nelder-Mead, 19 parameters, all 35 cases
scored jointly). First full run scored well (17/35) by exploiting a physically
meaningless degree of freedom — it drove fade's effect on the model toward zero,
making a Teebird and a Firebird nearly the same disc, and bought distance with the
fade it removed. `CALIBRATION_BOUNDS` now encodes physical constraints, not just
numeric ranges (every flight number is bounded to *matter*). That surfaced a real bug:
the engine's moments of inertia were physically impossible (`I_axial` below the
uniform-disc value for a rim-weighted disc; `I_transverse` an independent guess instead
of the perpendicular-axis-theorem-mandated `I_axial/2`) — too little rotational inertia
made the disc over-bank, which is what had made strong fade incompatible with a long
flight in the first place. Fixed. Current calibrated mapping: **13/35** against the
corrected ground truth, non-degenerate (fade still meaningfully differentiates molds).
Three damping parameters pin at their bound wanting *less* damping — a plausible
physical direction, not disqualifying, and left as a follow-up calibration pass rather
than blocking the integration work below.

**✅ Section 1 steps 4–6 (Sonnet tier) — DONE:**
- `src/physics/worker.js` — Web Worker hosting both engines behind one message
  protocol; verified against a real headless Chromium (Node/jsdom have no trustworthy
  Worker implementation), including 8 concurrent rapid-fire throws with monotonic
  distance-vs-power and no stale results.
- `src/physics/flightEngine.js` — `simulateDiscFlightAsync()`, the new public entry
  point. Output points use the same `{x=right, y=up, z=forward}` local frame as the
  legacy engine, so `trajectoryToWGS84` / `localToLngLat` / all of MapCanvas's drawing
  code needed **zero changes**. The call itself had to become `async` (a worker
  inherently is), with a monotonic request-id guard in `MapCanvas.jsx` so a stale
  in-flight result from a slider-drag burst can't overwrite a newer one. Falls back to
  same-thread execution if `Worker` construction fails (SSR, unsupported bundler
  target).
- `src/physics/terrainProfile.js` — terrain sampled once on the main thread (a worker
  can't reach Mapbox) along the throw's bearing and handed over as a lookup table,
  replacing the legacy per-simulation-step `queryTerrainElevation` calls. Deliberate
  simplification: indexed by forward distance only, not lateral position — see the
  file for the reasoning and what would need to change for a course with a severe
  cross-slope.
- `src/physics/engineFlag.js` + a toolbar toggle — localStorage-backed A/B switch
  between `sixdof` (default) and `legacy`, so both engines stay reachable during
  rollout without a code change.
- **Fixed a real double-counting bug found while wiring this up:** the legacy call
  site applied the Aim Angle slider *twice* — once baked into the world bearing, once
  passed into the physics engine's own internal aim parameter. The 6-DOF engine has no
  internal aim parameter at all (it always launches along local +Z), which forced the
  fix: aim now applies exactly once, to the bearing. Documented in `flightEngine.js`;
  the legacy A/B path is untouched (unaffected, and it's on its way out).
  Also fixed a pre-existing dead reference (`MapCanvas`'s exposed `simulateThrow()`
  called an undefined `doFlightSimulation`) found adjacent to this work.
- `tests/physics-integration.test.mjs` — terrain profile and thrower-scaling unit
  tests, wired into CI as a blocking step alongside the engine invariants. CI also now
  runs `npm run build` to catch worker-bundling regressions.
- **Not done (deferred, low priority):** deleting the legacy engine and its throwaway
  ground-truth adapter — kept intentionally for the A/B rollout period per the
  original plan.

**Model:** **Opus 5 / Fable 5** for steps 1–3 (the port, the frame math, the
calibration methodology, and — as it turned out — the ground-truth corrections and the
inertia bug, all of which were exactly the "silent and compounding" failure class this
tier exists for). **Sonnet 5** for steps 4–6 (worker plumbing, the async wrapper, the
A/B flag) — plumbing and UI work with no physics judgment calls, verified empirically
against a real browser rather than trusted by inspection.
Estimated size: 2–3 sessions Opus, 1 session Sonnet. **Actual: ~3 Opus sessions
(including two rounds of ground-truth and one physics bug found via calibration
residuals), 1 Sonnet session.**

---

## Section 2 — LiDAR Tree Inventory Pipeline (real tree shapes)

**Why:** This is the placeholder-tree problem. USGS 3DEP LiDAR contains the actual
shape of every tree on the course; the current pipeline collapses each tree to one
height number and the app stretches two generic Kenney GLB models to match. Fix: keep
the shape.

**Build:** a new package, `tools/lidar_pipeline/` (Python), rather than extending
`process_lidar.py` in place — that script's watch-folder/thin-and-visualize design
(no bounds, no classification, no cropping) doesn't fit steps 1–2's requirements, and
LidarCropper is a sibling repo this session had no access to. `process_lidar.py` is
untouched; it still serves its original role (the calibration-panel LiDAR overlay).

1. **Acquisition** (`acquire.py`) — USGS TNM Access API (`tnmaccess.nationalmap.gov`),
   not an EPT catalog lookup (simpler, official, stable; EPT streaming noted in the
   module as a future optimization if whole-tile downloads prove too slow). Cached by
   filename + size. **✅ DONE.**
2. **Preprocess** (`preprocess.py`, PDAL) — reproject → crop → conditional SMRF →
   denoise → HAG → exact crop. **✅ DONE**, with two decisions beyond the original plan:
   - **All metric filtering happens in a projected (meters) working CRS**, not WGS84 —
     SMRF/HAG parameters are in meters and would silently misbehave in degrees. The
     source CRS is kept if already projected (most USGS deliveries are), otherwise a
     UTM zone is picked from the bbox (`geometry.resolve_working_crs`). Reprojection to
     WGS84 happens once, at the very end, only for output coordinates.
   - **SMRF is conditional**, not unconditional as originally planned — most USGS LPC
     tiles arrive already classified, and re-running SMRF on top of a good
     classification is wasted work at best, a worse classification at worst
     (`preprocess.class_counts_indicate_preclassified`).
3. **Segmentation** (`segmentation.py`) — CHM rasterization → pit filling → smoothing
   → height-scaled local-maximum treetop detection → marker-controlled crown growing
   → per-tree attribute extraction. **✅ DONE.** Three decisions worth recording:
   - **Region growing (Dalponte & Coomes 2016), not watershed.** Watershed partitions
     *every* pixel, so an isolated tree's crown floods outward until it collides with a
     neighbour — it would eat the open fairway. Region growing accepts a pixel only if
     it's a plausible continuation of *that* crown, so isolated trees stop at their own
     edge. On a course, where gaps are the thing players need rendered honestly,
     over-growing crowns into open space is the worse failure. (Also: no scikit-image
     dependency, ~40 explicit lines.)
   - **Attributes come from the POINTS, not the CHM.** The raster is a top-down
     surface; crown base and vertical profile — half of Section 3's payload, and the
     part that decides whether a line exists *under* a canopy — exist only in 3-D. The
     raster is used solely to decide which points belong to which tree.
   - **Crown base is found from horizontal SPREAD, not point density.** Density is the
     intuitive signal and it is wrong: occlusion makes return density decay
     exponentially down through a canopy, so a density threshold stops wherever the
     canopy got thick. Measured against ground truth, the density version overestimated
     crown base by **+5.4 m** — every tree a bare pole with a pom-pom on top, and worse,
     the app telling a player there's a gap under a closed canopy. Spread separates
     crown from trunk cleanly no matter how few returns survive: crowns are metres wide,
     trunks are centimetres. Fixing this, plus pooling width estimates over a sliding
     three-band window (a percentile over 2 points is noise, not a measurement), took
     crown-base RMSE from 6.26 m → 2.67 m and bias from +5.4 m → +0.7 m.
4. **Per-tree schema** (`schema.py`) — `TreeRecord` dataclass matching the plan exactly
   (lng/lat/groundElevM/heightM/crownRadiusM/crownBaseM/6-slice profile/form/
   pointCount), full validation (profile length/range, form enum, height/radius/base
   sanity), JSON read/write, and a `classify_form()` heuristic (tapering silhouette →
   conifer, else deciduous) ready for step 3 to call. **✅ DONE.**
5. **Voxel occupancy grid** (`voxelgrid.py`) — 1 m boolean grid, bit-packed to 1
   bit/cell (verified within 16 bytes of the theoretical minimum), origin/dims header.
   Tested against a synthetic two-cluster point cloud with a real gap between them —
   the gap cell reads unoccupied, the cluster cells read occupied. **✅ DONE.**
6. **Terrain** (`terrain.py`) — downsampled DTM grid JSON, bilinear query, **missing
   cells are `null`, never fabricated** (a deliberate accuracy choice: under dense
   canopy where ground returns are sparse, the consumer should fall back to Mapbox's
   DEM rather than trust an invented elevation). Verified against a synthetic sloped
   ground truth (recovers the exact slope) and a synthetic gap (returns `None`, not an
   interpolated guess). GeoTIFF export is a thin, PDAL-only function, isolated from the
   tested grid-building logic. **✅ DONE.**
7. **Output upload** (`storage.py`) — Firebase Storage, `lidar/{course_id}/...`,
   replacing `public/lidar/`. Partial-failure-tolerant (one file's upload error doesn't
   abort the batch) and partial-state-tolerant (uploads whatever outputs exist — a
   course processed before step 3 lands correctly uploads voxels+DTM without an error
   about the missing tree inventory). **✅ DONE.**
   Orchestrated end-to-end by `pipeline.py` (`python -m tools.lidar_pipeline.pipeline
   --course <id>`), which derives course bounds directly from the *existing*
   `src/data/courses.js` hole data (`geometry.course_bbox_from_holes`, 45 m buffer past
   the treeline; a hand-drawn override goes in `bounds/{course_id}.geojson` — see
   `bounds/README.md`) rather than requiring a boundary file to exist before the
   pipeline can run on any course at all. `--skip-trees` stops cleanly before step 3.

   **Addendum (added during Section 3):** the output set above was missing a raw/
   decimated point cloud — Section 3 step 4's "true view" toggle had nothing to load.
   `pointcloud_export.py` closes that gap (`{course}_points.bin` + header, WGS84
   lng/lat/altitude, capped at 300k points, vegetation-prioritized); wired into
   `pipeline.py` as step 6/7 and into `storage.py`'s upload set. See §3 step 4 for the
   full reasoning.

**What this session could and couldn't verify:** no PDAL system library is installable
in this sandbox, and outbound network is allowlisted to npm/PyPI/Anthropic only — USGS,
AWS, and Firebase are all unreachable here, the same category of gap as Section 1's
missing Mapbox token. Everything free of those two dependencies **was** built and
tested for real, including with actual coordinate transforms (`pyproj`, confirmed
working fully offline) and against the *real* `src/data/courses.js` (not a fixture —
`pipeline.load_course_holes('maple-hill-gold')` genuinely shells out to Node and
returns real hole data). 86 tests, `tests/lidar_pipeline/`, wired into CI as a blocking
step (`.github/workflows/lidar-pipeline-tests.yml`). PDAL pipeline JSON is tested for
correct stage order/parameters, never executed; the acquisition HTTP flow is tested
against a fixture built from the TNM API's documented response schema, never called
live. **A first real run against Maple Hill — with PDAL and network access — is the
actual integration test and hasn't happened yet.**

**How segmentation was validated without data.** The roadmap specified spot-checking
trees against Maple Hill satellite imagery. No LiDAR and no network were available, and
tuning segmentation parameters by eye against nothing is precisely how you end up with
plausible-looking trees in the wrong places. So `synthetic.py` generates point clouds
from *known* trees — with occlusion (upper canopy starves the lower crown of returns),
surface-biased returns, sloped terrain, allometric crown sizes, and deliberately
overlapping crowns — and `validation.py` measures recovery against that exact truth.
Parameters were fitted on three stands and then confirmed on **held-out seeds never used
for tuning**:

| | measured (held-out) | acceptance |
|---|---|---|
| detection rate | 96 % | — |
| commission (false trees) | 1 % | — |
| position RMSE | 0.51 m | < 2 m ✅ |
| crown radius, median rel. error | 14.6 % | < 25 % ✅ |
| height RMSE | 0.10 m | — |
| crown base RMSE | 2.67 m | — |
| form (conifer/deciduous) accuracy | 95 % | — |
| full-course output | 0.32 MB (0.06 MB gzipped) | < 5 MB ✅ |

Detection degrades with canopy density — 100 % at 10 stems/ha, 91 % at 40, 65 % at 160 —
which is inherent to tree detection from airborne LiDAR (a suppressed tree under a
dominant one is not visible from above) and in line with published results. **This does
not degrade collision physics:** Section 4 reads the voxel occupancy grid, which bins
*every* vegetation return regardless of whether segmentation resolved it into a tree.
Missed trees cost rendering fidelity in dense woods, not gameplay correctness.

Synthetic validation is a floor ("not broken"), not a ceiling ("accurate"). A generator
encodes its author's assumptions, and real 3DEP data has scan-angle artifacts,
multi-return structure, understory, deadfall, and leaf-on/leaf-off differences none of
this reproduces. One known bias to check first against real imagery: crown radius is
underestimated by ~0.5 m on average (using a 95th-percentile return distance as the
crown edge). That was left **uncorrected** rather than fitted out with a factor derived
from the generator's own assumptions.

**Acceptance:** Maple Hill processed end-to-end; spot-check ≥ 20 trees against satellite
imagery for position (< 2 m) and crown extent (< 25 %); output < 5 MB. **Criteria met
against synthetic ground truth (table above); the Maple Hill imagery check itself is
still outstanding** and needs an environment with PDAL and network access. That run is
the remaining integration test for the whole section.

**Model:** **Opus 5** for step 3 (segmentation algorithm, parameter choices, and
validation methodology — quality here decides whether the app is trustworthy in woods)
— **done**; entry point `tools/lidar_pipeline/segmentation.segment_trees()`.
**Sonnet 5** for steps 1–2 and 4–7 (well-trodden PDAL/CLI/serialization work) —
**done**. Estimated size: 1 session Opus, 2 sessions Sonnet. **Actual: 1 Sonnet session
for steps 1, 2, 4–7; 1 Opus session for step 3 plus the synthetic-validation harness.**

---

## Section 3 — Parametric Tree Rendering (Three.js custom layer)

**Why:** Mapbox `model` layers can only place and scale pre-made GLBs — structurally
incapable of per-tree geometry. A Mapbox `CustomLayerInterface` with Three.js renders
geometry generated from each tree's own measurements.

**Build:**
1. **Custom layer + coordinate sync** — **✅ DONE.**
   `src/map/mercatorTransform.js` is the transform as pure, dependency-free matrix
   math, and `src/map/TreeLayer.js` is the `CustomLayerInterface` around it (context
   sharing, per-frame matrix, lifecycle, disposal). Verified against **mapbox-gl's own
   `MercatorCoordinate`**, which runs in Node with no GL context and no token — real
   independent ground truth, not a re-derivation. 20 tests, CI-blocking
   (`.github/workflows/map-tests.yml`). Four things worth carrying forward:
   - **Scene frame is X=east, Y=up, Z=south (so NORTH is −Z), in metres, Y read as
     absolute altitude.** Y-up was chosen over a geographer's ENU because Three.js
     builds `CylinderGeometry` and `LatheGeometry` around the Y axis — exactly the
     primitives step 2 needs — so trunks and lathed crowns need no corrective rotation.
   - **The transform mirrors triangle winding, unavoidably.** The scene is
     right-handed; mercator (east, south, up) is left-handed, so the determinant is
     negative. Materials therefore need `DoubleSide` (or `BackSide`); without it trees
     are culled and *invisible with no error anywhere*. Pinned by a test so the sign
     isn't "fixed" later, silently inverting every normal.
   - **Terrain exaggeration is load-bearing, not cosmetic.** MapCanvas ships
     `exaggeration: 2.0`; Mapbox displaces its terrain mesh by that factor but hands
     custom layers an unadjusted matrix, so a tree at true altitude would be **buried**
     under the ground drawn beneath it. The layer reads `map.getTerrain()?.exaggeration`
     per frame and applies it to altitude only. This is a rendering lie told
     consistently to ground and trees so they agree on screen — anything *measuring*
     elevation must still use 1.0 and true altitudes (§2.6 flags the same trap).
   - **Found by testing against Mapbox rather than deriving:** Mapbox scales altitude by
     the WGS84 **mean** radius (6371008.8 m), not the equatorial radius (6378137 m) that
     its horizontal projection is defined on. The intuitive guess — which this file
     originally shipped — makes every altitude 0.11 % wrong: a constant error no
     horizontal test notices, worth ~20 cm on a 200 m hill, and invisible in a
     screenshot.
2. **Geometry from inventory** — **✅ DONE.** `src/map/treeGeometry.js` is pure crown/
   trunk/billboard vertex math (lathe profile points, trunk radius heuristic, cross-
   billboard quads, deterministic color jitter), unit-tested with zero GL dependency —
   27 tests. `TreeLayer.js` consumes it: each tree gets its own `THREE.LatheGeometry`
   (crown, from its measured 6-slice `profile`) and `CylinderGeometry` (trunk), which
   are then **merged** (`BufferGeometryUtils.mergeGeometries`) into one static mesh per
   tier — real per-tree shape preserved (unlike GPU instancing, which needs one shared
   template), a small fixed number of draw calls regardless of tree count. Distance LOD
   (300 m threshold, per the roadmap's suggestion) uses Mapbox's actual camera position
   via the public `getFreeCameraOptions()` API, not a proxy — recomputed on
   `moveend`/`zoomend`, not every frame, since rebuilding merged geometry for thousands
   of trees isn't a per-frame operation. Beyond the threshold, trees render as merged
   cross-billboards (two perpendicular quads, no per-frame camera-facing update needed)
   with a runtime-generated radial-gradient foliage texture.

   **A real bug this testing caught:** the first version's crown and billboard geometry
   were missing the ground-elevation (`base.y`) translation that the trunk code already
   had — `crown_base_m`/`height_m` are heights *above ground* (the LiDAR height-above-
   ground convention Section 2 measures in), not absolute altitude, so every crown would
   have rendered pinned near sea level while its correctly-positioned trunk poked up
   with nothing on top. Caught by a test asserting absolute Y position (an earlier test
   only checked X and missed this class of bug entirely) — fixed, and a dedicated
   "crown base meets trunk top exactly" regression test added. 13 tests
   (`tests/map/TreeLayer.test.mjs`), exercising the real scene-construction code with a
   stubbed `map`/camera — everything except `renderer.render()` itself is testable
   without a GL context.
3. **Anchoring** — **✅ DONE**, folded into step 2: trees are placed at
   `ground_elev_m` (Section 2's DTM-derived ground elevation) via the same verified
   `lngLatAltToScene`, and calibration offsets apply through the existing
   `applyOffsetToTrees` helper (new, `src/utils/calibrationOffset.js`) before trees
   reach the layer.
4. **"True view" toggle** — **✅ DONE**, with a genuine dependency gap found and closed
   along the way: Section 2 never actually exported a raw/decimated point cloud (only
   segmented trees, the voxel grid, and the DTM) — nothing existed for this step to
   toggle to. Closed with a small addition, `tools/lidar_pipeline/pointcloud_export.py`
   (13 Python tests): points decimated to the roadmap's 300k cap, vegetation
   prioritized so the export doesn't cost tree detail, packed as WGS84 lng/lat/altitude
   (not the pipeline's usual working-CRS metres) specifically so the JS side reuses the
   already-verified `lngLatAltToScene` instead of needing a second metric→scene
   transform. `src/map/pointCloudFormat.js` decodes it — **verified against real bytes
   captured from the actual Python packer**, not against the format spec (a first
   attempt at this test used a hand-typed "expected" byte string that was never
   actually generated by running the packer — it happened to decode to plausible-
   looking values, which is exactly how an unverified fixture passes a sloppy check;
   caught by cross-referencing against independently-regenerated output, and corrected
   before commit). `src/map/PointCloudLayer.js` renders it as `THREE.Points`, classification-
   colored to match the existing calibration-overlay palette. Off by default; toggled
   from Calibrate mode alongside the pre-existing LiDAR overlay switch.
5. **✅ DONE.** GLB `model` layer, `show3dTrees` registration, and the two Kenney
   assets removed entirely from `MapCanvas.jsx` — TreeLayer now owns tree rendering
   unconditionally, so there's no "disable per-course" branch to maintain and no
   double-tree case to guard against.

**Verification gap, stated plainly:** no Mapbox token was available anywhere in this
section's development, so **none of this has ever been drawn on a real map**. Every
piece that can be verified without a browser has been — coordinate math against
Mapbox's own `MercatorCoordinate`, crown/billboard geometry against hand-worked
expectations, the point-cloud format against real Python-packed bytes, the full scene-
construction pipeline (mesh counts, LOD tiering, disposal, ground anchoring) against a
stubbed map/camera — but "it looks like trees, at a plausible size, holding 60fps" is
unconfirmed. The LOD threshold (300 m) is the roadmap's suggestion, not something
measured against an actual frame budget. **First run with a token is the real test for
this whole section**, and should specifically check: crown/billboard visibility
(winding), buried-vs-floating trees (terrain exaggeration interaction), LOD switch
smoothness, and frame rate with a realistic tree count.

**Acceptance:** Maple Hill hole 2 ("tight tunnel through pines") is visually
recognizable against a photo/satellite view; 60 fps on a mid-range laptop; trees stay
put under rotate/pitch/zoom and terrain. **Not yet met** — blocked purely on a
token-enabled run (all five build steps are done); also blocked on Section 2 step 3
actually running against real Maple Hill data, since no course has a real tree
inventory file yet.

**Model:** **Opus 5** for step 1 (coordinate sync — same class of frame math that
burned this repo before) — **done**. **Sonnet 5** for steps 2–5 — **done**.
Estimated size: 1 session Opus, 2 sessions Sonnet. **Actual: 1 Opus session
(step 1), 1 Sonnet session (steps 2–5, including closing the point-cloud-export gap
in Section 2 and one real cross-session regression test catch).**

---

## Section 4 — Collision & Line Planning

**Why:** Rendering trees changes nothing if the disc flies through them. This section
makes obstacles *play*.

**Build:**
1. `src/physics/collision.js`: sample the simulated trajectory (~0.5 m steps) against
   (a) the voxel grid — authoritative, includes gaps — and (b) the tree inventory as
   capsules/lathed profiles for attributing *which* tree was hit.
   **✅ DONE, IMPROVED ON THE LITERAL SPEC for (a)** — the voxel-grid hit/no-hit check
   uses exact Amanatides-Woo grid traversal (`traverseSegmentVoxels`), not fixed
   ~0.5 m sampling: sampling can jump clean over a 1 m cell at a shallow grazing
   angle, exact traversal can't. Tie-breaking at cell boundaries advances every
   axis tied for the next crossing simultaneously (a synthetic 45°-diagonal-through-
   a-shared-corner test regresses this — see `collision.test.mjs`). The literal
   "~0.5 m steps" IS used as specified for (b), the secondary tree-capsule
   clearance/attribution pass (`resamplePolyline` + `attributeTreeAtHit`), which
   uses a constant-radius vertical-cylinder capsule per tree (conservative — never
   narrower than the true tapered crown at any height) rather than the full lathed
   profile.
   New coordinate-frame piece this required: the voxel grid's `origin`/`cellM` are
   in working-CRS (UTM-like) metres whose +X/+Y axes are rotated from true
   east/north by the projection's convergence angle (~2° at Maple Hill's longitude,
   ~10 m of error over a 300 m fairway if ignored). `voxelgrid.compute_georeference()`
   (Python) measures this via bearing math and ships it in the header JSON;
   `src/physics/voxelGridFormat.js` (JS) consumes it to build `worldToGridXY`,
   verified end-to-end against a real Python-generated fixture (13 tests). A real
   bug was caught and fixed here: `worldToGridXY` returns coordinates 0-based from
   the grid's origin, but the pre-existing, already-tested `cellAt()` (and this
   session's `traverseSegmentVoxels`) expect the SAME absolute working-CRS frame as
   `header.originX/Y/Z` — `toCollisionSpace`/`toCapsule` add the origin back to
   reconcile the two conventions.
2. Outputs per throw: first-contact point + tree, clearance margin (min distance to
   vegetation along the path), "gap validated" boolean, list of near-misses (< 2 m).
   **✅ DONE** — `analyzeCollision()`'s return shape: `{hit, firstContact: {lng, lat,
   altitude, pointIndex, t, treeIndex}, clearanceM, clearanceFt, gapValidated,
   nearMisses: [{treeIndex, distanceM, distanceFt}]}`. `gapValidated` is defined as
   `!hit` (the voxel grid is authoritative for hit/no-hit; clearance/near-misses are
   a separate, continuous capsule-distance reading the boolean voxel field can't
   give on its own). Tree attribution honestly returns `null` when no capsule
   explains a hit within tolerance — Section 2's segmentation doesn't have 100%
   recall, so an unattributed hit is a real, expected outcome.
3. Flight behavior on hit: truncate flight at contact with a short randomized drop
   (kick model can stay simple — a hit is a hit for planning purposes).
   **✅ DONE** — `truncateTrajectoryAtHit()`. Reuses `firstContact.pointIndex`/`t`
   directly against the LOCAL-frame trajectory (not collision space) — valid
   because `trajectoryToWGS84` maps points 1:1 with no resampling, so segment index
   and interpolation fraction are frame-independent; documented as a load-bearing
   invariant in the code rather than left implicit.
4. UI (`FlightStats.jsx`, `MapCanvas.jsx`): "First tree at 182 ft", clearance readout,
   red marker at contact, path segments colored by clearance; OB-crossing warnings
   once Section 5 provides OB polygons.
   **✅ DONE, ONE ITEM SCOPED DOWN** — "First tree at N ft" and a clearance readout
   (color-graded by tightness) are in `FlightStats.jsx`; a red `HIT` marker at the
   contact point and the flight path itself switching to an alert color on a hit
   are in `MapCanvas.jsx`. "Path segments colored by clearance" (a continuous
   per-vertex gradient) is NOT implemented — the smoothed, rendered curve's
   vertices don't correspond 1:1 to the collision-space samples `analyzeCollision`
   measured, so a faithful version needs its own resampling pass; scoped down to a
   binary alert-color path instead, which is exact (a hit path is, by construction,
   truncated right at the obstacle — there's no "clean" portion after that point to
   distinguish) and flagged in-code as a follow-up rather than silently dropped.
   OB-crossing warnings correctly deferred to Section 5 (no OB polygons exist yet).
5. Runs in the same Web Worker as the sim; voxel grid transferred once per course as
   an ArrayBuffer.
   **✅ DONE** — `flightEngine.loadCourseCollisionData()` transfers the voxel-grid
   ArrayBuffer into the worker once per course (`MapCanvas.jsx`'s new effect, on
   `activeCourse.id`/`calibrationOffset` change); the worker caches it in module
   state and runs `analyzeCollision` + truncation inline with every throw that
   carries `origin`/`bearingDeg`. Calibration offsets apply to the voxel grid's
   georeference the same way they already applied to trees/point-cloud
   (`applyOffsetToVoxelHeader`, new) — otherwise a calibrated map would show trees
   in one place and collide against them in another.

**Acceptance:** On Maple Hill hole 2, a full-power Destroyer on the wrong line hits a
tree in the sim; the documented correct line (straight mid on the tunnel) validates
clean. Randomized trajectories never pass through voxels marked occupied.
**⚠️ NOT YET VERIFIED against real Maple Hill data** — no processed voxel grid/tree
inventory exists for Maple Hill yet (Section 2's pipeline hasn't been run against
real LiDAR for any course in this environment; same standing gap already noted for
Section 3's tree rendering). What IS verified: the traversal algorithm itself
against a real Python-packed fixture and hand-constructed hit/clean/tangent/corner
cases (46 tests across `voxelGridFormat.test.mjs` + `collision.test.mjs`), all
passing, plus full regression across every pre-existing suite (Python 129/129,
JS invariants/integration/map/utils/collision all green; `npm run build` succeeds
with the worker bundle staying small — collision.js pulls in no GL/DOM
dependencies). "Randomized trajectories never pass through voxels marked
occupied" is a property `traverseSegmentVoxels`' exhaustive-cell-coverage design
guarantees by construction (see point 1 above), not something re-verified via
literal Monte Carlo sampling in this pass.

**Model:** **Sonnet 5** for all of it, with a one-shot **Opus 5** review pass on the
ray/capsule/voxel-traversal math (Amanatides-Woo grid traversal is easy to get subtly
wrong at cell boundaries).
**✅ BOTH DONE.** The Opus 5 review pass found three real defects, all fixed and
regression-tested. It was right to insist on this step — the traversal bug was
invisible to a suite that was passing 46/46:

1. **Tie-breaking was backwards, and the code confidently documented the wrong
   rationale.** At an exact corner tie the implementation advanced ALL tied axes at
   once, which gives the geometrically *tight* traversal — visiting only the two
   diagonal cells. The comment claimed this *prevented* corner leak; it *caused* one.
   Two obstacles occupying the off-diagonal pair (touching only at that corner) were
   passed straight through with no hit reported, while rays perturbed ±1e-7 to either
   side both reported one — a false-negative discontinuity exactly on the tie, which
   is what this section's own "randomized trajectories never pass through occupied
   voxels" criterion forbids. Now advances one axis (standard Amanatides-Woo), the
   conservative superset. The prior test asserted the buggy behaviour under the name
   "corner-leak regression"; it now asserts the real property (the exact-corner ray
   must not touch fewer obstacles than its own perturbations).
2. **Clearance measured horizontal distance only.** Samples outside a crown's height
   band were skipped entirely, so a line threading 0.5 m directly over a canopy —
   the single most decision-relevant shot in the app — reported `clearanceM: null`
   ("no data") and zero near-misses. Replaced with a true 3-D signed distance to a
   capped cylinder (`capsuleSurfaceDistance`); that line now reads 0.5 m. Signed, so
   a clean flight can legitimately read negative (inside the bounding crown volume,
   but through a real voxel gap) — surfaced in the UI as "N ft into canopy — through
   a gap" rather than a confusing negative number.
3. **Clearance was O(samples × trees) with no spatial index.** Measured 4 ms at 500
   trees, 29 ms at 5 000, **104 ms at 20 000** — against a 6-DOF sim that costs ~6–7 ms,
   re-run on every settings-slider frame. A uniform bin grid over capsule centres
   (bins sized search-radius + widest crown, so a 3×3 scan can't miss a fat tree in a
   neighbouring bin) brings 20 000 trees to **31 ms**, with a test cross-checking the
   indexed result against an exhaustive scan. Clearance beyond 30 m now reports
   `null` rather than a large number — honest, and what makes the index sound.

Estimated size: 1–2 sessions Sonnet. **Actual: 1 Sonnet session + 1 Opus review pass.**

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
   **✅ DONE (the `courses.js` half; Firestore migration is not — see below).**
   `normalizeHole()`/`validateHole()`/`DATA_QUALITY` added. Every hole in
   `COURSE_DATABASE` now carries an honest `dataQuality`: Oak Grove's real UDisc
   GPS baskets are `measured`; the other 16 courses' `basketFromTee()`-derived
   baskets are `estimated` — verified per-course in tests, not just asserted.
   Optional fields (`obPolygons`, `mandos`, `dropzones`, `pinPositions`, `fairway`)
   default to empty/`null` for every existing course, honestly, rather than
   fabricated: none of that data has actually been measured for any course yet.
   `normalizeHole` is idempotent and used identically by the static DB, the OSM
   importer (below), and will be reused by the in-app editor once it exists — one
   canonicalization path, not three. 14 tests (`tests/data/courses.test.mjs`).
   **Update:** the in-app editor (item 3, now built) DOES write to Firestore —
   see that item for the important caveat that it writes personal drafts, not
   the shared `COURSE_DATABASE` itself.
2. **OSM importer** (`tools/import-osm.mjs`): Overpass query for
   `leisure=disc_golf_course` relations; many courses have mapped tees/baskets.
   **✅ DONE, TARGETING A DIFFERENT (also real) OSM CONVENTION.** OSM has no single
   ratified disc-golf schema; `leisure=disc_golf_course` relations exist but
   individual-hole tagging is inconsistent. This implementation queries the broader
   `sport=disc_golf` (nwr) and recognizes the golf-borrowed per-hole convention
   (`golf=tee`/`golf=hole` + a `ref`/`hole` number) documented on the OSM wiki,
   since that's what's needed to recover individual tee/basket pairs rather than
   just a course boundary polygon. Deliberately does NOT guess: a tee found without
   a matching basket is flagged `dataQuality: 'partial'`, not paired by
   nearest-neighbor distance (wrong on any switchback layout) or silently dropped.
   **Real bug caught before shipping:** the first version routed partial holes
   through `normalizeHole`, which would call `basketFromTee(tee, null, null)` for
   a tee with no known distance/bearing — silent `NaN` coordinates. Fixed by only
   basket-deriving complete holes.
   **⚠️ NOT VERIFIED against a live Overpass response** — this environment's
   network cannot reach `overpass-api.de` (confirmed: proxy returns 403). Query
   construction (bbox coordinate ORDER specifically — Overpass is
   south,west,north,east, the reverse of this app's own field order) and response
   parsing are tested against a fixture built from Overpass's documented schema
   (16 tests, `tests/tools/import-osm.test.mjs`), not live data — same category of
   gap as `acquire.py`'s USGS call. Whether the `golf=tee`/`golf=hole`/`ref`
   convention actually matches what's mapped for a given real course is unverified
   until run somewhere with network access.
3. **In-app course editor:** extend the existing calibrate mode — click satellite
   imagery at zoom 20+ to place/drag tees, baskets, OB vertices, mandos; write to
   Firestore; export/import JSON. This is also the future community-contribution
   surface (course data is the moat).
   **✅ DONE, AS A NEW MODE RATHER THAN AN EXTENSION OF CALIBRATE MODE — AND
   SAVING DRAFTS, NOT PUBLISHING.** `CalibrationPanel`'s "calibrate" is a LiDAR↔
   satellite ALIGNMENT nudge (a single offset applied to already-existing data),
   a genuinely different operation from PLACING new course geometry — folding
   placement tools into that panel would have made both harder to use, so this
   is a new `'edit'` mode/toolbar button (`E`) instead, deliberately.
   Architecture: `src/editor/holeEditState.js` is a pure reducer (`SET_TEE`,
   `SET_BASKET`, `START/ADD/FINISH/CANCEL_OB_POLYGON`, `ADD/REMOVE_MANDO`,
   `ADD/REMOVE_DROPZONE`, `UNDO`, `RESET`, `LOAD`) with a real undo stack,
   fully tested (32 tests) with zero Mapbox/React dependency — `MapCanvas.jsx`'s
   'edit'-mode click handler is a thin adapter dispatching into it, not where any
   decision logic lives. `src/editor/courseEditExport.js` handles
   export/import/merge; `mergeHoleEdit()`'s `dataQuality` rule is the one
   genuinely subtle piece: an edit only becomes `measured` when it supplies
   BOTH a tee AND a basket together — adding just an OB polygon to an
   otherwise-`estimated` hole must NOT silently upgrade its basket to
   `measured` (a real bug this session's own tests caught and pinned down: see
   `courseEditExport.test.mjs`'s "does NOT upgrade dataQuality" test). Save
   writes to `users/{uid}/courseEdits/{courseId}_{holeNum}` (`src/firebase/
   courseEdits.js`) — the SAME "your own docs only" security model
   `firestore.js` already documents, chosen deliberately over inventing a new
   globally-writable collection this session has no way to write real security
   rules for or test against a live project.
   **⚠️ IMPORTANT SCOPE CAVEAT — drafts, not the moat.** Saving currently
   produces a personal, per-user DRAFT. It does NOT write to (or read from)
   the shared `COURSE_DATABASE`, and nothing merges a saved draft into it —
   the roadmap's "future community-contribution surface (course data is the
   moat)" framing implies moderation/merge/conflict-resolution across
   contributors, which is real, unbuilt work, not something to claim done by
   implication. Export/Import JSON is the way an edit currently becomes
   shareable in the meantime.
   **⚠️ NOT VISUALLY VERIFIED.** No Mapbox token in this environment to click
   through the actual map interaction (place a tee, drag it, draw a polygon,
   watch the overlay render) — same standing gap as Sections 3/4's rendering.
   What IS verified: every piece of actual DECISION logic (the reducer, undo,
   export/import round-trip, the merge/dataQuality rule) via 32 tests with no
   GL dependency. `MapCanvas.jsx`'s click-to-dispatch adapter and overlay-
   rendering effect are new, thin, and — like `TreeLayer.js`/`PointCloudLayer.js`
   before them — explicitly the unverified-glue part of this feature, not
   silently assumed correct.
   **Also not done:** dragging an already-placed point (the current interaction
   is click-to-place/re-place, not click-and-drag), and OB polygons drawn here
   are not yet consumed by Section 4's collision analysis — `analyzeCollision`
   still only reads the voxel grid and tree capsules, not `hole.obPolygons`. The
   roadmap's "OB-crossing warnings once Section 5 provides OB polygons" (§4
   item 4) can now be built against real per-hole polygon data, but hasn't been.
4. Replace `basketFromTee()` usage: computed baskets remain only as a fallback and
   are always flagged `estimated`.
   **✅ DONE** — `basketFromTee` is now a private function called from exactly one
   place (`normalizeHole`'s fallback branch), and every hole that goes through it
   is unconditionally marked `estimated` unless the hole itself claims otherwise
   (which none of the 17 courses do). Surfaced in the UI per item 1's "show it"
   requirement: `FlightStats.jsx`'s hole panel and `CourseManager.jsx`'s hole list
   both badge non-`measured` holes.

**Acceptance:** Maple Hill fully re-measured via editor against satellite + published
caddie book; every hole's UI shows data quality; OB renders and feeds Section 4.
**⚠️ STILL PARTIALLY MET — the editor now EXISTS, but no one has used it.**
Every hole's UI shows data quality (done). Maple Hill has NOT been re-measured —
the tool to do it now exists, but actually clicking through 18 holes against
satellite imagery + the caddie book is human work this session can't do by
itself (and couldn't visually verify even if it tried — no Mapbox token here).
OB rendering exists (the edit-mode overlay draws polygons live while editing),
but OB does not yet FEED Section 4 — `analyzeCollision` doesn't consume
`hole.obPolygons` yet, so "feeds Section 4" remains a real gap, now blocked on
new collision-analysis work rather than on the editor.

**Model:** **Sonnet 5** for the editor and importer. **Haiku 4.5** for the data
grunt work (re-entering hole data, migrating the 10 existing courses to schema v2).
**Schema v2, importer, AND the in-app editor are all done on Sonnet 5.** The
Haiku 4.5 data-entry pass (actually re-measuring the 17 courses through the
editor) is the one item genuinely left, and it's real human/data work, not
more code to write.
Estimated size: 2 sessions Sonnet, Haiku as needed. **Actual: 2 Sonnet sessions
(schema v2 + importer, then the editor); Haiku data-entry pass not started.**

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
