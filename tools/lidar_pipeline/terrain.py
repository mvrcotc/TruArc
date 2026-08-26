"""
TruArc LiDAR Pipeline — DTM Export (Section 2, step 6)

Ground-classified points -> a downsampled elevation grid JSON the flight
sim can query directly (more accurate than Mapbox's DEM, which the app
also currently renders at 2x exaggeration for visual drama — see
MapCanvas.jsx's `setTerrain({exaggeration: 2.0})` — a factor that must
NOT leak into anything that reads real elevation for measurement or
physics; this pipeline's output is always true-scale).

Missing cells (no ground return — common under dense canopy where SMRF
has little to work with) are written as `null` rather than interpolated.
That's a deliberate accuracy choice: the consumer (Section 3/4) should
fall back to Mapbox's DEM for those cells rather than the pipeline
fabricating a plausible-looking but unmeasured ground elevation. A
course's LiDAR ground coverage should be near-total outside deep woods,
so nulls should be rare and clustered exactly where honesty matters most
(under the thickest canopy — also where the voxel grid, not the DTM, is
what a collision check actually needs).

GeoTIFF export (`write_dtm_geotiff`) needs PDAL's writers.gdal and is
therefore untestable in this sandbox, same as preprocess.py's PDAL-bound
functions — kept minimal and isolated from the tested grid-building
logic in `build_dtm_grid`.
"""
from __future__ import annotations

import json
import math
from dataclasses import dataclass
from pathlib import Path

import numpy as np


@dataclass(frozen=True)
class DtmHeader:
    origin_x: float
    origin_y: float
    cell_m: float
    nx: int
    ny: int
    working_crs: str

    def to_dict(self) -> dict:
        return {
            "origin": [self.origin_x, self.origin_y],
            "cellM": self.cell_m,
            "dims": [self.nx, self.ny],
            "workingCrs": self.working_crs,
        }

    @staticmethod
    def from_dict(d: dict) -> "DtmHeader":
        ox, oy = d["origin"]
        nx, ny = d["dims"]
        return DtmHeader(ox, oy, d["cellM"], nx, ny, d["workingCrs"])


def build_dtm_grid(ground_x: np.ndarray, ground_y: np.ndarray, ground_z: np.ndarray,
                    working_crs: str, cell_m: float = 2.0, max_dim: int = 2000) -> tuple[DtmHeader, np.ndarray]:
    """
    Average ground-point elevation per (cell_m x cell_m) cell.

    @returns (header, elevations) where `elevations` is a float64 ndarray
        of shape (nx, ny) with NaN for cells that had no ground point.
        NaN (not None) so this stays a plain numeric array through numpy
        operations; `write_dtm_json` converts NaN -> JSON null at
        serialization time.
    """
    if len(ground_x) == 0:
        raise ValueError("build_dtm_grid: no ground points supplied")

    min_x, max_x = float(ground_x.min()), float(ground_x.max())
    min_y, max_y = float(ground_y.min()), float(ground_y.max())

    nx = min(max_dim, int(np.ceil((max_x - min_x) / cell_m)) + 1)
    ny = min(max_dim, int(np.ceil((max_y - min_y) / cell_m)) + 1)
    if nx <= 0 or ny <= 0:
        raise ValueError(f"build_dtm_grid: degenerate grid dims ({nx},{ny}) — check units/cell_m")

    header = DtmHeader(min_x, min_y, cell_m, nx, ny, working_crs)

    ix = np.clip(((ground_x - min_x) / cell_m).astype(np.int64), 0, nx - 1)
    iy = np.clip(((ground_y - min_y) / cell_m).astype(np.int64), 0, ny - 1)

    sums = np.zeros((nx, ny), dtype=np.float64)
    counts = np.zeros((nx, ny), dtype=np.int64)
    np.add.at(sums, (ix, iy), ground_z)
    np.add.at(counts, (ix, iy), 1)

    with np.errstate(invalid="ignore", divide="ignore"):
        elevations = np.where(counts > 0, sums / np.maximum(counts, 1), np.nan)

    return header, elevations


def elevation_at(header: DtmHeader, elevations: np.ndarray, x: float, y: float) -> float | None:
    """Bilinear-interpolated elevation at world (x, y), or None if any of
    the 4 surrounding cells is missing (NaN) or out of grid bounds —
    matches build_dtm_grid's "don't fabricate ground" policy."""
    fx = (x - header.origin_x) / header.cell_m
    fy = (y - header.origin_y) / header.cell_m
    ix0, iy0 = int(math.floor(fx)), int(math.floor(fy))
    ix1, iy1 = ix0 + 1, iy0 + 1
    if not (0 <= ix0 < header.nx and 0 <= iy0 < header.ny and 0 <= ix1 < header.nx and 0 <= iy1 < header.ny):
        return None

    tx, ty = fx - ix0, fy - iy0
    corners = [elevations[ix0, iy0], elevations[ix1, iy0], elevations[ix0, iy1], elevations[ix1, iy1]]
    if any(math.isnan(c) for c in corners):
        return None

    top = corners[0] * (1 - tx) + corners[1] * tx
    bot = corners[2] * (1 - tx) + corners[3] * tx
    return float(top * (1 - ty) + bot * ty)


def write_dtm_json(header: DtmHeader, elevations: np.ndarray, out_path: Path | str) -> None:
    grid = [[(None if math.isnan(v) else round(float(v), 2)) for v in row] for row in elevations]
    payload = {**header.to_dict(), "schemaVersion": 1, "elevations": grid}
    Path(out_path).write_text(json.dumps(payload, separators=(",", ":")))


def read_dtm_json(path: Path | str) -> tuple[DtmHeader, np.ndarray]:
    data = json.loads(Path(path).read_text())
    header = DtmHeader.from_dict(data)
    grid = np.array(
        [[np.nan if v is None else v for v in row] for row in data["elevations"]],
        dtype=np.float64,
    )
    return header, grid


def write_dtm_geotiff(points, working_crs: str, out_path: Path | str, cell_m: float = 2.0):
    """
    PDAL/GDAL-dependent (not testable in this sandbox). `points` is the
    ground-classified subset of preprocess.run_preprocess()'s output
    array. Kept minimal and isolated — see module docstring.
    """
    import pdal
    import json as _json

    pipeline_json = {
        "pipeline": [
            {
                "type": "writers.gdal",
                "filename": str(out_path),
                "resolution": cell_m,
                "output_type": "mean",
                "gdaldriver": "GTiff",
                "nodata": -9999,
            }
        ]
    }
    pipeline = pdal.Pipeline(_json.dumps(pipeline_json), arrays=[points])
    pipeline.execute()
