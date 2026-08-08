import tempfile
import unittest
from pathlib import Path

import numpy as np

from tools.lidar_pipeline.terrain import build_dtm_grid, elevation_at, write_dtm_json, read_dtm_json


class TestBuildDtmGrid(unittest.TestCase):
    def test_raises_on_empty_input(self):
        with self.assertRaises(ValueError):
            build_dtm_grid(np.array([]), np.array([]), np.array([]), "EPSG:32619")

    def test_recovers_a_known_slope(self):
        rng = np.random.default_rng(1)
        n = 4000
        x = rng.uniform(0, 100, n)
        y = rng.uniform(0, 60, n)
        z = 50 + x * 0.1 + rng.normal(0, 0.02, n)

        header, grid = build_dtm_grid(x, y, z, "EPSG:32619", cell_m=2.0)
        e_low = elevation_at(header, grid, 10, 30)
        e_high = elevation_at(header, grid, 90, 30)

        self.assertIsNotNone(e_low)
        self.assertIsNotNone(e_high)
        self.assertGreater(e_high, e_low)
        self.assertAlmostEqual(e_high - e_low, (90 - 10) * 0.1, delta=1.0)

    def test_gap_returns_none_not_fabricated(self):
        rng = np.random.default_rng(2)
        n = 3000
        x = rng.uniform(0, 100, n)
        y = rng.uniform(0, 60, n)
        z = 50 + x * 0.1
        mask = ~((x > 40) & (x < 50))  # carve a gap: no ground returns here
        x, y, z = x[mask], y[mask], z[mask]

        header, grid = build_dtm_grid(x, y, z, "EPSG:32619", cell_m=2.0)
        self.assertIsNone(elevation_at(header, grid, 45, 30))

    def test_out_of_bounds_returns_none(self):
        x = np.array([0.0, 10.0, 5.0])
        y = np.array([0.0, 10.0, 5.0])
        z = np.array([1.0, 2.0, 1.5])
        header, grid = build_dtm_grid(x, y, z, "EPSG:32619", cell_m=1.0)
        self.assertIsNone(elevation_at(header, grid, -1000, -1000))

    def test_max_dim_safety_cap(self):
        x = np.array([0.0, 1e7])
        y = np.array([0.0, 1e7])
        z = np.array([0.0, 10.0])
        header, grid = build_dtm_grid(x, y, z, "EPSG:32619", cell_m=1.0, max_dim=500)
        self.assertLessEqual(header.nx, 500)
        self.assertLessEqual(header.ny, 500)


class TestDtmSerialization(unittest.TestCase):
    def test_round_trip_preserves_values_and_gaps(self):
        rng = np.random.default_rng(3)
        n = 2000
        x = rng.uniform(0, 50, n)
        y = rng.uniform(0, 50, n)
        z = 10 + rng.normal(0, 0.1, n)
        mask = ~((x > 20) & (x < 25))
        x, y, z = x[mask], y[mask], z[mask]

        header, grid = build_dtm_grid(x, y, z, "EPSG:32619", cell_m=2.0)

        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "dtm.json"
            write_dtm_json(header, grid, path)
            h2, g2 = read_dtm_json(path)

        self.assertEqual(h2.nx, header.nx)
        self.assertEqual(h2.ny, header.ny)
        self.assertEqual(np.isnan(g2).sum(), np.isnan(grid).sum())
        # non-NaN values should match to the rounding precision write_dtm_json uses (2 decimals)
        valid = ~np.isnan(grid)
        np.testing.assert_allclose(grid[valid], g2[valid], atol=0.01)

    def test_null_in_json_for_missing_cells(self):
        import json
        x = np.array([0.0, 1.0, 100.0])
        y = np.array([0.0, 1.0, 100.0])
        z = np.array([5.0, 5.0, 5.0])
        header, grid = build_dtm_grid(x, y, z, "EPSG:32619", cell_m=1.0)

        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "dtm.json"
            write_dtm_json(header, grid, path)
            data = json.loads(path.read_text())

        flat = [v for row in data["elevations"] for v in row]
        self.assertIn(None, flat, "sparse grid should have at least one null cell")


if __name__ == "__main__":
    unittest.main()
