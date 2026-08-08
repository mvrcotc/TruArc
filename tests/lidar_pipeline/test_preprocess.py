import unittest

from tools.lidar_pipeline.geometry import BBox
from tools.lidar_pipeline.preprocess import (
    build_preprocess_pipeline, class_counts_indicate_preclassified,
    CLASS_GROUND, CLASS_LOW_VEG, CLASS_MED_VEG, SmrfParams,
)

BBOX = BBox(-71.90, 42.274, -71.886, 42.280)


class TestPreclassifiedDetection(unittest.TestCase):
    def test_true_when_both_ground_and_vegetation_present(self):
        self.assertTrue(class_counts_indicate_preclassified({CLASS_GROUND: 4000, CLASS_LOW_VEG: 4000, 0: 2000}))

    def test_false_when_unclassified_only(self):
        self.assertFalse(class_counts_indicate_preclassified({0: 10000}))

    def test_false_when_only_ground_no_vegetation(self):
        # A tile that's all open field, or a badly classified source —
        # either way SMRF should still be considered.
        self.assertFalse(class_counts_indicate_preclassified({CLASS_GROUND: 10000}))

    def test_false_on_empty(self):
        self.assertFalse(class_counts_indicate_preclassified({}))

    def test_respects_min_fraction_threshold(self):
        # 0.5% ground is below the 1% default threshold
        counts = {CLASS_GROUND: 50, CLASS_MED_VEG: 50, 0: 9900}
        self.assertFalse(class_counts_indicate_preclassified(counts, min_ground_fraction=0.01))
        self.assertTrue(class_counts_indicate_preclassified(counts, min_ground_fraction=0.001))


class TestPipelineBuilder(unittest.TestCase):
    def test_stage_order_without_smrf(self):
        r = build_preprocess_pipeline("fake.laz", source_crs="EPSG:2249", bbox=BBOX, run_smrf=False)
        self.assertNotIn("filters.smrf", r.stages)
        self.assertEqual(r.stages[0], "readers.las")
        self.assertEqual(r.stages[-1], "filters.crop(exact)")
        self.assertLess(r.stages.index("filters.hag_nn"), r.stages.index("filters.crop(exact)"))

    def test_stage_order_with_smrf(self):
        r = build_preprocess_pipeline("fake.laz", source_crs="", bbox=BBOX, run_smrf=True)
        self.assertIn("filters.smrf", r.stages)
        # SMRF must run before HAG (HAG needs ground points classified first)
        self.assertLess(r.stages.index("filters.smrf"), r.stages.index("filters.hag_nn"))
        # bbox crop should happen before the expensive SMRF stage
        self.assertLess(r.stages.index("filters.crop(bbox)"), r.stages.index("filters.smrf"))
        # reprojection must happen before any metric filter (crop, smrf, hag)
        self.assertLess(r.stages.index("filters.reprojection"), r.stages.index("filters.crop(bbox)"))

    def test_no_reprojection_stage_when_source_already_working_crs(self):
        r = build_preprocess_pipeline("fake.laz", source_crs="EPSG:32619", bbox=BBOX, run_smrf=False)
        self.assertEqual(r.working_crs, "EPSG:32619")
        self.assertNotIn("filters.reprojection", r.stages)

    def test_reprojection_stage_present_when_source_differs_from_working(self):
        r = build_preprocess_pipeline("fake.laz", source_crs="EPSG:2249", bbox=BBOX, run_smrf=False)
        # EPSG:2249 is already projected, so it IS the working CRS -> no reprojection needed
        self.assertEqual(r.working_crs, "EPSG:2249")
        self.assertNotIn("filters.reprojection", r.stages)

        r2 = build_preprocess_pipeline("fake.laz", source_crs="EPSG:4326", bbox=BBOX, run_smrf=False)
        self.assertNotEqual(r2.working_crs, "EPSG:4326")
        self.assertIn("filters.reprojection", r2.stages)

    def test_reader_gets_filename_and_override_srs(self):
        r = build_preprocess_pipeline("fake.laz", source_crs="EPSG:2249", bbox=BBOX, run_smrf=False)
        reader = r.pipeline_json["pipeline"][0]
        self.assertEqual(reader["type"], "readers.las")
        self.assertEqual(reader["filename"], "fake.laz")
        self.assertEqual(reader["override_srs"], "EPSG:2249")

    def test_crop_polygon_is_wkt_in_working_crs(self):
        r = build_preprocess_pipeline("fake.laz", source_crs="EPSG:32619", bbox=BBOX, run_smrf=False)
        crop_stage = next(s for s in r.pipeline_json["pipeline"] if s["type"] == "filters.crop")
        self.assertTrue(crop_stage["polygon"].startswith("POLYGON (("))
        self.assertNotIn("-71.", crop_stage["polygon"])  # should be UTM meters, not degrees

    def test_smrf_params_flow_into_pipeline_json(self):
        custom = SmrfParams(cell=2.0, slope=0.3, window=20.0, threshold=0.6, scalar=1.5)
        r = build_preprocess_pipeline("fake.laz", source_crs="", bbox=BBOX, run_smrf=True, smrf=custom)
        smrf_stage = next(s for s in r.pipeline_json["pipeline"] if s["type"] == "filters.smrf")
        self.assertEqual(smrf_stage["cell"], 2.0)
        self.assertEqual(smrf_stage["window"], 20.0)

    def test_denoise_excludes_noise_classification_codes(self):
        r = build_preprocess_pipeline("fake.laz", source_crs="EPSG:32619", bbox=BBOX, run_smrf=False)
        range_stage = next(s for s in r.pipeline_json["pipeline"] if s["type"] == "filters.range")
        self.assertIn("Classification![7:7]", range_stage["limits"])
        self.assertIn("Classification![18:18]", range_stage["limits"])


if __name__ == "__main__":
    unittest.main()
