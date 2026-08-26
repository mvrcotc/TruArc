"""
TruArc LiDAR Pipeline — Synthetic Forest Generator (validation support)

Generates a LiDAR-like point cloud from a KNOWN set of trees, so
segmentation can be measured against exact ground truth rather than
eyeballed.

WHY THIS EXISTS: docs/ACCURACY_ROADMAP.md §2 specifies validating
segmentation by spot-checking trees against satellite imagery. That
check is necessary but weak — imagery gives you approximate position and
crown extent for the trees you can see from above, and says nothing at
all about crown BASE or the vertical crown PROFILE, which are half the
payload Section 3 renders from. It also can't be run in CI. Synthetic
ground truth is complementary: exact on every attribute, cheap to
regenerate, and it makes parameter choices measurable instead of
aesthetic.

It is NOT a substitute for real-data validation. A generator encodes its
author's assumptions about what trees look like, so an algorithm tuned
only against it is tuned against those assumptions. Real 3DEP data has
scan-angle artifacts, multi-return structure, understory, deadfall,
mixed species, and leaf-off/leaf-on differences none of this reproduces.
Treat the synthetic scores as a floor ("the algorithm is not broken"),
not a ceiling ("the algorithm is accurate"). The Maple Hill spot-check
still has to happen.

Realism deliberately included, because each of these changes what a
correct algorithm must cope with:
  • occlusion — upper canopy intercepts most pulses, so lower crown is
    sparsely sampled. This is the main reason crown-base estimation is
    hard, and a generator with uniform density would make it look easy.
  • surface-biased returns — first returns dominate, so points cluster
    on the crown envelope rather than filling its volume.
  • sloped, undulating terrain — forces the pipeline to work in
    height-above-ground rather than raw Z.
  • overlapping crowns — the case that separates a real ITD algorithm
    from a local-maximum finder.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

# Matches the PDAL output dtype the real pipeline produces, so synthetic
# clouds are drop-in substitutes for preprocess.run_preprocess() output.
POINT_DTYPE = np.dtype([
    ("X", "f8"), ("Y", "f8"), ("Z", "f8"),
    ("Classification", "u1"), ("HeightAboveGround", "f8"),
])

CLASS_GROUND = 2
CLASS_HIGH_VEG = 5


@dataclass(frozen=True)
class SyntheticTree:
    x: float
    y: float
    height_m: float          # above ground
    crown_radius_m: float    # max radius, at the widest slice
    crown_base_m: float      # height above ground where foliage starts
    form: str                # "conifer" | "deciduous"

    def envelope_radius(self, t: float) -> float:
        """
        Crown radius at normalized height t in [0,1], where t=0 is the
        crown base and t=1 the treetop.

        Conifer: monotonic taper to a point (cone-like, slightly convex).
        Deciduous: ellipsoid whose widest point sits a little below
        mid-crown, which is what broadleaf crowns actually do.
        """
        t = min(1.0, max(0.0, t))
        if self.form == "conifer":
            return self.crown_radius_m * (1.0 - t) ** 0.75
        centre, half = 0.45, 0.58
        val = 1.0 - ((t - centre) / half) ** 2
        return self.crown_radius_m * math.sqrt(max(0.0, val))


def terrain_z(x: np.ndarray, y: np.ndarray, slope: float = 0.04, relief_m: float = 6.0) -> np.ndarray:
    """Sloped, gently undulating ground surface — enough relief that using
    raw Z instead of height-above-ground would visibly break."""
    return 100.0 + slope * x + relief_m * np.sin(x / 40.0) * np.cos(y / 55.0)


def generate_forest(
    trees: list[SyntheticTree],
    area_x: tuple[float, float],
    area_y: tuple[float, float],
    pulse_density: float = 8.0,
    ground_density: float = 1.5,
    z_noise_m: float = 0.05,
    seed: int = 0,
) -> np.ndarray:
    """
    Build a point cloud for `trees` over the given area.

    @param pulse_density: canopy returns per m² of crown footprint —
        USGS 3DEP QL2 is ~2 pts/m² minimum, modern collects often 8-20.
    @param ground_density: ground returns per m² in the open. Under
        canopy this is attenuated automatically by occlusion.
    """
    rng = np.random.default_rng(seed)
    xs, ys, zs, cls, hags = [], [], [], [], []

    for tree in trees:
        crown_depth = tree.height_m - tree.crown_base_m
        if crown_depth <= 0:
            continue
        footprint = math.pi * tree.crown_radius_m ** 2
        n_points = max(40, int(footprint * pulse_density))

        # Sample heights biased toward the top: the canopy surface
        # intercepts pulses first, so the upper crown is far better
        # sampled than the lower crown. `t**0.6` skews sampling upward;
        # the occlusion keep-test below thins the lower crown further.
        t = rng.random(n_points) ** 0.6
        h = tree.crown_base_m + t * crown_depth

        env_r = np.array([tree.envelope_radius(ti) for ti in t])
        # Returns cluster on the crown ENVELOPE rather than filling its
        # volume — radial position biased strongly outward.
        r = env_r * (0.55 + 0.45 * rng.random(n_points) ** 0.5)
        theta = rng.uniform(0, 2 * math.pi, n_points)

        # Occlusion: probability of a pulse reaching depth d below the
        # treetop decays with the canopy it must pass through.
        depth_frac = 1.0 - t
        keep = rng.random(n_points) < np.exp(-1.4 * depth_frac)
        # Always keep a few apex points so the treetop is well defined.
        keep |= t > 0.93

        px = tree.x + r * np.cos(theta)
        py = tree.y + r * np.sin(theta)
        xs.append(px[keep]); ys.append(py[keep]); hags.append(h[keep])
        cls.append(np.full(keep.sum(), CLASS_HIGH_VEG, dtype=np.uint8))

        # Sparse trunk returns below the crown base — present in real
        # data, and a source of error for naive crown-base estimators.
        n_trunk = max(2, int(tree.crown_base_m * 0.8))
        th = rng.uniform(0.5, tree.crown_base_m, n_trunk)
        tr = rng.uniform(0, 0.35, n_trunk)
        ta = rng.uniform(0, 2 * math.pi, n_trunk)
        xs.append(tree.x + tr * np.cos(ta)); ys.append(tree.y + tr * np.sin(ta))
        hags.append(th)
        cls.append(np.full(n_trunk, CLASS_HIGH_VEG, dtype=np.uint8))

    # Ground returns, attenuated under crowns.
    area = (area_x[1] - area_x[0]) * (area_y[1] - area_y[0])
    n_ground = int(area * ground_density)
    gx = rng.uniform(area_x[0], area_x[1], n_ground)
    gy = rng.uniform(area_y[0], area_y[1], n_ground)
    under_canopy = np.zeros(n_ground, dtype=bool)
    for tree in trees:
        d2 = (gx - tree.x) ** 2 + (gy - tree.y) ** 2
        under_canopy |= d2 < tree.crown_radius_m ** 2
    keep_ground = rng.random(n_ground) < np.where(under_canopy, 0.25, 1.0)
    xs.append(gx[keep_ground]); ys.append(gy[keep_ground])
    hags.append(np.zeros(keep_ground.sum()))
    cls.append(np.full(keep_ground.sum(), CLASS_GROUND, dtype=np.uint8))

    X = np.concatenate(xs); Y = np.concatenate(ys)
    HAG = np.concatenate(hags); C = np.concatenate(cls)
    HAG = HAG + rng.normal(0, z_noise_m, len(HAG))
    HAG = np.maximum(HAG, 0.0)
    Z = terrain_z(X, Y) + HAG

    points = np.empty(len(X), dtype=POINT_DTYPE)
    points["X"] = X; points["Y"] = Y; points["Z"] = Z
    points["Classification"] = C; points["HeightAboveGround"] = HAG
    return points


def random_stand(
    n_trees: int,
    area_x: tuple[float, float],
    area_y: tuple[float, float],
    seed: int = 0,
    min_spacing_m: float = 3.0,
    conifer_fraction: float = 0.4,
) -> list[SyntheticTree]:
    """
    A plausible mixed stand. Crown radius follows Popescu & Wynne (2004)
    allometry (crown width ≈ 2.5 + 0.009·h² for deciduous, slightly
    narrower for conifers), with scatter, so crown size correlates with
    height the way real stands do — an algorithm that assumes a fixed
    crown size will be visibly penalised.

    `min_spacing_m` is deliberately small enough to force overlapping
    crowns, which is the case that actually tests the segmentation.
    """
    rng = np.random.default_rng(seed)
    trees: list[SyntheticTree] = []
    attempts = 0
    while len(trees) < n_trees and attempts < n_trees * 200:
        attempts += 1
        x = rng.uniform(*area_x)
        y = rng.uniform(*area_y)
        if any((x - t.x) ** 2 + (y - t.y) ** 2 < min_spacing_m ** 2 for t in trees):
            continue

        form = "conifer" if rng.random() < conifer_fraction else "deciduous"
        height = float(rng.uniform(6.0, 30.0))
        if form == "conifer":
            width = 3.10 + 0.0072 * height ** 2
        else:
            width = 2.52 + 0.0090 * height ** 2
        radius = float(max(1.0, (width / 2.0) * rng.uniform(0.8, 1.2)))
        # Conifers hold live crown much further down the stem than
        # broadleaves, which is most of what distinguishes their profiles.
        base_frac = rng.uniform(0.15, 0.35) if form == "conifer" else rng.uniform(0.35, 0.6)
        trees.append(SyntheticTree(x, y, height, radius, float(height * base_frac), form))
    return trees
