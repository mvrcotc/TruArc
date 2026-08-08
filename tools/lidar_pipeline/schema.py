"""
TruArc LiDAR Pipeline — Per-Tree Schema & Serialization (Section 2, step 4)

This is the payload that kills the generic tree: instead of one height
number, each tree carries the crown profile that lets Section 3 render
its actual silhouette instead of a stretched placeholder model.

`segment_trees()` — the canopy-height-model rasterization, treetop
detection, and crown delineation that PRODUCES these records from raw
points — is Section 2 step 3 and is intentionally NOT implemented here.
Quality there decides whether the app is trustworthy in the woods, which
is why the roadmap calls for it to be done (and reviewed) on Opus rather
than folded into this Sonnet pass. The stub below raises loudly rather
than silently returning nothing, so `pipeline.py` fails clearly instead
of writing an empty trees.json if run end-to-end before step 3 lands.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, asdict
from pathlib import Path


@dataclass(frozen=True)
class TreeRecord:
    lng: float
    lat: float
    ground_elev_m: float
    height_m: float
    crown_radius_m: float
    crown_base_m: float
    # Crown radius as a FRACTION of crown_radius_m, sampled at 6 evenly
    # spaced height fractions from crown_base_m (0.0) to the treetop
    # (1.0) — the real silhouette, per docs/ACCURACY_ROADMAP.md §2.4.
    # len(profile) == 6 is asserted in validate(); Section 3's renderer
    # lathes exactly 6 slices, so this isn't an arbitrary default.
    profile: tuple[float, float, float, float, float, float]
    form: str  # "conifer" | "deciduous"
    point_count: int

    def validate(self) -> None:
        if len(self.profile) != 6:
            raise ValueError(f"profile must have exactly 6 slices, got {len(self.profile)}")
        if any(not (0.0 <= p <= 1.5) for p in self.profile):
            # >1.0 allowed in principle (a crown can bulge past its
            # nominal max radius in one slice) but >1.5 almost certainly
            # indicates a units or normalization bug upstream.
            raise ValueError(f"profile value out of plausible range [0, 1.5]: {self.profile}")
        if self.form not in ("conifer", "deciduous"):
            raise ValueError(f"form must be 'conifer' or 'deciduous', got {self.form!r}")
        if self.height_m <= 0:
            raise ValueError(f"height_m must be positive, got {self.height_m}")
        if self.crown_radius_m <= 0:
            raise ValueError(f"crown_radius_m must be positive, got {self.crown_radius_m}")
        if self.crown_base_m < 0 or self.crown_base_m >= self.height_m:
            raise ValueError(f"crown_base_m ({self.crown_base_m}) must be in [0, height_m={self.height_m})")

    def to_dict(self) -> dict:
        d = asdict(self)
        d["profile"] = list(d["profile"])
        return d


def classify_form(profile: tuple[float, ...]) -> str:
    """
    Conifer vs. deciduous from crown SHAPE alone (no species data
    available from LiDAR). A conifer's profile tapers roughly
    monotonically from a wide base to a point; a deciduous crown is
    roughly ellipsoid — widest in the middle, narrower at both base and
    top. Simple, explainable heuristic; Section 3's `form` consumer only
    needs "spiky vs. round", not a species ID.
    """
    if len(profile) != 6:
        raise ValueError("classify_form expects a 6-slice profile")
    peak_idx = max(range(6), key=lambda i: profile[i])
    # "Widest slice is in the top half AND the top slice is narrow" reads
    # as tapering-to-a-point (conifer); anything else defaults to the
    # safer, more common deciduous form for a typical New England course.
    tapers_to_point = profile[5] < 0.35 * max(profile)
    widest_near_base = peak_idx <= 1
    return "conifer" if (widest_near_base and tapers_to_point) else "deciduous"


def write_trees_json(trees: list[TreeRecord], out_path: Path | str, course_id: str, source_note: str = "") -> None:
    for t in trees:
        t.validate()
    payload = {
        "course_id": course_id,
        "count": len(trees),
        "source": source_note,
        "schema_version": 1,
        "trees": [t.to_dict() for t in trees],
    }
    Path(out_path).write_text(json.dumps(payload, separators=(",", ":")))


def read_trees_json(path: Path | str) -> list[TreeRecord]:
    data = json.loads(Path(path).read_text())
    trees = []
    for t in data["trees"]:
        rec = TreeRecord(
            lng=t["lng"], lat=t["lat"], ground_elev_m=t["ground_elev_m"],
            height_m=t["height_m"], crown_radius_m=t["crown_radius_m"],
            crown_base_m=t["crown_base_m"], profile=tuple(t["profile"]),
            form=t["form"], point_count=t["point_count"],
        )
        rec.validate()
        trees.append(rec)
    return trees


def segment_trees(points, working_crs: str):
    """
    Section 2, step 3 — CHM rasterization, treetop detection, crown
    delineation. NOT implemented in this pass; see the module docstring.

    Expected signature once implemented: `points` is the numpy
    structured array from preprocess.run_preprocess() (fields X, Y, Z,
    Classification, HeightAboveGround, in `working_crs` meters), and this
    returns `list[TreeRecord]` with lng/lat already converted back to
    WGS84.
    """
    raise NotImplementedError(
        "segment_trees() is Section 2 step 3 (canopy segmentation) — "
        "see docs/ACCURACY_ROADMAP.md §2. Deliberately unimplemented here; "
        "run on Opus per the roadmap's model assignment for this step."
    )
