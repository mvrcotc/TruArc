import tempfile
import unittest
from pathlib import Path

import numpy as np

from tools.lidar_pipeline.voxelgrid import (
    build_voxel_grid, pack_voxel_grid, unpack_voxel_grid,
    write_voxel_grid, read_voxel_grid, VoxelGridHeader,
)


class TestBuildVoxelGrid(unittest.TestCase):
    def test_raises_on_empty_input(self):
        with self.assertRaises(ValueError):
            build_voxel_grid(np.array([]), np.array([]), np.array([]), "EPSG:32619")

    def test_detects_a_real_canopy_gap(self):
        rng = np.random.default_rng(42)
        cluster1 = rng.normal(loc=[10, 10, 15], scale=[1.5, 1.5, 3], size=(500, 3))
        cluster2 = rng.normal(loc=[40, 10, 15], scale=[1.5, 1.5, 3], size=(500, 3))
        pts = np.vstack([cluster1, cluster2])

        header, occ = build_voxel_grid(pts[:, 0], pts[:, 1], pts[:, 2], "EPSG:32619", cell_m=1.0)

        gap_idx = header.index_of(25, 10, 15)
        cluster_idx = header.index_of(10, 10, 15)
        self.assertIsNotNone(gap_idx)
        self.assertIsNotNone(cluster_idx)
        self.assertFalse(occ[gap_idx], "gap between clusters should be unoccupied")
        self.assertTrue(occ[cluster_idx], "cluster center should be occupied")

    def test_index_of_out_of_bounds_returns_none(self):
        pts_x = np.array([0.0, 10.0])
        pts_y = np.array([0.0, 10.0])
        pts_z = np.array([0.0, 10.0])
        header, _ = build_voxel_grid(pts_x, pts_y, pts_z, "EPSG:32619", cell_m=1.0)
        self.assertIsNone(header.index_of(-100, 0, 0))
        self.assertIsNone(header.index_of(1000, 1000, 1000))

    def test_max_dim_safety_cap_prevents_huge_allocation(self):
        # Degenerate input spanning a huge range (e.g. degrees mistaken for meters)
        header, occ = build_voxel_grid(
            np.array([0.0, 1e6]), np.array([0.0, 1e6]), np.array([0.0, 1e6]),
            "EPSG:4326", cell_m=1.0, max_dim=100,
        )
        self.assertLessEqual(header.nx, 100)
        self.assertLessEqual(header.ny, 100)
        self.assertLessEqual(header.nz, 100)
        self.assertLessEqual(occ.nbytes, 100 ** 3)  # sanity: didn't try to allocate billions of cells


class TestPackUnpack(unittest.TestCase):
    def test_roundtrip_random_grid(self):
        rng = np.random.default_rng(1)
        occ = rng.random((7, 9, 5)) > 0.7
        packed = pack_voxel_grid(occ)
        restored = unpack_voxel_grid(packed, 7, 9, 5)
        np.testing.assert_array_equal(occ, restored)

    def test_roundtrip_all_false(self):
        occ = np.zeros((4, 4, 4), dtype=bool)
        restored = unpack_voxel_grid(pack_voxel_grid(occ), 4, 4, 4)
        np.testing.assert_array_equal(occ, restored)

    def test_roundtrip_all_true(self):
        occ = np.ones((3, 3, 3), dtype=bool)
        restored = unpack_voxel_grid(pack_voxel_grid(occ), 3, 3, 3)
        np.testing.assert_array_equal(occ, restored)

    def test_packing_is_near_theoretical_minimum(self):
        occ = np.zeros((100, 100, 10), dtype=bool)  # 100,000 cells
        packed = pack_voxel_grid(occ)
        ideal_bytes = 100_000 / 8
        # small fixed header overhead (magic + version + count), no per-cell overhead
        self.assertLess(len(packed) - ideal_bytes, 16)

    def test_bad_magic_rejected(self):
        with self.assertRaises(ValueError):
            unpack_voxel_grid(b"XXXX" + b"\x00" * 20, 2, 2, 2)

    def test_mismatched_dims_rejected(self):
        occ = np.zeros((5, 5, 5), dtype=bool)
        packed = pack_voxel_grid(occ)
        with self.assertRaises(ValueError):
            unpack_voxel_grid(packed, 3, 3, 3)  # wrong dims for this payload


class TestFileRoundTrip(unittest.TestCase):
    def test_write_read_round_trip(self):
        header = VoxelGridHeader(0, 0, 0, 1.0, 5, 5, 5, "EPSG:32619")
        rng = np.random.default_rng(7)
        occ = rng.random((5, 5, 5)) > 0.5

        with tempfile.TemporaryDirectory() as d:
            bin_path = Path(d) / "voxels.bin"
            hdr_path = Path(d) / "voxels_header.json"
            write_voxel_grid(header, occ, bin_path, hdr_path)
            h2, occ2 = read_voxel_grid(bin_path, hdr_path)

        self.assertEqual(h2.nx, header.nx)
        self.assertEqual(h2.working_crs, "EPSG:32619")
        np.testing.assert_array_equal(occ, occ2)


if __name__ == "__main__":
    unittest.main()
