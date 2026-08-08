"""
TruArc LiDAR Pipeline — Course Boundary Geometry

Derives the area a course's LiDAR should cover from its hole data (the
same tee/basket coordinates already in src/data/courses.js), rather than
requiring a hand-drawn boundary file for every course before this
pipeline can run at all. A hand-drawn `bounds/{course_id}.geojson` is
still supported and takes precedence when present — see
`load_course_bounds()` — for courses where the auto-derived buffer cuts
off real fairway (severe doglegs, long par 5s with wide zigzags).

Coordinate conventions match src/data/courses.js and
src/utils/flightPhysics.js exactly (same METERS_PER_DEG_LAT constant),
so a buffer specified in meters here means the same thing it would in
the JS app.
"""
from __future__ import annotations

import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

METERS_PER_DEG_LAT = 111_320.0


def meters_per_deg_lng(lat_deg: float) -> float:
    return METERS_PER_DEG_LAT * math.cos(math.radians(lat_deg))


@dataclass(frozen=True)
class BBox:
    """WGS84 bounding box. min/max are (lng, lat) — matches GeoJSON [minX, minY, maxX, maxY]."""
    min_lng: float
    min_lat: float
    max_lng: float
    max_lat: float

    def as_tnm_bbox(self) -> str:
        """`minX,minY,maxX,maxY` — the exact query-param format the USGS
        TNM Access API expects (see acquire.py)."""
        return f"{self.min_lng:.6f},{self.min_lat:.6f},{self.max_lng:.6f},{self.max_lat:.6f}"

    def area_km2(self) -> float:
        lat_mid = (self.min_lat + self.max_lat) / 2
        w_m = (self.max_lng - self.min_lng) * meters_per_deg_lng(lat_mid)
        h_m = (self.max_lat - self.min_lat) * METERS_PER_DEG_LAT
        return abs(w_m * h_m) / 1_000_000

    def overlaps(self, other: "BBox") -> bool:
        return not (
            self.max_lng < other.min_lng or other.max_lng < self.min_lng
            or self.max_lat < other.min_lat or other.max_lat < self.min_lat
        )

    def to_geojson_polygon(self) -> dict:
        return {
            "type": "Polygon",
            "coordinates": [[
                [self.min_lng, self.min_lat],
                [self.max_lng, self.min_lat],
                [self.max_lng, self.max_lat],
                [self.min_lng, self.max_lat],
                [self.min_lng, self.min_lat],
            ]],
        }


def _points_from_holes(holes: Iterable[dict]) -> list[tuple[float, float]]:
    """Extract every (lng, lat) point worth bounding: tee, basket, and any
    fairway waypoints a hole schema might carry (courses.js doesn't have
    these yet — Section 5 adds them — but read them if present so this
    function doesn't need to change when it does)."""
    pts: list[tuple[float, float]] = []
    for hole in holes:
        for key in ("tee", "basket"):
            p = hole.get(key)
            if p and "lng" in p and "lat" in p:
                pts.append((p["lng"], p["lat"]))
        for wp in hole.get("fairway", []) or hole.get("waypoints", []) or []:
            if "lng" in wp and "lat" in wp:
                pts.append((wp["lng"], wp["lat"]))
    return pts


def course_bbox_from_holes(holes: Iterable[dict], buffer_m: float = 45.0) -> BBox:
    """
    Bounding box covering every tee/basket in `holes`, expanded by
    `buffer_m` meters on every side.

    Default buffer (45 m ≈ 150 ft) is chosen to reach past the treeline
    flanking a typical wooded fairway without so wide a margin that
    adjacent, unrelated holes get pulled into a small course's LiDAR —
    tune per-course via a hand-drawn bounds file when it's wrong in
    either direction (see `load_course_bounds`).
    """
    pts = _points_from_holes(holes)
    if not pts:
        raise ValueError("course_bbox_from_holes: no tee/basket coordinates found in holes")

    lngs = [p[0] for p in pts]
    lats = [p[1] for p in pts]
    min_lng, max_lng = min(lngs), max(lngs)
    min_lat, max_lat = min(lats), max(lats)

    lat_mid = (min_lat + max_lat) / 2
    d_lat = buffer_m / METERS_PER_DEG_LAT
    d_lng = buffer_m / meters_per_deg_lng(lat_mid)

    return BBox(min_lng - d_lng, min_lat - d_lat, max_lng + d_lng, max_lat + d_lat)


