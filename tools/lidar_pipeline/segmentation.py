"""
TruArc LiDAR Pipeline — Individual Tree Segmentation (Section 2, step 3)

Turns a classified, height-above-ground point cloud into per-tree records
carrying the crown SHAPE, which is the whole point of Section 2: the app
currently stretches two generic GLB models by a height number, and this
is what replaces that with each tree's real silhouette.

PIPELINE
    1. CHM rasterization      — canopy height model, max HAG per cell
    2. Pit filling            — remove penetration artifacts
    3. Smoothing              — suppress noise-driven false treetops
    4. Treetop detection      — local maxima, window scaled by height
    5. Crown delineation      — marker-controlled region growing
    6. Attribute extraction   — height/radius/base/profile/form, FROM
                                POINTS not from the raster (see below)

WHY REGION GROWING RATHER THAN WATERSHED
Marker-controlled watershed is the more commonly cited method, but the
two behave almost identically when seeded with the same treetops, and
watershed has one property that is actively wrong here: it partitions
*every* pixel, so a crown expands until it collides with a neighbour,
and isolated trees bleed out into open fairway. Dalponte & Coomes (2016)
region growing accepts a pixel only if it is a plausible continuation of
*that* crown (tall enough relative to the seed and to the running crown
mean, not climbing back uphill into a neighbouring tree, within a
maximum radius), so an isolated tree stops at its own crown edge. On a
disc golf course, where fairway gaps are exactly the thing a player
needs rendered correctly, over-growing crowns into open space is the
worse failure. It's also implementable in ~40 explicit lines with no
extra dependency, versus pulling in scikit-image.

WHY ATTRIBUTES COME FROM POINTS, NOT THE CHM
The CHM is a top-down surface: it knows where the canopy top is and
nothing about what is underneath. Crown base and the vertical profile —
half of what Section 3 renders and the part that determines whether a
gap under the canopy is throwable — exist only in the 3-D points. So
the raster is used solely to decide WHICH points belong to WHICH tree,
and every reported attribute is then measured from those points.

PARAMETERS
Defaults in `SegmentationParams` were fitted against synthetic stands
with exact known ground truth (tools/lidar_pipeline/synthetic.py, and
tests/lidar_pipeline/test_segmentation.py, which asserts recovery
accuracy rather than just "it runs"). See that test file for the
measured detection/position/height/radius/form error the defaults
achieve, and the module docstring in synthetic.py for why synthetic
validation is a floor rather than a ceiling — real-data validation
against Maple Hill imagery is still outstanding.
"""
from __future__ import annotations

import heapq
import logging
import math
from dataclasses import dataclass

import numpy as np
from scipy import ndimage

from .schema import TreeRecord, classify_form

log = logging.getLogger("truarc.lidar.segmentation")

CLASS_VEGETATION = (3, 4, 5)


@dataclass(frozen=True)
class SegmentationParams:
    # ─ Raster ─
    chm_res_m: float = 0.5
    pit_drop_threshold_m: float = 1.5
    smooth_sigma_cells: float = 0.5
    # ─ Treetop detection ─
    min_tree_height_m: float = 3.0     # below this is understory, not an obstacle worth rendering
    lm_window_base_m: float = 1.0      # local-maximum search radius = base + slope*height.
    lm_window_slope: float = 0.09      # Fitted on synthetic stands: this sits at the knee of the
    lm_window_min_m: float = 1.0       # detection/commission tradeoff — narrower splits single
    lm_window_max_m: float = 3.5       # crowns into several (0.055 -> 12% commission), wider
                                       # starts losing real trees (0.12 -> 92% detection).
    # ─ Crown growing (Dalponte & Coomes 2016) ─
    th_seed: float = 0.45              # pixel must exceed this fraction of its seed's height
    th_crown: float = 0.60             # ...and this fraction of the crown's running mean height
    uphill_tolerance_m: float = 0.5    # stop before climbing into a taller neighbouring crown
    max_crown_radius_m: float = 9.0    # hard cap; nothing on a golf course has a 9 m crown radius
    min_crown_cells: int = 4           # smaller than this is noise, not a tree
    # ─ Attribute extraction ─
    profile_slices: int = 6            # fixed by the TreeRecord schema / Section 3's renderer
    radius_percentile: float = 95.0    # robust crown edge; max() would chase single stray returns
    min_slice_points: int = 4
    crown_base_collapse_frac: float = 0.30   # band narrower than this fraction of the crown's
                                             # widest band is trunk, not foliage
    crown_base_min_bin_points: int = 2       # below this a band is too sparse to measure width
    crown_base_confirm_bands: int = 2        # consecutive narrow bands needed to call it trunk.
                                             # 1 scores marginally better on synthetic data but
                                             # relies on every narrow band being real; 2 is kept
                                             # for the messier inputs (understory, deadfall,
                                             # points bled in from neighbours) the generator
                                             # does not reproduce.


