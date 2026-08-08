"""
Tests for pipeline.py's non-PDAL, non-network pieces.

`load_course_holes` IS exercised for real here (not mocked) — it shells
out to Node against the actual src/data/courses.js, and Node is a real
project dependency already present in this environment, so this is a
genuine integration test, not a fixture-based one.
"""
import unittest

from tools.lidar_pipeline.pipeline import load_course_holes


class TestLoadCourseHoles(unittest.TestCase):
    def test_loads_real_course_data(self):
        holes = load_course_holes("maple-hill-gold")
        self.assertEqual(len(holes), 18)
        self.assertIn("tee", holes[0])
        self.assertIn("basket", holes[0])
        self.assertIn("lng", holes[0]["tee"])
        self.assertIn("lat", holes[0]["tee"])

    def test_basket_positions_are_computed(self):
        # courses.js computes `basket` from tee + distance + bearing via
        # a .map() in the module — confirm that computation actually ran
        # (basket present and distinct from tee), not just that the key exists.
        holes = load_course_holes("maple-hill-gold")
        tee = holes[0]["tee"]
        basket = holes[0]["basket"]
        self.assertNotAlmostEqual(tee["lng"], basket["lng"], places=5)

    def test_raises_clear_error_for_unknown_course(self):
        with self.assertRaises(ValueError) as ctx:
            load_course_holes("definitely-not-a-real-course-id")
        self.assertIn("not found", str(ctx.exception))

    def test_second_course_also_loads(self):
        # Sanity check this isn't hardcoded to Maple Hill specifically.
        holes = load_course_holes("winthrop-gold")
        self.assertGreater(len(holes), 0)


if __name__ == "__main__":
    unittest.main()
