"""
Segmentation tests (Section 2, step 3).

These assert RECOVERY ACCURACY against known ground truth, not merely
that the code runs. A segmentation that returns plausible-looking trees
in the wrong places would pass a smoke test and silently make the app
untrustworthy in exactly the situation it exists for — a wooded fairway.

Thresholds are set with margin below the measured performance so the
suite fails on genuine regression rather than on random variation, and
the seeds are fixed so runs are reproducible.

Measured on held-out stands (seeds not used to fit the defaults):
    detection 96%   commission 1%
    position  RMSE 0.51 m      height RMSE 0.10 m
    crown radius RMSE 0.78 m   crown base RMSE 2.67 m
    form accuracy 95%
See tools/lidar_pipeline/synthetic.py for why synthetic validation is a
floor and not a substitute for the Maple Hill imagery check.
"""
import math
import unittest

import numpy as np
import pyproj

from tools.lidar_pipeline.segmentation import (
    SegmentationParams, rasterize_chm, fill_pits, smooth_chm,
    detect_treetops, grow_crowns, estimate_crown_base, extract_profile, segment_trees,
)
from tools.lidar_pipeline.synthetic import (
    SyntheticTree, generate_forest, random_stand, POINT_DTYPE, CLASS_HIGH_VEG,
)
from tools.lidar_pipeline.validation import validate

# Synthetic stands are placed at a real UTM 19N location (the Maple Hill
# area) so the WGS84 conversion inside segment_trees is exercised for
# real rather than bypassed.
ORIGIN_X, ORIGIN_Y = 261000.0, 4684500.0
WORKING_CRS = "EPSG:32619"
_BACK = pyproj.Transformer.from_crs("EPSG:4326", WORKING_CRS, always_xy=True)


def to_local(lng, lat):
    x, y = _BACK.transform(lng, lat)
    return (x - ORIGIN_X, y - ORIGIN_Y)


def build_stand(n_trees, side, seed, **kw):
    trees = random_stand(n_trees, (0, side), (0, side), seed=seed, **kw)
    pts = generate_forest(trees, (0, side), (0, side), seed=seed)
    pts["X"] += ORIGIN_X
    pts["Y"] += ORIGIN_Y
    return trees, pts


class TestChm(unittest.TestCase):
    def test_rasterize_takes_max_height_per_cell(self):
        x = np.array([0.1, 0.2, 5.0])
        y = np.array([0.1, 0.2, 5.0])
        h = np.array([3.0, 9.0, 4.0])
        chm, ox, oy = rasterize_chm(x, y, h, res_m=1.0)
        self.assertAlmostEqual(chm[0, 0], 9.0)  # max, not mean or last

    def test_fill_pits_repairs_a_single_deep_cell(self):
        chm = np.full((7, 7), 20.0)
        chm[3, 3] = 2.0  # laser punched through the canopy
        filled = fill_pits(chm, drop_threshold_m=1.5)
        self.assertGreater(filled[3, 3], 15.0)

    def test_fill_pits_preserves_a_real_canopy_gap(self):
        # A wide opening is a real gap a player can throw through, and
        # must survive pit filling — this is load-bearing for the app.
        chm = np.full((15, 15), 20.0)
        chm[5:10, 5:10] = 0.0
        filled = fill_pits(chm, drop_threshold_m=1.5)
        self.assertAlmostEqual(filled[7, 7], 0.0, places=3)

    def test_smoothing_reduces_noise_but_keeps_structure(self):
        rng = np.random.default_rng(0)
        chm = np.full((20, 20), 15.0) + rng.normal(0, 0.5, (20, 20))
        smoothed = smooth_chm(chm, sigma_cells=0.7)
        self.assertLess(smoothed.std(), chm.std())
        self.assertAlmostEqual(smoothed.mean(), chm.mean(), delta=0.2)


class TestTreetopDetection(unittest.TestCase):
    def test_finds_two_separated_peaks(self):
        chm = np.zeros((40, 40))
        for (r, c), h in (((10, 10), 18.0), ((30, 30), 22.0)):
            for dr in range(-4, 5):
                for dc in range(-4, 5):
                    d = math.hypot(dr, dc)
                    if d <= 4:
                        chm[r + dr, c + dc] = max(chm[r + dr, c + dc], h * (1 - d / 6))
        tops = detect_treetops(chm, SegmentationParams())
        self.assertEqual(len(tops), 2)

    def test_ignores_understory_below_min_height(self):
        chm = np.zeros((30, 30))
        chm[15, 15] = 2.0  # below the 3 m minimum
        tops = detect_treetops(chm, SegmentationParams())
        self.assertEqual(len(tops), 0)

    def test_flat_apex_yields_one_tree_not_many(self):
        # A plateau at the top of a crown produces many equal-valued
        # "maxima"; they must collapse to a single treetop.
        chm = np.zeros((30, 30))
        chm[12:18, 12:18] = 20.0
        tops = detect_treetops(chm, SegmentationParams())
        self.assertEqual(len(tops), 1)