# ─── 1-3. CANOPY HEIGHT MODEL ────────────────────────────────────

def rasterize_chm(x: np.ndarray, y: np.ndarray, hag: np.ndarray, res_m: float
                   ) -> tuple[np.ndarray, float, float]:
    """Max height-above-ground per cell. Returns (chm, origin_x, origin_y);
    empty cells are 0.0 (bare ground reads as zero canopy)."""
    min_x, min_y = float(x.min()), float(y.min())
    nx = int(np.ceil((float(x.max()) - min_x) / res_m)) + 1
    ny = int(np.ceil((float(y.max()) - min_y) / res_m)) + 1

    ix = np.clip(((x - min_x) / res_m).astype(np.int64), 0, nx - 1)
    iy = np.clip(((y - min_y) / res_m).astype(np.int64), 0, ny - 1)

    chm = np.zeros((nx, ny), dtype=np.float64)
    np.maximum.at(chm, (ix, iy), hag)
    return chm, min_x, min_y


def fill_pits(chm: np.ndarray, drop_threshold_m: float = 1.5) -> np.ndarray:
    """
    Replace 'pits' — cells markedly lower than their surroundings, where a
    pulse punched through the canopy — with the local median.

    Pits matter more than they sound: a single pit inside a crown creates
    a ring of spurious local maxima around it, so one tree gets detected
    as several. Only cells that are genuinely anomalous relative to their
    neighbourhood are touched, so real canopy gaps (which are wide, not
    single-cell) survive — those gaps are load-bearing for this app and
    must not be smoothed away.
    """
    median3 = ndimage.median_filter(chm, size=3, mode="nearest")
    is_pit = (median3 - chm) > drop_threshold_m
    out = chm.copy()
    out[is_pit] = median3[is_pit]
    return out


def smooth_chm(chm: np.ndarray, sigma_cells: float = 0.7) -> np.ndarray:
    """Light Gaussian smoothing. Enough to stop measurement noise from
    registering as treetops, little enough to keep adjacent crowns
    separable — over-smoothing merges neighbouring trees into one."""
    return ndimage.gaussian_filter(chm, sigma=sigma_cells, mode="nearest")


# ─── 4. TREETOP DETECTION ────────────────────────────────────────

