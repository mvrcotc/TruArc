"""
TruArc LiDAR Pipeline — Voxel Occupancy Grid (Section 2, step 5)

Vegetation returns binned into a 1 m occupancy grid over the course.
This is the physics-collision ground truth (Section 4): it encodes real
canopy gaps that no per-tree primitive can represent, and Section 4's
trajectory-vs-voxel traversal reads it directly.

Format: bit-packed binary (1 bit/cell, 8 cells/byte) + a small JSON
header carrying the grid's origin (in the working CRS, meters) and
dimensions — origin/dims/cell size are needed to convert a world
position into a grid index, and vice versa. A course-sized grid
(500m x 500m x 40m at 1 m cells = 10M cells) packs to ~1.25 MB before
compression, comfortably under the roadmap's <5 MB per-course budget
even before gzip (course footprints are usually much smaller than that
bounding cube, and most of the vertical range above canopy and below
ground is empty).
"""
from __future__ import annotations

import json
import struct
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from .geometry import bearing_deg


@dataclass(frozen=True)
class VoxelGridHeader:
    origin_x: float  # working-CRS meters, minimum corner
    origin_y: float
    origin_z: float
    cell_m: float
    nx: int
    ny: int
    nz: int
    working_crs: str

    def to_dict(self) -> dict:
        return {
            "origin": [self.origin_x, self.origin_y, self.origin_z],
            "cellM": self.cell_m,
            "dims": [self.nx, self.ny, self.nz],
            "workingCrs": self.working_crs,
        }

    @staticmethod
    def from_dict(d: dict) -> "VoxelGridHeader":
        ox, oy, oz = d["origin"]
        nx, ny, nz = d["dims"]
        return VoxelGridHeader(ox, oy, oz, d["cellM"], nx, ny, nz, d["workingCrs"])

    def index_of(self, x: float, y: float, z: float) -> tuple[int, int, int] | None:
        """Grid cell containing world point (x,y,z), or None if outside the grid."""
        ix = int((x - self.origin_x) / self.cell_m)
        iy = int((y - self.origin_y) / self.cell_m)
        iz = int((z - self.origin_z) / self.cell_m)
        if 0 <= ix < self.nx and 0 <= iy < self.ny and 0 <= iz < self.nz:
            return ix, iy, iz
        return None


def compute_georeference(header: VoxelGridHeader, baseline_m: float = 100.0) -> dict:
    """
    Characterizes the grid's origin and axis orientation in WGS84 terms,
    so Section 4's JS collision code can convert a flight trajectory
    point's lng/lat directly into grid-local (x,y) metres WITHOUT
    needing any reprojection library in the browser — only bearing +
    distance math already used throughout the app (see
    geometry.bearing_deg's docstring).

    WHY THIS IS NECESSARY, NOT JUST THOROUGH: `working_crs` (a UTM zone,
    typically) is locally flat, but its +X/+Y axes are NOT exactly
    east/north — they're rotated from true north by the projection's
    convergence angle, which grows with distance from the projection's
    central meridian. At Maple Hill's longitude this measures out to
    about 2 degrees (verified against both this exact bearing
    computation and the independent textbook convergence-angle formula
    γ ≈ Δλ·sin(φ), which agree to within 0.01°). Two degrees sounds
    small; over a 300 m fairway it's ~10 m of lateral error — well
    past the width of a tree's crown. Ignoring it wouldn't just be
    imprecise, it would misplace every collision check.

    Returns {originLng, originLat, xAxisBearingDeg, yAxisBearingDeg}.
    `baseline_m` (100 m) is large enough for a numerically stable
    bearing estimate yet far below course scale, so the local-flatness
    assumption underlying `bearing_deg` stays valid over it.
    """
    import pyproj

    to_wgs84 = pyproj.Transformer.from_crs(header.working_crs, "EPSG:4326", always_xy=True)
    ox, oy = header.origin_x, header.origin_y
    origin_lng, origin_lat = to_wgs84.transform(ox, oy)
    x_lng, x_lat = to_wgs84.transform(ox + baseline_m, oy)
    y_lng, y_lat = to_wgs84.transform(ox, oy + baseline_m)

    return {
        "originLng": origin_lng,
        "originLat": origin_lat,
        "xAxisBearingDeg": bearing_deg(origin_lng, origin_lat, x_lng, x_lat),
        "yAxisBearingDeg": bearing_deg(origin_lng, origin_lat, y_lng, y_lat),
    }


