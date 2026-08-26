import tempfile
import unittest
from pathlib import Path

import numpy as np

from tools.lidar_pipeline.pointcloud_export import (
    decimate_prioritizing_vegetation, pack_point_cloud, unpack_point_cloud,
    write_point_cloud, read_point_cloud, CLASS_GROUND, CLASS_VEGETATION,
    DEFAULT_MAX_POINTS, MICRODEG,
)


class TestDecimation(unittest.TestCase):
    def test_returns_everything_when_under_budget(self):
        cls = np.array([2, 3, 2, 5, 2])
        idx = decimate_prioritizing_vegetation(cls, max_points=100)
        self.assertEqual(sorted(idx.tolist()), list(range(5)))

    def test_keeps_all_vegetation_when_it_fits(self):
        cls = np.array([2] * 900 + [5] * 100)
        idx = decimate_prioritizing_vegetation(cls, max_points=500)
        veg_idx = set(range(900, 1000))
        selected = set(idx.tolist())
        self.assertTrue(veg_idx.issubset(selected), "all vegetation points should survive decimation")
        self.assertEqual(len(idx), 500)

    def test_samples_vegetation_when_it_alone_exceeds_budget(self):
        cls = np.array([5] * 1000)
        idx = decimate_prioritizing_vegetation(cls, max_points=300)
        self.assertEqual(len(idx), 300)
        self.assertEqual(len(set(idx.tolist())), 300, "no duplicate indices")

    def test_deterministic_for_a_fixed_seed(self):
        cls = np.array([2, 3, 4, 5] * 500)
        a = decimate_prioritizing_vegetation(cls, max_points=100, seed=42)
        b = decimate_prioritizing_vegetation(cls, max_points=100, seed=42)
        np.testing.assert_array_equal(a, b)

    def test_respects_the_roadmap_default_cap(self):
        self.assertEqual(DEFAULT_MAX_POINTS, 300_000)


class TestPackUnpack(unittest.TestCase):
    def test_round_trip_preserves_values(self):
        lng = np.array([-71.896, -71.895, -71.894])
        lat = np.array([42.2765, 42.2770, 42.2775])
        alt = np.array([45.2, 46.1, 44.8], dtype=np.float32)
        cls = np.array([5, 2, 3], dtype=np.uint8)

        packed = pack_point_cloud(lng, lat, alt, cls)
        lng2, lat2, alt2, cls2 = unpack_point_cloud(packed)

        # Microdegree quantization ≈ 1.1 cm — well below GPS/LiDAR accuracy.
        np.testing.assert_allclose(lng2, lng, atol=1.5 / MICRODEG)
        np.testing.assert_allclose(lat2, lat, atol=1.5 / MICRODEG)
        np.testing.assert_allclose(alt2, alt, atol=1e-4)
        np.testing.assert_array_equal(cls2, cls)

    def test_mismatched_array_lengths_rejected(self):
        with self.assertRaises(ValueError):
            pack_point_cloud(np.array([1.0, 2.0]), np.array([1.0]), np.array([1.0, 2.0]), np.array([2, 2]))

    def test_bad_magic_rejected(self):
        with self.assertRaises(ValueError):
            unpack_point_cloud(b"XXXX" + b"\x00" * 20)

    def test_truncated_body_rejected(self):
        packed = pack_point_cloud(np.array([1.0]), np.array([1.0]), np.array([1.0]), np.array([2]))
        with self.assertRaises(ValueError):
            unpack_point_cloud(packed[:-3])

    def test_out_of_range_coordinate_rejected(self):
        # A coordinate this large only happens if working-CRS meters were
        # passed instead of lng/lat degrees — must fail loudly, not silently
        # overflow int32.
        with self.assertRaises(ValueError):
            pack_point_cloud(np.array([261000.0]), np.array([4684500.0]), np.array([100.0]), np.array([2]))

    def test_empty_point_cloud_round_trips(self):
        packed = pack_point_cloud(np.array([]), np.array([]), np.array([]), np.array([]))
        lng, lat, alt, cls = unpack_point_cloud(packed)
        self.assertEqual(len(lng), 0)


class TestFileRoundTrip(unittest.TestCase):
    def test_write_read_round_trip(self):
        lng = np.array([-71.896, -71.895])
        lat = np.array([42.2765, 42.2770])
        alt = np.array([45.2, 46.1], dtype=np.float32)
        cls = np.array([5, 2], dtype=np.uint8)

        with tempfile.TemporaryDirectory() as d:
            bin_path = Path(d) / "points.bin"
            hdr_path = Path(d) / "points_header.json"
            write_point_cloud(lng, lat, alt, cls, bin_path, hdr_path)
            lng2, lat2, alt2, cls2 = read_point_cloud(bin_path, hdr_path)

        np.testing.assert_allclose(lng2, lng, atol=1.5 / MICRODEG)
        np.testing.assert_array_equal(cls2, cls)

    def test_header_count_mismatch_detected(self):
        lng = np.array([-71.896])
        lat = np.array([42.2765])
        alt = np.array([45.2], dtype=np.float32)
        cls = np.array([5], dtype=np.uint8)
        with tempfile.TemporaryDirectory() as d:
            bin_path = Path(d) / "points.bin"
            hdr_path = Path(d) / "points_header.json"
            write_point_cloud(lng, lat, alt, cls, bin_path, hdr_path)
            hdr_path.write_text('{"count": 999, "schemaVersion": 1}')
            with self.assertRaises(ValueError):
                read_point_cloud(bin_path, hdr_path)


if __name__ == "__main__":
    unittest.main()