def detect_treetops(chm: np.ndarray, p: SegmentationParams) -> list[tuple[int, int]]:
    """
    Local maxima with a height-dependent search window: tall trees have
    wide crowns and need a wide window to avoid being split, while short
    trees need a narrow one or they get swallowed by a tall neighbour.

    Implemented as a small set of discrete window sizes (each a cheap
    vectorised maximum_filter) with each cell judged against the window
    its own height selects — a true per-cell variable window would be a
    Python loop over millions of cells.
    """
    # Height bands, each with the window radius its heights imply. Bands
    # sharing a rounded cell radius are merged so maximum_filter runs
    # once per distinct window size.
    band_edges = [p.min_tree_height_m, 8.0, 13.0, 18.0, 24.0, np.inf]
    by_radius: dict[int, list[tuple[float, float]]] = {}
    for lo, hi in zip(band_edges[:-1], band_edges[1:]):
        representative = lo if not np.isinf(hi) else lo + 6.0
        r_m = float(np.clip(p.lm_window_base_m + p.lm_window_slope * representative,
                             p.lm_window_min_m, p.lm_window_max_m))
        r_cells = max(1, int(round(r_m / p.chm_res_m)))
        by_radius.setdefault(r_cells, []).append((lo, hi))

    is_max = np.zeros(chm.shape, dtype=bool)
    for r_cells, bands in by_radius.items():
        maxf = ndimage.maximum_filter(chm, size=2 * r_cells + 1, mode="constant", cval=-1.0)
        in_band = np.zeros(chm.shape, dtype=bool)
        for lo, hi in bands:
            in_band |= (chm >= lo) & (chm < hi)
        is_max |= in_band & (chm == maxf)

    is_max &= chm >= p.min_tree_height_m
    coords = np.argwhere(is_max)

    # A flat plateau at a crown apex yields several adjacent "maxima";
    # collapse each connected cluster to its centroid so one apex is one
    # tree.
    if len(coords) == 0:
        return []
    marker = np.zeros(chm.shape, dtype=bool)
    marker[coords[:, 0], coords[:, 1]] = True
    labels, n = ndimage.label(marker, structure=np.ones((3, 3)))
    centres = ndimage.center_of_mass(marker, labels, range(1, n + 1))
    return [(int(round(r)), int(round(c))) for r, c in centres]


# ─── 5. CROWN DELINEATION ────────────────────────────────────────

def grow_crowns(chm: np.ndarray, seeds: list[tuple[int, int]], p: SegmentationParams) -> np.ndarray:
    """
    Marker-controlled region growing, flooding from the highest cell
    outward. Returns an int label raster (0 = unassigned).

    Each candidate pixel must satisfy all of:
      • tall enough to be canopy at all
      • >= th_seed x its seed's height        (bounds total crown depth)
      • >= th_crown x the crown's running mean (stops runaway growth down
                                                a slope of decreasing height)
      • not more than `uphill_tolerance_m` taller than the cell it grew
        from (climbing means we've crossed into a neighbouring tree)
      • within max_crown_radius_m of the seed
    """
    nx, ny = chm.shape
    labels = np.zeros((nx, ny), dtype=np.int32)
    max_r_cells = p.max_crown_radius_m / p.chm_res_m

    seed_height: dict[int, float] = {}
    run_sum: dict[int, float] = {}
    run_count: dict[int, int] = {}
    heap: list[tuple[float, int, int, int]] = []

    for i, (r, c) in enumerate(seeds, start=1):
        if not (0 <= r < nx and 0 <= c < ny):
            continue
        labels[r, c] = i
        seed_height[i] = float(chm[r, c])
        run_sum[i] = float(chm[r, c])
        run_count[i] = 1
        heapq.heappush(heap, (-float(chm[r, c]), r, c, i))

    while heap:
        neg_h, r, c, lab = heapq.heappop(heap)
        here = -neg_h
        sr, sc = seeds[lab - 1]
        for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nr, nc = r + dr, c + dc
            if not (0 <= nr < nx and 0 <= nc < ny) or labels[nr, nc] != 0:
                continue
            h = float(chm[nr, nc])
            if h < p.min_tree_height_m:
                continue
            if h > here + p.uphill_tolerance_m:
                continue
            if h < p.th_seed * seed_height[lab]:
                continue
            if h < p.th_crown * (run_sum[lab] / run_count[lab]):
                continue
            if (nr - sr) ** 2 + (nc - sc) ** 2 > max_r_cells ** 2:
                continue
            labels[nr, nc] = lab
            run_sum[lab] += h
            run_count[lab] += 1
            heapq.heappush(heap, (-h, nr, nc, lab))

    # Drop specks too small to be a real crown.
    for lab in range(1, len(seeds) + 1):
        if run_count.get(lab, 0) < p.min_crown_cells:
            labels[labels == lab] = 0
    return labels


# ─── 6. ATTRIBUTE EXTRACTION ─────────────────────────────────────

