import math
import tempfile
import unittest
from pathlib import Path

from tools.lidar_pipeline.geometry import (
    BBox, course_bbox_from_holes, load_course_bounds, resolve_course_bbox,
    utm_epsg_for, is_projected_crs, resolve_working_crs, bbox_to_wkt_polygon,
    reproject_ring, METERS_PER_DEG_LAT, meters_per_deg_lng,
)


class TestBBox(unittest.TestCase):
    def test_overlaps(self):
        a = BBox(-72, 42, -71, 43)
        b = BBox(-71.5, 42.5, -70.5, 43.5)
        c = BBox(0, 0, 1, 1)
        self.assertTrue(a.overlaps(b))
        self.assertTrue(b.overlaps(a))
        self.assertFalse(a.overlaps(c))

    def test_area_km2_is_reasonable(self):
        # ~1km x 1km box near 42N
        d_lat = 1000 / METERS_PER_DEG_LAT
        d_lng = 1000 / meters_per_deg_lng(42.0)
        bbox = BBox(-71.9 - d_lng / 2, 42.0 - d_lat / 2, -71.9 + d_lng / 2, 42.0 + d_lat / 2)
        self.assertAlmostEqual(bbox.area_km2(), 1.0, delta=0.05)

    def test_tnm_bbox_format(self):
        bbox = BBox(-71.9, 42.27, -71.88, 42.28)
        self.assertEqual(bbox.as_tnm_bbox(), "-71.900000,42.270000,-71.880000,42.280000")

    def test_to_geojson_polygon_is_closed_ring(self):
        bbox = BBox(0, 0, 1, 1)
        ring = bbox.to_geojson_polygon()["coordinates"][0]
        self.assertEqual(ring[0], ring[-1])
        self.assertEqual(len(ring), 5)


class TestCourseBboxFromHoles(unittest.TestCase):
    def test_covers_all_tees_and_baskets_plus_buffer(self):
        holes = [
            {"tee": {"lng": -71.90, "lat": 42.27}, "basket": {"lng": -71.899, "lat": 42.271}},
            {"tee": {"lng": -71.89, "lat": 42.275}, "basket": {"lng": -71.888, "lat": 42.276}},
        ]
        bbox = course_bbox_from_holes(holes, buffer_m=50)
        # every point must be strictly inside the buffered box
        for h in holes:
            for key in ("tee", "basket"):
                p = h[key]
                self.assertLess(bbox.min_lng, p["lng"])
                self.assertLess(p["lng"], bbox.max_lng)
                self.assertLess(bbox.min_lat, p["lat"])
                self.assertLess(p["lat"], bbox.max_lat)

    def test_larger_buffer_gives_larger_bbox(self):
        holes = [{"tee": {"lng": -71.90, "lat": 42.27}, "basket": {"lng": -71.899, "lat": 42.271}}]
        small = course_bbox_from_holes(holes, buffer_m=20)
        large = course_bbox_from_holes(holes, buffer_m=100)
        self.assertLess(large.min_lng, small.min_lng)
        self.assertGreater(large.max_lng, small.max_lng)

    def test_raises_on_no_points(self):
        with self.assertRaises(ValueError):
            course_bbox_from_holes([])