class TestCrownGrowing(unittest.TestCase):
    def test_crown_does_not_bleed_into_open_ground(self):
        # The reason region growing was chosen over watershed: an
        # isolated tree must stop at its own crown edge, not flood the
        # surrounding fairway.
        chm = np.zeros((40, 40))
        for dr in range(-5, 6):
            for dc in range(-5, 6):
                d = math.hypot(dr, dc)
                if d <= 5:
                    chm[20 + dr, 20 + dc] = 20.0 * (1 - d / 7)
        labels = grow_crowns(chm, [(20, 20)], SegmentationParams())
        assigned = labels > 0
        self.assertGreater(assigned.sum(), 20)
        # Nothing far from the tree should have been claimed.
        self.assertEqual(labels[0, 0], 0)
        self.assertEqual(labels[39, 39], 0)
        self.assertLess(assigned.sum(), 200)

    def test_two_adjacent_crowns_are_separated(self):
        chm = np.zeros((40, 60))
        for centre, h in (((20, 18), 20.0), ((20, 34), 20.0)):
            r0, c0 = centre
            for dr in range(-8, 9):
                for dc in range(-8, 9):
                    d = math.hypot(dr, dc)
                    if d <= 8:
                        chm[r0 + dr, c0 + dc] = max(chm[r0 + dr, c0 + dc], h * (1 - d / 11))
        labels = grow_crowns(chm, [(20, 18), (20, 34)], SegmentationParams())
        self.assertEqual(labels[20, 18], 1)
        self.assertEqual(labels[20, 34], 2)
        self.assertGreater((labels == 1).sum(), 10)
        self.assertGreater((labels == 2).sum(), 10)


class TestCrownBaseAndProfile(unittest.TestCase):
    def test_crown_base_found_from_spread_not_density(self):
        # Crown from 8-20 m, plus a sparse trunk below. Density alone
        # would stop high (occlusion thins the lower crown); spread
        # should find the real base near 8 m.
        rng = np.random.default_rng(3)
        n = 400
        h_crown = rng.uniform(8.0, 20.0, n)
        r_crown = rng.uniform(0.5, 4.0, n)
        h_trunk = rng.uniform(0.5, 8.0, 20)
        r_trunk = rng.uniform(0.0, 0.3, 20)
        heights = np.concatenate([h_crown, h_trunk])
        dists = np.concatenate([r_crown, r_trunk])
        base = estimate_crown_base(dists, heights, 20.0, SegmentationParams())
        self.assertLess(abs(base - 8.0), 3.0, f"crown base {base:.1f} m, expected ~8 m")

    def test_profile_is_normalised_and_correct_length(self):
        rng = np.random.default_rng(4)
        heights = rng.uniform(5.0, 20.0, 600)
        dists = rng.uniform(0.0, 4.0, 600)
        profile, max_r = extract_profile(dists, heights, 5.0, 20.0, SegmentationParams())
        self.assertEqual(len(profile), 6)
        self.assertTrue(all(0.0 <= v <= 1.0 for v in profile))
        self.assertAlmostEqual(max(profile), 1.0, places=6)
        self.assertGreater(max_r, 0)

    def test_conifer_profile_tapers_upward(self):
        tree = SyntheticTree(0, 0, 20.0, 4.0, 4.0, "conifer")
        pts = generate_forest([tree], (-15, 15), (-15, 15), seed=2, pulse_density=40)
        veg = pts[pts["Classification"] == CLASS_HIGH_VEG]
        h = veg["HeightAboveGround"]
        d = np.hypot(veg["X"], veg["Y"])
        keep = h >= 4.0
        profile, _ = extract_profile(d[keep], h[keep], 4.0, 20.0, SegmentationParams())
        self.assertGreater(profile[0], profile[5], f"conifer should narrow upward: {profile}")

    def test_deciduous_profile_is_widest_in_the_middle(self):
        tree = SyntheticTree(0, 0, 20.0, 4.0, 8.0, "deciduous")
        pts = generate_forest([tree], (-15, 15), (-15, 15), seed=2, pulse_density=40)
        veg = pts[pts["Classification"] == CLASS_HIGH_VEG]
        h = veg["HeightAboveGround"]
        d = np.hypot(veg["X"], veg["Y"])
        keep = h >= 8.0
        profile, _ = extract_profile(d[keep], h[keep], 8.0, 20.0, SegmentationParams())
        peak = int(np.argmax(profile))
        self.assertIn(peak, (1, 2, 3), f"deciduous crown should peak mid-crown: {profile}")