def estimate_crown_base(dists: np.ndarray, heights: np.ndarray, top_m: float,
                         p: SegmentationParams) -> float:
    """
    Height at which foliage starts, from the horizontal SPREAD of returns
    per height band — not from their density.

    Density is the intuitive signal and it is wrong here. Occlusion makes
    return density fall off exponentially down through the canopy, so a
    density-threshold estimator stops wherever the canopy got thick
    rather than where the crown actually ends: measured against synthetic
    ground truth it overestimated crown base by +5.4 m on average, which
    would render every tree as a bare pole with a pom-pom on top and,
    worse, would tell a player a line exists under a canopy that is
    really closed.

    Spread separates the two cleanly regardless of how few points survive
    to a given height: crown bands are metres wide, trunk bands are
    centimetres. Walking down from the widest band and stopping where
    width collapses to a fraction of the crown's maximum finds the
    foliage boundary directly. Bands too sparse to measure are skipped
    rather than treated as collapsed, since sparsity is exactly what
    occlusion guarantees down there.
    """
    if len(heights) < 8:
        return max(0.0, top_m * 0.4)

    bin_m = max(0.5, top_m / 24.0)
    n_bins = max(3, int(math.ceil(top_m / bin_m)))
    idx = np.clip((heights / bin_m).astype(int), 0, n_bins - 1)

    # Width is estimated over a SLIDING window of three bands rather than
    # one. Deep in the canopy a single band may hold two or three
    # returns, and a width percentile over two points is noise — if both
    # happen to land near the stem the band looks like trunk and the
    # descent stops metres too high. Pooling neighbours trades a little
    # vertical resolution for an estimate that is actually measuring
    # something.
    band_r = np.full(n_bins, np.nan)
    for b in range(n_bins):
        m = (idx >= b - 1) & (idx <= b + 1)
        if int(m.sum()) >= p.crown_base_min_bin_points:
            band_r[b] = np.percentile(dists[m], 90.0)

    valid = ~np.isnan(band_r)
    if valid.sum() < 2:
        return max(0.0, top_m * 0.4)

    peak_b = int(np.nanargmax(band_r))
    threshold = p.crown_base_collapse_frac * float(np.nanmax(band_r))

    # Hysteresis: one narrow band is not proof the crown has ended, so
    # require consecutive narrow bands before calling it trunk. Without
    # this a single unlucky band truncates the crown.
    base_b = peak_b
    consecutive_narrow = 0
    for b in range(peak_b, -1, -1):
        if not valid[b]:
            continue  # too sparse to judge — keep descending
        if band_r[b] >= threshold:
            base_b = b
            consecutive_narrow = 0
        else:
            consecutive_narrow += 1
            if consecutive_narrow >= p.crown_base_confirm_bands:
                break

    return float(min(max(base_b * bin_m, 0.0), top_m * 0.95))


def extract_profile(dists: np.ndarray, heights: np.ndarray, base_m: float, top_m: float,
                     p: SegmentationParams) -> tuple[list[float], float]:
    """
    Crown radius in `profile_slices` bands from crown base to treetop.

    Returns (normalised profile, max radius). Sparse bands — common low
    in the crown, where occlusion starves the lower canopy of returns —
    are interpolated from their populated neighbours rather than being
    reported as zero width, which would render as an hourglass-shaped
    tree.
    """
    n = p.profile_slices
    depth = max(top_m - base_m, 1e-6)
    edges = np.linspace(base_m, top_m, n + 1)

    radii: list[float | None] = []
    for i in range(n):
        lo, hi = edges[i], edges[i + 1]
        in_band = (heights >= lo) & (heights < hi if i < n - 1 else heights <= hi)
        if in_band.sum() >= p.min_slice_points:
            radii.append(float(np.percentile(dists[in_band], p.radius_percentile)))
        else:
            radii.append(None)

    known = [i for i, r in enumerate(radii) if r is not None]
    if not known:
        return [0.0] * n, 0.0
    for i in range(n):
        if radii[i] is None:
            nearest = min(known, key=lambda k: abs(k - i))
            # Taper toward the apex when extrapolating past the topmost
            # populated band, rather than holding the last width — a
            # flat-topped tree is a more visible error than a slim one.
            radii[i] = radii[nearest] * (0.6 if i > max(known) else 1.0)

    max_r = max(radii) or 1e-6
    return [float(min(1.0, r / max_r)) for r in radii], float(max_r)