def build_voxel_grid(veg_x: np.ndarray, veg_y: np.ndarray, veg_z: np.ndarray,
                      working_crs: str, cell_m: float = 1.0,
                      max_dim: int = 1200) -> tuple[VoxelGridHeader, np.ndarray]:
    """
    Bin vegetation-classified points into a boolean occupancy grid.

    @param veg_x, veg_y, veg_z: vegetation point coordinates in the
        working (metric) CRS — caller filters by Classification in
        (3,4,5) before calling this; kept out of this function so it's
        testable with plain synthetic arrays, no PDAL structured-array
        dependency.
    @param max_dim: safety cap per axis. A wildly wrong bbox (e.g. degrees
        accidentally passed instead of meters) would otherwise try to
        allocate a grid with billions of cells; this fails loudly instead.

    @returns (header, occupied) where `occupied` is a boolean ndarray of
        shape (nx, ny, nz) — True where at least one vegetation point
        falls in that cell.
    """
    if len(veg_x) == 0:
        raise ValueError("build_voxel_grid: no vegetation points supplied")

    min_x, max_x = float(veg_x.min()), float(veg_x.max())
    min_y, max_y = float(veg_y.min()), float(veg_y.max())
    min_z, max_z = float(veg_z.min()), float(veg_z.max())

    # Pad by one cell so points exactly on the max edge still fall inside.
    nx = min(max_dim, int(np.ceil((max_x - min_x) / cell_m)) + 1)
    ny = min(max_dim, int(np.ceil((max_y - min_y) / cell_m)) + 1)
    nz = min(max_dim, int(np.ceil((max_z - min_z) / cell_m)) + 1)
    if nx <= 0 or ny <= 0 or nz <= 0:
        raise ValueError(f"build_voxel_grid: degenerate grid dims ({nx},{ny},{nz}) — check units/cell_m")

    header = VoxelGridHeader(min_x, min_y, min_z, cell_m, nx, ny, nz, working_crs)

    ix = np.clip(((veg_x - min_x) / cell_m).astype(np.int64), 0, nx - 1)
    iy = np.clip(((veg_y - min_y) / cell_m).astype(np.int64), 0, ny - 1)
    iz = np.clip(((veg_z - min_z) / cell_m).astype(np.int64), 0, nz - 1)

    occupied = np.zeros((nx, ny, nz), dtype=bool)
    occupied[ix, iy, iz] = True
    return header, occupied


MAGIC = b"TVOX"
VERSION = 1


def pack_voxel_grid(occupied: np.ndarray) -> bytes:
    """Bit-pack a boolean (nx,ny,nz) array to 1 bit/cell, row-major
    (x slowest, z fastest) — matches VoxelGridHeader.index_of()'s
    flattening order via `x*ny*nz + y*nz + z`, asserted by the round-trip
    test rather than left implicit."""
    flat = occupied.reshape(-1)
    packed = np.packbits(flat)
    return MAGIC + struct.pack("<BI", VERSION, flat.size) + packed.tobytes()


def unpack_voxel_grid(data: bytes, nx: int, ny: int, nz: int) -> np.ndarray:
    if data[:4] != MAGIC:
        raise ValueError(f"unpack_voxel_grid: bad magic {data[:4]!r}, expected {MAGIC!r}")
    version, n_bits = struct.unpack("<BI", data[4:9])
    if version != VERSION:
        raise ValueError(f"unpack_voxel_grid: unsupported version {version}")
    if n_bits != nx * ny * nz:
        raise ValueError(f"unpack_voxel_grid: bit count {n_bits} != {nx}*{ny}*{nz}={nx*ny*nz}")
    packed = np.frombuffer(data[9:], dtype=np.uint8)
    flat = np.unpackbits(packed, count=n_bits).astype(bool)
    return flat.reshape(nx, ny, nz)


def write_voxel_grid(header: VoxelGridHeader, occupied: np.ndarray, bin_path: Path | str, header_path: Path | str) -> None:
    Path(bin_path).write_bytes(pack_voxel_grid(occupied))
    payload = {**header.to_dict(), "georeference": compute_georeference(header)}
    Path(header_path).write_text(json.dumps(payload, separators=(",", ":")))


def read_voxel_grid(bin_path: Path | str, header_path: Path | str) -> tuple[VoxelGridHeader, np.ndarray]:
    header = VoxelGridHeader.from_dict(json.loads(Path(header_path).read_text()))
    occupied = unpack_voxel_grid(Path(bin_path).read_bytes(), header.nx, header.ny, header.nz)
    return header, occupied
