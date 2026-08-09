import json
import tempfile
import unittest
from pathlib import Path

from tools.lidar_pipeline.schema import TreeRecord, classify_form, write_trees_json, read_trees_json


def make_tree(**overrides) -> TreeRecord:
    defaults = dict(
        lng=-71.896, lat=42.2765, ground_elev_m=45.2, height_m=21.4,
        crown_radius_m=4.1, crown_base_m=6.2,
        profile=(0.2, 0.5, 1.0, 0.9, 0.6, 0.2), form="deciduous", point_count=1840,
    )
    defaults.update(overrides)
    return TreeRecord(**defaults)


class TestTreeRecordValidation(unittest.TestCase):
    def test_valid_record_passes(self):
        make_tree().validate()  # should not raise

    def test_wrong_profile_length_rejected(self):
        with self.assertRaises(ValueError):
            make_tree(profile=(0.1, 0.2, 0.3)).validate()

    def test_profile_value_out_of_range_rejected(self):
        with self.assertRaises(ValueError):
            make_tree(profile=(0.1, 0.2, 0.3, 0.4, 0.5, 3.0)).validate()

    def test_invalid_form_rejected(self):
        with self.assertRaises(ValueError):
            make_tree(form="palm").validate()

    def test_nonpositive_height_rejected(self):
        with self.assertRaises(ValueError):
            make_tree(height_m=0).validate()
        with self.assertRaises(ValueError):
            make_tree(height_m=-5).validate()

    def test_nonpositive_crown_radius_rejected(self):
        with self.assertRaises(ValueError):
            make_tree(crown_radius_m=0).validate()

    def test_crown_base_must_be_below_height(self):
        with self.assertRaises(ValueError):
            make_tree(height_m=10, crown_base_m=10).validate()
        with self.assertRaises(ValueError):
            make_tree(height_m=10, crown_base_m=15).validate()
        with self.assertRaises(ValueError):
            make_tree(crown_base_m=-1).validate()


class TestFormClassification(unittest.TestCase):
    def test_conifer_shape(self):
        # wide base, tapering steadily to a narrow tip
        self.assertEqual(classify_form((1.0, 0.9, 0.7, 0.5, 0.3, 0.05)), "conifer")

    def test_deciduous_shape(self):
        # widest in the middle, narrower base and top (ellipsoid)
        self.assertEqual(classify_form((0.3, 0.7, 1.0, 0.95, 0.6, 0.3)), "deciduous")

    def test_wrong_length_rejected(self):
        with self.assertRaises(ValueError):
            classify_form((0.1, 0.2, 0.3))

    def test_wide_top_is_not_conifer(self):
        # widest at the very top -> not a tapering shape, should not read as conifer
        result = classify_form((0.2, 0.3, 0.4, 0.6, 0.8, 1.0))
        self.assertEqual(result, "deciduous")


class TestSerialization(unittest.TestCase):
    def test_round_trip(self):
        trees = [make_tree(), make_tree(lng=-71.897, height_m=15.0, form="conifer",
                                          profile=(1.0, 0.8, 0.6, 0.4, 0.2, 0.05))]
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "test_trees.json"
            write_trees_json(trees, path, course_id="maple-hill-gold", source_note="unit test")
            loaded = read_trees_json(path)

        self.assertEqual(len(loaded), 2)
        self.assertAlmostEqual(loaded[0].lng, trees[0].lng)
        self.assertEqual(loaded[1].form, "conifer")
        self.assertEqual(loaded[1].profile, (1.0, 0.8, 0.6, 0.4, 0.2, 0.05))

    def test_write_validates_before_writing(self):
        bad = make_tree(height_m=-1)
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "bad.json"
            with self.assertRaises(ValueError):
                write_trees_json([bad], path, course_id="x")
            self.assertFalse(path.exists())

    def test_output_schema_has_expected_top_level_keys(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "trees.json"
            write_trees_json([make_tree()], path, course_id="maple-hill-gold", source_note="test")
            data = json.loads(path.read_text())
        self.assertEqual(data["course_id"], "maple-hill-gold")
        self.assertEqual(data["count"], 1)
        self.assertEqual(data["schema_version"], 1)
        self.assertEqual(len(data["trees"]), 1)


if __name__ == "__main__":
    unittest.main()