def segment_trees(points, working_crs: str, params: SegmentationParams | None = None) -> list[TreeRecord]:
    """
    Section 2, step 3. See module docstring.

    @param points: structured array with X, Y, Z, Classification and
        HeightAboveGround, in `working_crs` METRES — i.e. exactly what
        preprocess.run_preprocess() returns.
    @returns TreeRecords with lng/lat converted back to WGS84.
    """
    import pyproj

    p = params or SegmentationParams()

    veg_mask = np.isin(points["Classification"], CLASS_VEGETATION)
    veg = points[veg_mask]
    if len(veg) == 0:
        log.warning("segment_trees: no vegetation points supplied")
        return []

    vx, vy = veg["X"].astype(np.float64), veg["Y"].astype(np.float64)
    vh = veg["HeightAboveGround"].astype(np.float64)
    vz = veg["Z"].astype(np.float64)

    chm_raw, ox, oy = rasterize_chm(vx, vy, vh, p.chm_res_m)
    chm = smooth_chm(fill_pits(chm_raw, p.pit_drop_threshold_m), p.smooth_sigma_cells)

    seeds = detect_treetops(chm, p)
    log.info("segment_trees: %d treetop candidate(s) from %d veg points", len(seeds), len(veg))
    if not seeds:
        return []

    labels = grow_crowns(chm, seeds, p)

    # Map every vegetation point to its crown via the label raster.
    ix = np.clip(((vx - ox) / p.chm_res_m).astype(np.int64), 0, chm.shape[0] - 1)
    iy = np.clip(((vy - oy) / p.chm_res_m).astype(np.int64), 0, chm.shape[1] - 1)
    point_label = labels[ix, iy]

    to_wgs84 = pyproj.Transformer.from_crs(working_crs, "EPSG:4326", always_xy=True)
    records: list[TreeRecord] = []

    for lab in range(1, len(seeds) + 1):
        sel = point_label == lab
        n_pts = int(sel.sum())
        if n_pts < 8:
            continue

        hs = vh[sel]
        # 99th percentile, not max: a single high outlier that survived
        # denoising would otherwise set the tree's height.
        top_m = float(np.percentile(hs, 99))
        if top_m < p.min_tree_height_m:
            continue

        # Apex position from the topmost returns, which is more precise
        # than the seed cell's centre (a 0.5 m raster quantises position).
        apex_cut = max(top_m * 0.85, top_m - 2.0)
        apex = hs >= apex_cut
        if apex.sum() < 3:
            apex = hs >= np.percentile(hs, 90)
        cx = float(np.mean(vx[sel][apex]))
        cy = float(np.mean(vy[sel][apex]))

        dists = np.hypot(vx[sel] - cx, vy[sel] - cy)
        base_m = estimate_crown_base(dists, hs, top_m, p)
        crown_pts = hs >= base_m
        if crown_pts.sum() < p.min_slice_points:
            continue
        profile, crown_radius = extract_profile(dists[crown_pts], hs[crown_pts], base_m, top_m, p)
        if crown_radius <= 0:
            continue

        ground_elev = float(np.mean(vz[sel] - hs))
        lng, lat = to_wgs84.transform(cx, cy)

        rec = TreeRecord(
            lng=float(lng), lat=float(lat), ground_elev_m=round(ground_elev, 2),
            height_m=round(top_m, 2), crown_radius_m=round(crown_radius, 2),
            crown_base_m=round(min(base_m, top_m * 0.95), 2),
            profile=tuple(round(v, 3) for v in profile),
            form=classify_form(tuple(profile)), point_count=n_pts,
        )
        try:
            rec.validate()
        except ValueError as e:
            log.warning("segment_trees: dropping implausible tree at (%.1f, %.1f): %s", cx, cy, e)
            continue
        records.append(rec)

    log.info("segment_trees: %d tree(s) after attribute extraction", len(records))
    return records