class TestEndToEndRecovery(unittest.TestCase):
    """The tests that actually matter: measured accuracy vs ground truth."""

    def _report(self, seed, n_trees=50, side=140):
        trees, pts = build_stand(n_trees, side, seed)
        detected = segment_trees(pts, WORKING_CRS)
        return validate(trees, detected, to_working_crs=to_local), trees, detected

    def test_detection_and_commission_rates(self):
        for seed in (101, 202, 303):
            with self.subTest(seed=seed):
                rep, _, _ = self._report(seed)
                self.assertGreaterEqual(rep.detection_rate, 0.85,
                                         f"detection {rep.detection_rate:.0%}\n{rep.summary()}")
                self.assertLessEqual(rep.commission_rate, 0.10,
                                      f"commission {rep.commission_rate:.0%}\n{rep.summary()}")

    def test_position_accuracy_meets_acceptance_criterion(self):
        # docs/ACCURACY_ROADMAP.md §2 acceptance: position within 2 m.
        for seed in (101, 202, 303):
            with self.subTest(seed=seed):
                rep, _, _ = self._report(seed)
                rmse = rep.rmse(rep.position_errors_m)
                self.assertLess(rmse, 1.5, f"position RMSE {rmse:.2f} m\n{rep.summary()}")

    def test_height_accuracy(self):
        rep, _, _ = self._report(101)
        self.assertLess(rep.rmse(rep.height_errors_m), 1.0, rep.summary())

    def test_crown_radius_within_acceptance_criterion(self):
        # Acceptance: crown extent within 25%.
        trees, pts = build_stand(50, 140, 202)
        detected = segment_trees(pts, WORKING_CRS)
        det_xy = [to_local(d.lng, d.lat) for d in detected]
        rel_errors, claimed = [], set()
        for t in sorted(trees, key=lambda t: -t.height_m):
            radius = max(3.0, t.crown_radius_m)
            best_i, best_d = None, float("inf")
            for i, (dx, dy) in enumerate(det_xy):
                if i in claimed:
                    continue
                d = math.hypot(dx - t.x, dy - t.y)
                if d < best_d and d <= radius:
                    best_i, best_d = i, d
            if best_i is None:
                continue
            claimed.add(best_i)
            rel_errors.append(abs(detected[best_i].crown_radius_m - t.crown_radius_m) / t.crown_radius_m)
        median_rel = float(np.median(rel_errors))
        self.assertLess(median_rel, 0.25, f"median relative crown-radius error {median_rel:.1%}")

    def test_form_classification_accuracy(self):
        rep, _, _ = self._report(101)
        self.assertGreaterEqual(rep.form_accuracy, 0.80, rep.summary())

    def test_all_records_validate_against_schema(self):
        _, _, detected = self._report(303)
        self.assertGreater(len(detected), 0)
        for rec in detected:
            rec.validate()  # raises on any implausible attribute

    def test_output_coordinates_are_wgs84_near_the_stand(self):
        _, _, detected = self._report(101)
        self.assertGreater(len(detected), 0)
        for rec in detected[:10]:
            self.assertTrue(-72.1 < rec.lng < -71.7, f"lng {rec.lng} not near the test site")
            self.assertTrue(42.1 < rec.lat < 42.4, f"lat {rec.lat} not near the test site")

    def test_deterministic(self):
        _, pts = build_stand(30, 120, 55)
        a = segment_trees(pts, WORKING_CRS)
        b = segment_trees(pts, WORKING_CRS)
        self.assertEqual(len(a), len(b))
        for ra, rb in zip(a, b):
            self.assertAlmostEqual(ra.lng, rb.lng, places=9)
            self.assertAlmostEqual(ra.height_m, rb.height_m, places=6)


class TestEdgeCases(unittest.TestCase):
    def test_empty_point_cloud(self):
        pts = np.empty(0, dtype=POINT_DTYPE)
        self.assertEqual(segment_trees(pts, WORKING_CRS), [])

    def test_ground_only_point_cloud(self):
        pts = np.empty(50, dtype=POINT_DTYPE)
        pts["X"] = np.linspace(ORIGIN_X, ORIGIN_X + 50, 50)
        pts["Y"] = ORIGIN_Y
        pts["Z"] = 100.0
        pts["Classification"] = 2
        pts["HeightAboveGround"] = 0.0
        self.assertEqual(segment_trees(pts, WORKING_CRS), [])

    def test_single_isolated_tree(self):
        tree = SyntheticTree(60.0, 60.0, 18.0, 3.5, 6.0, "deciduous")
        pts = generate_forest([tree], (0, 120), (0, 120), seed=8)
        pts["X"] += ORIGIN_X
        pts["Y"] += ORIGIN_Y
        detected = segment_trees(pts, WORKING_CRS)
        self.assertEqual(len(detected), 1)
        dx, dy = to_local(detected[0].lng, detected[0].lat)
        self.assertLess(math.hypot(dx - 60.0, dy - 60.0), 2.0)
        self.assertAlmostEqual(detected[0].height_m, 18.0, delta=1.5)

    def test_understory_only_is_not_reported_as_trees(self):
        shrubs = [SyntheticTree(20 + 10 * i, 20.0, 2.0, 1.0, 0.5, "deciduous") for i in range(4)]
        pts = generate_forest(shrubs, (0, 80), (0, 80), seed=9)
        pts["X"] += ORIGIN_X
        pts["Y"] += ORIGIN_Y
        self.assertEqual(segment_trees(pts, WORKING_CRS), [])


if __name__ == "__main__":
    unittest.main()
