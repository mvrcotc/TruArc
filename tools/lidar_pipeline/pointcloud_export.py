"""
TruArc LiDAR Pipeline — "True View" Point Cloud Export (Section 3, step 4 support)

The roadmap's step 4 ("true view" toggle: a decimated raw point cloud a
player can switch to and see the literal tree) assumed this export
already existed as part of Section 2's output set. It didn't — Section 2
shipped `{course}_trees.json` (segmented records), `{course}_voxels.bin`
(collision occupancy), and `{course}_dtm.json` (terrain), none of which
preserves individual point positions at full resolution. This closes
that gap: a small, capped, WGS84-coordinate point export, decimated to
the roadmap's "~300k points max, COPC streaming is a later upgrade,
don't build it yet" scope.

WGS84 (lng/lat/altitude), not the working (metric) CRS the rest of the
pipeline operates in, is the deliberate choice here: the JS consumer
(src/map's "true view" point-cloud layer) already has a verified
lng/lat/altitude → scene-space transform (`lngLatAltToScene`, tested
against Mapbox's own MercatorCoordinate in Section 3 step 1) and every
OTHER thing it renders — the TreeRecord inventory — is in the same
coordinates. A working-CRS export would need a second, separately-
verified metric→scene transform in JS for no benefit; this one reuses
code that's already been proven correct rather than adding a new
coordinate path to get right.

Vegetation-classified points are prioritized when decimating: "see the
literal tree" is the entire purpose of this export, and ground/other
points are cheap to imply from the DTM the player can already see.
"""
from __future__ import annotations

import json
import struct
from dataclasses import dataclass
from pathlib import Path

import numpy as np

MAGIC = b"TPTS"
VERSION = 1
MICRODEG = 1_000_000  # int32 microdegrees ≈ 1.1 cm resolution at the equator

# ASPRS classification codes worth keeping in a "see the literal tree"
# export; ground is included at low priority so the point cloud doesn't
# look like it's floating.
CLASS_GROUND = 2
CLASS_VEGETATION = (3, 4, 5)
DEFAULT_MAX_POINTS = 300_000


@dataclass(frozen=True)
class PointCloudHeader:
    count: int
    schema_version: int = 1

    def to_dict(self) -> dict:
        return {"count": self.count, "schemaVersion": self.schema_version}


def decimate_prioritizing_vegetation(
    classification: np.ndarray, max_points: int = DEFAULT_MAX_POINTS, seed: int = 0,
) -> np.ndarray:
    """
    Index array selecting up to `max_points` points, keeping ALL
    vegetation points if they fit the budget and filling any remainder
    with a random sample of everything else (mostly ground, so the
    canopy doesn't appear to float with nothing beneath it). Purely
    index selection — no coordinate math — so it's testable without a
    real point cloud.
    """
    n = len(classification)
    if n <= max_points:
        return np.arange(n)

    veg_mask = np.isin(classification, CLASS_VEGETATION)
    veg_idx = np.flatnonzero(veg_mask)
    other_idx = np.flatnonzero(~veg_mask)

    rng = np.random.default_rng(seed)
    if len(veg_idx) >= max_points:
        return rng.choice(veg_idx, size=max_points, replace=False)

    remaining = max_points - len(veg_idx)
    other_sample = rng.choice(other_idx, size=min(remaining, len(other_idx)), replace=False)
    return np.concatenate([veg_idx, other_sample])


def pack_point_cloud(lng: np.ndarray, lat: np.ndarray, altitude_m: np.ndarray,
                      classification: np.ndarray) -> bytes:
    """
    Binary layout per point (13 bytes): int32 lng-microdegrees,
    int32 lat-microdegrees, float32 altitude (metres), uint8 classification.
    """
    n = len(lng)
    if not (len(lat) == len(altitude_m) == len(classification) == n):
        raise ValueError("pack_point_cloud: all arrays must have the same length")

    lng_i32 = np.round(lng * MICRODEG).astype(np.int64)
    lat_i32 = np.round(lat * MICRODEG).astype(np.int64)
    if (np.abs(lng_i32) > 2**31 - 1).any() or (np.abs(lat_i32) > 2**31 - 1).any():
        raise ValueError("pack_point_cloud: coordinate out of int32 microdegree range — check units")

    out = bytearray(MAGIC + struct.pack("<BI", VERSION, n))
    for i in range(n):
        out += struct.pack("<iiBf", int(lng_i32[i]), int(lat_i32[i]), int(classification[i]), float(altitude_m[i]))
    return bytes(out)


def unpack_point_cloud(data: bytes) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    if data[:4] != MAGIC:
        raise ValueError(f"unpack_point_cloud: bad magic {data[:4]!r}, expected {MAGIC!r}")
    version, n = struct.unpack("<BI", data[4:9])
    if version != VERSION:
        raise ValueError(f"unpack_point_cloud: unsupported version {version}")

    stride = 4 + 4 + 1 + 4
    body = data[9:]
    expected = n * stride
    if len(body) != expected:
        raise ValueError(f"unpack_point_cloud: body is {len(body)} bytes, expected {expected} for {n} points")

    lng = np.empty(n, dtype=np.float64)
    lat = np.empty(n, dtype=np.float64)
    alt = np.empty(n, dtype=np.float32)
    cls = np.empty(n, dtype=np.uint8)
    for i in range(n):
        lng_i, lat_i, c, a = struct.unpack_from("<iiBf", body, i * stride)
        lng[i] = lng_i / MICRODEG
        lat[i] = lat_i / MICRODEG
        alt[i] = a
        cls[i] = c
    return lng, lat, alt, cls


def write_point_cloud(lng: np.ndarray, lat: np.ndarray, altitude_m: np.ndarray,
                       classification: np.ndarray, bin_path: Path | str, header_path: Path | str) -> None:
    Path(bin_path).write_bytes(pack_point_cloud(lng, lat, altitude_m, classification))
    Path(header_path).write_text(json.dumps(PointCloudHeader(count=len(lng)).to_dict(), separators=(",", ":")))


def read_point_cloud(bin_path: Path | str, header_path: Path | str):
    header = json.loads(Path(header_path).read_text())
    lng, lat, alt, cls = unpack_point_cloud(Path(bin_path).read_bytes())
    if len(lng) != header["count"]:
        raise ValueError(f"read_point_cloud: header count {header['count']} != decoded {len(lng)}")
    return lng, lat, alt, cls
