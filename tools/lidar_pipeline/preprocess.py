"""
TruArc LiDAR Pipeline — PDAL Preprocessing (Section 2, step 2)

Reproject → crop → ground-classify → height-above-ground → denoise.

Split deliberately into a pure pipeline-JSON *builder* (fully testable —
asserts stage order and options without running PDAL) and a thin
*executor* (imports pdal lazily, cannot be exercised in this session —
no PDAL system library is installable in this sandbox). Keeping the
executor minimal means the untested surface is as small as it can be;
every decision (which stages, in what order, with what parameters) lives
in the tested builder function.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path

from .geometry import BBox, resolve_working_crs, bbox_to_wkt_polygon

log = logging.getLogger("truarc.lidar.preprocess")

# LAS classification codes (ASPRS standard) this pipeline cares about.
CLASS_GROUND = 2
CLASS_LOW_VEG = 3
CLASS_MED_VEG = 4
CLASS_HIGH_VEG = 5
CLASS_VEGETATION = (CLASS_LOW_VEG, CLASS_MED_VEG, CLASS_HIGH_VEG)
CLASS_NOISE = 7
CLASS_HIGH_NOISE = 18  # filters.outlier's default noise class


@dataclass(frozen=True)
class SmrfParams:
    """PDAL filters.smrf defaults, tuned for wooded/rolling terrain typical
    of a disc golf course (denser cell grid than SMRF's flat-terrain
    defaults, since fairways are narrow relative to open agricultural
    land — a coarser cell risks a single cell spanning fairway and
    treeline, biasing the ground surface upward under canopy edges).
    """
    cell: float = 1.0
    slope: float = 0.20
    window: float = 16.0
    threshold: float = 0.45
    scalar: float = 1.2


def class_counts_indicate_preclassified(class_counts: dict[int, int], min_ground_fraction: float = 0.01) -> bool:
    """
    Decide whether SMRF needs to run at all. Most USGS 3DEP LPC deliveries
    already carry a full ASPRS classification from USGS's own production
    pipeline — running SMRF again is redundant work at best and can
    disagree with (and degrade) an already-good classification at worst.
    Pure function: takes {classification_code: point_count}, no PDAL.
    """
    total = sum(class_counts.values())
    if total == 0:
        return False
    ground = class_counts.get(CLASS_GROUND, 0)
    veg = sum(class_counts.get(c, 0) for c in CLASS_VEGETATION)
    return (ground / total) >= min_ground_fraction and (veg / total) >= min_ground_fraction


@dataclass(frozen=True)
class PreprocessResult:
    pipeline_json: dict
    working_crs: str
    ran_smrf: bool
    stages: list[str] = field(default_factory=list)


def build_preprocess_pipeline(
    input_path: Path | str,
    source_crs: str,
    bbox: BBox,
    run_smrf: bool,
    smrf: SmrfParams = SmrfParams(),
) -> PreprocessResult:
    """
    Build (but do not execute) the PDAL pipeline for step 2.

    Stage order matters and is deliberate:
      1. read                  — raw LAS/LAZ, CRS override if metadata is missing
      2. reproject              — source CRS -> working (metric) CRS, ONCE,
                                   before any metric filter runs
      3. crop (bbox)            — cheap, coarse clip first so every later
                                   stage processes less data
      4. smrf (conditional)     — only if the input isn't already classified
      5. outlier + range        — statistical noise removal, then drop
                                   points flagged as noise (18) or already
                                   marked noise (7) in the source data
      6. hag_nn                 — height above ground, needs ground (class 2)
                                   points present, so must come after
                                   classification is settled
      7. crop (exact polygon)   — bbox already narrowed the data; this
                                   would be the course's real boundary
                                   polygon once Section 5 provides one.
                                   Currently reuses `bbox` again — see
                                   the note in pipeline.py.
    """
    working_crs = resolve_working_crs(source_crs, bbox)
    stages: list[dict] = []
    stage_names: list[str] = []

    reader = {"type": "readers.las", "filename": str(input_path)}
    if source_crs and "EPSG" in source_crs.upper():
        reader["override_srs"] = source_crs
    stages.append(reader)
    stage_names.append("readers.las")

    if source_crs != working_crs:
        stages.append({
            "type": "filters.reprojection",
            "in_srs": source_crs or working_crs,
            "out_srs": working_crs,
        })
        stage_names.append("filters.reprojection")

    crop_wkt = bbox_to_wkt_polygon(bbox, working_crs)
    stages.append({"type": "filters.crop", "polygon": crop_wkt})
    stage_names.append("filters.crop(bbox)")

    if run_smrf:
        stages.append({
            "type": "filters.smrf",
            "cell": smrf.cell,
            "slope": smrf.slope,
            "window": smrf.window,
            "threshold": smrf.threshold,
            "scalar": smrf.scalar,
        })
        stage_names.append("filters.smrf")

    stages.append({
        "type": "filters.outlier",
        "method": "statistical",
        "mean_k": 8,
        "multiplier": 2.5,
    })
    stage_names.append("filters.outlier")
    stages.append({
        "type": "filters.range",
        "limits": f"Classification![{CLASS_NOISE}:{CLASS_NOISE}], Classification![{CLASS_HIGH_NOISE}:{CLASS_HIGH_NOISE}]",
    })
    stage_names.append("filters.range(denoise)")

    stages.append({"type": "filters.hag_nn"})
    stage_names.append("filters.hag_nn")

    stages.append({"type": "filters.crop", "polygon": crop_wkt})
    stage_names.append("filters.crop(exact)")

    return PreprocessResult(
        pipeline_json={"pipeline": stages},
        working_crs=working_crs,
        ran_smrf=run_smrf,
        stages=stage_names,
    )


def detect_source_crs(input_path: Path | str) -> str:
    """
    PDAL-dependent (not testable in this sandbox): read the LAZ's own SRS
    metadata via filters.info. USGS 3DEP LPC deliveries generally carry
    correct SRS metadata (unlike the older, hand-collected data
    process_lidar.py's version of this function was written for, which
    is why that one falls back to a hardcoded Massachusetts state plane
    guess) — if metadata is missing here, that's surprising enough to
    raise rather than silently guess a region-specific fallback that
    would silently misplace a course outside New England.
    """
    import pdal
    import json as _json

    pipeline = pdal.Pipeline(_json.dumps({
        "pipeline": [
            {"type": "readers.las", "filename": str(input_path)},
            {"type": "filters.info"},
        ]
    }))
    pipeline.execute()
    meta = _json.loads(pipeline.metadata)
    readers = meta.get("metadata", {}).get("readers.las", {})
    if isinstance(readers, list):
        readers = readers[0] if readers else {}
    srs = readers.get("comp_spatialreference") or readers.get("spatialreference")
    if not srs or len(srs) < 10:
        raise RuntimeError(
            f"{input_path}: no CRS found in LAZ metadata. USGS 3DEP tiles should carry this; "
            "if this is unexpected input data, pass source_crs explicitly."
        )
    return srs


def inspect_classification(input_path: Path | str) -> dict[int, int]:
    """
    PDAL-dependent (not testable in this sandbox): read the file and
    return {classification_code: count} via filters.stats, so the caller
    can decide `run_smrf` via `class_counts_indicate_preclassified` above
    before building the real pipeline.
    """
    import pdal  # local import: this module must stay importable without PDAL

    pipeline = pdal.Pipeline(__import__("json").dumps({
        "pipeline": [
            {"type": "readers.las", "filename": str(input_path)},
            {"type": "filters.stats", "dimensions": "Classification"},
        ]
    }))
    pipeline.execute()
    meta = pipeline.metadata
    import json as _json
    stats = _json.loads(meta)["metadata"]["filters.stats"]["statistic"]
    class_stat = next(s for s in stats if s["name"] == "Classification")
    counts = class_stat.get("counts", [])
    return {int(c["value"]): int(c["count"]) for c in counts}


def run_preprocess(result: PreprocessResult):
    """
    PDAL-dependent execution (not testable in this sandbox). Returns the
    PDAL pipeline's output point array (a numpy structured array with
    X, Y, Z, Classification, HeightAboveGround fields) for downstream
    steps (voxelgrid.py, terrain.py, and Section 2 step 3's segmentation)
    to consume directly — no intermediate file write needed.
    """
    import pdal
    import json as _json

    pipeline = pdal.Pipeline(_json.dumps(result.pipeline_json))
    count = pipeline.execute()
    log.info("PDAL pipeline executed: %d points, stages=%s", count, result.stages)
    return pipeline.arrays[0]