class TestBoundsFileOverride(unittest.TestCase):
    def test_load_course_bounds_missing_file_returns_none(self):
        with tempfile.TemporaryDirectory() as d:
            self.assertIsNone(load_course_bounds("nope", d))

    def test_load_course_bounds_from_polygon_feature(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "test-course.geojson"
            path.write_text('''{
                "type": "Feature",
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[[-72.0,42.0],[-71.9,42.0],[-71.9,42.1],[-72.0,42.1],[-72.0,42.0]]]
                }
            }''')
            bbox = load_course_bounds("test-course", d)
            self.assertAlmostEqual(bbox.min_lng, -72.0)
            self.assertAlmostEqual(bbox.max_lat, 42.1)

    def test_resolve_course_bbox_prefers_file_over_derived(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "my-course.geojson"
            path.write_text('{"type":"Polygon","coordinates":[[[-72.0,42.0],[-71.9,42.0],[-71.9,42.1],[-72.0,42.1],[-72.0,42.0]]]}')
            holes = [{"tee": {"lng": -71.90, "lat": 42.27}, "basket": {"lng": -71.899, "lat": 42.271}}]
            bbox, source = resolve_course_bbox("my-course", holes, bounds_dir=d)
            self.assertEqual(source, "file")
            self.assertAlmostEqual(bbox.min_lng, -72.0)

            bbox2, source2 = resolve_course_bbox("other-course", holes, bounds_dir=d)
            self.assertEqual(source2, "derived")


class TestWorkingCrs(unittest.TestCase):
    def test_utm_zone_northern_hemisphere(self):
        self.assertEqual(utm_epsg_for(-71.9, 42.3), "EPSG:32619")  # New England

    def test_utm_zone_southern_hemisphere(self):
        self.assertEqual(utm_epsg_for(151.2, -33.9), "EPSG:32756")  # Sydney

    def test_utm_zone_boundaries(self):
        self.assertEqual(utm_epsg_for(-180, 10), "EPSG:32601")
        self.assertEqual(utm_epsg_for(179.9, 10), "EPSG:32660")

    def test_is_projected_crs(self):
        self.assertFalse(is_projected_crs("EPSG:4326"))   # WGS84 lat/lng — degrees
        self.assertTrue(is_projected_crs("EPSG:32619"))    # UTM 19N — meters
        self.assertTrue(is_projected_crs("EPSG:2249"))     # MA State Plane — feet

    def test_resolve_working_crs_keeps_projected_source(self):
        bbox = BBox(-71.9, 42.27, -71.88, 42.28)
        self.assertEqual(resolve_working_crs("EPSG:2249", bbox), "EPSG:2249")

    def test_resolve_working_crs_falls_back_to_utm(self):
        bbox = BBox(-71.9, 42.27, -71.88, 42.28)
        self.assertEqual(resolve_working_crs("EPSG:4326", bbox), "EPSG:32619")
        self.assertEqual(resolve_working_crs("", bbox), "EPSG:32619")


class TestReprojection(unittest.TestCase):
    def test_reproject_ring_roundtrip(self):
        ring = [[-71.9, 42.27], [-71.88, 42.27], [-71.88, 42.28], [-71.9, 42.28], [-71.9, 42.27]]
        projected = reproject_ring(ring, "EPSG:4326", "EPSG:32619")
        back = reproject_ring([[x, y] for x, y in projected], "EPSG:32619", "EPSG:4326")
        for (lng0, lat0), (lng1, lat1) in zip(ring, back):
            self.assertAlmostEqual(lng0, lng1, places=6)
            self.assertAlmostEqual(lat0, lat1, places=6)

    def test_reproject_ring_changes_units_to_meters(self):
        # A ~0.02deg-wide box should become roughly 1.6-1.9 km wide in UTM meters at this latitude
        ring = [[-71.9, 42.27], [-71.88, 42.27]]
        projected = reproject_ring(ring, "EPSG:4326", "EPSG:32619")
        width_m = abs(projected[1][0] - projected[0][0])
        self.assertTrue(1500 < width_m < 2000, f"unexpected width {width_m}m")

    def test_bbox_to_wkt_polygon_no_reprojection_when_same_crs(self):
        bbox = BBox(0, 0, 1, 1)
        wkt = bbox_to_wkt_polygon(bbox, "EPSG:4326", src_epsg="EPSG:4326")
        self.assertTrue(wkt.startswith("POLYGON (("))
        self.assertIn("0.000 0.000", wkt)

    def test_bbox_to_wkt_polygon_reprojects(self):
        bbox = BBox(-71.9, 42.27, -71.88, 42.28)
        wkt = bbox_to_wkt_polygon(bbox, "EPSG:32619")
        self.assertTrue(wkt.startswith("POLYGON (("))
        # coordinates should be in the hundreds-of-thousands range (UTM meters), not degrees
        self.assertNotIn("-71.", wkt)


if __name__ == "__main__":
    unittest.main()