def load_course_bounds(course_id: str, bounds_dir: Path | str = "bounds") -> BBox | None:
    """
    Load a hand-drawn boundary from `bounds/{course_id}.geojson` if one
    exists (a single Polygon or the first Polygon feature of a
    FeatureCollection). Returns None if no override file is present —
    callers should fall back to `course_bbox_from_holes`.
    """
    path = Path(bounds_dir) / f"{course_id}.geojson"
    if not path.exists():
        return None

    data = json.loads(path.read_text())
    geom = data["geometry"] if data.get("type") == "Feature" else data
    if geom.get("type") == "FeatureCollection":
        geom = next(f["geometry"] for f in geom["features"] if f["geometry"]["type"] == "Polygon")
    if geom["type"] != "Polygon":
        raise ValueError(f"{path}: expected a Polygon boundary, got {geom['type']}")

    ring = geom["coordinates"][0]
    lngs = [c[0] for c in ring]
    lats = [c[1] for c in ring]
    return BBox(min(lngs), min(lats), max(lngs), max(lats))


def resolve_course_bbox(course_id: str, holes: Iterable[dict], bounds_dir: Path | str = "bounds",
                         buffer_m: float = 45.0) -> tuple[BBox, str]:
    """Hand-drawn bounds file wins if present; otherwise derive from holes.
    Returns (bbox, source) where source is 'file' or 'derived', so callers
    can log/record provenance."""
    override = load_course_bounds(course_id, bounds_dir)
    if override is not None:
        return override, "file"
    return course_bbox_from_holes(holes, buffer_m), "derived"


# ─── PROJECTED (METRIC) WORKING CRS ────────────────────────────────
#
# SMRF ground classification and height-above-ground both use metric
# parameters (window size, slope, threshold in meters) — running them in
# WGS84 (degrees) would silently misbehave, since 1° of longitude is not
# 1° of latitude in meters, and neither is 1 meter. So all metric point-
# cloud analysis (ground classification, HAG, cropping, and every step
# after that: voxelization, segmentation, DTM/tree-radius math) happens
# in a projected working CRS, with lng/lat only reintroduced at the very
# end for output coordinates. Preferring the LAZ file's own source CRS
# when it's already projected (common — USGS delivers most LPC tiles in
# a state plane or UTM CRS) avoids an unnecessary reprojection; UTM is
# the deterministic fallback otherwise.

def utm_epsg_for(lng_deg: float, lat_deg: float) -> str:
    """Deterministic UTM zone (WGS84 datum) for a point — the standard
    formula, EPSG:326xx in the northern hemisphere, 327xx in the south."""
    zone = int((lng_deg + 180) / 6) + 1
    zone = max(1, min(60, zone))
    base = 32600 if lat_deg >= 0 else 32700
    return f"EPSG:{base + zone}"


def is_projected_crs(epsg_or_wkt: str) -> bool:
    """True if the CRS's units are linear (meters/feet) rather than
    angular (degrees) — i.e. it's safe to use as a metric working CRS."""
    import pyproj
    try:
        crs = pyproj.CRS.from_user_input(epsg_or_wkt)
    except Exception:
        return False
    axis = crs.axis_info[0] if crs.axis_info else None
    return bool(axis and axis.unit_name.lower() not in ("degree", "degrees", "unknown"))


def resolve_working_crs(source_crs: str, bbox: BBox) -> str:
    """The source CRS if it's already projected/metric, otherwise a UTM
    zone picked from the bbox center."""
    if source_crs and is_projected_crs(source_crs):
        return source_crs
    lat_mid = (bbox.min_lat + bbox.max_lat) / 2
    lng_mid = (bbox.min_lng + bbox.max_lng) / 2
    return utm_epsg_for(lng_mid, lat_mid)


def reproject_ring(ring: list[list[float]], src_epsg: str, dst_epsg: str) -> list[tuple[float, float]]:
    """Reproject a GeoJSON linear ring `[[lng,lat], ...]` from src to dst CRS."""
    import pyproj
    transformer = pyproj.Transformer.from_crs(src_epsg, dst_epsg, always_xy=True)
    return [transformer.transform(x, y) for x, y in ring]


def bbox_to_wkt_polygon(bbox: BBox, dst_epsg: str, src_epsg: str = "EPSG:4326") -> str:
    """WKT POLYGON for `bbox`, reprojected into `dst_epsg` — the format
    PDAL's filters.crop `polygon` option expects, and PDAL does NOT
    reproject this string itself, so it must already be in the point
    data's working CRS by the time it's passed in."""
    ring = bbox.to_geojson_polygon()["coordinates"][0]
    if dst_epsg != src_epsg:
        ring = reproject_ring(ring, src_epsg, dst_epsg)
    coords = ", ".join(f"{x:.3f} {y:.3f}" for x, y in ring)
    return f"POLYGON (({coords}))"
