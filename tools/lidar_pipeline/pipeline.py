#!/usr/bin/env python3
"""
TruArc LiDAR Tree Inventory Pipeline — Orchestrator (Section 2)

    python -m tools.lidar_pipeline.pipeline --course maple-hill-gold

Wires steps 1-7 together: acquire USGS tiles -> preprocess -> voxel
occupancy grid -> DTM -> per-tree segmentation -> optional upload.
`--skip-trees` stops before segmentation when only the collision/terrain
outputs are wanted (they do not depend on it).

This orchestrator itself needs PDAL and live network access to run for
real — neither is available in the sandbox this was developed in (see
the module docstrings in acquire.py and preprocess.py for what WAS
verified: request/pipeline construction against fixtures, and every pure
geometry/schema/voxel/terrain function against synthetic data). Treat a
first real run against Maple Hill as the actual integration test.
"""
from __future__ import annotations

import argparse
import json
import logging
from pathlib import Path

import numpy as np

from . import acquire, pointcloud_export, preprocess, schema, segmentation, storage, terrain, voxelgrid
from .geometry import resolve_course_bbox

log = logging.getLogger("truarc.lidar.pipeline")

REPO_ROOT = Path(__file__).resolve().parents[2]
RAW_CACHE_DIR = REPO_ROOT / "raw_data" / "usgs_cache"
OUTPUT_DIR = REPO_ROOT / "processed_data" / "courses"


def load_course_holes(course_id: str) -> list[dict]:
    """
    Extract `holes` for `course_id` from src/data/courses.js.

    courses.js is a JS module (computed `basket` fields, helper
    functions), not JSON, so it can't be `json.load`ed directly. Rather
    than embedding a JS parser, this shells out to Node — already a
    project dependency — to import the module and dump exactly the
    `holes` array as JSON. Keeps a single source of truth for course
    data instead of a second, driftable copy in Python.
    """
    import subprocess

    script = f"""
    import {{ COURSE_DATABASE }} from '{(REPO_ROOT / 'src/data/courses.js').as_posix()}';
    const course = COURSE_DATABASE.find(c => c.id === '{course_id}');
    if (!course) {{ console.error('NOT_FOUND'); process.exit(1); }}
    console.log(JSON.stringify(course.holes));
    """
    result = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        capture_output=True, text=True, cwd=REPO_ROOT,
    )
    if result.returncode != 0:
        if "NOT_FOUND" in result.stderr:
            raise ValueError(f"Course '{course_id}' not found in src/data/courses.js")
        raise RuntimeError(f"Failed to load course data via Node: {result.stderr}")
    return json.loads(result.stdout)


def run_course(course_id: str, skip_trees: bool = False, run_smrf: bool | None = None) -> dict:
    log.info("━━━ TruArc LiDAR pipeline: %s ━━━", course_id)
    output_dir = OUTPUT_DIR / course_id
    output_dir.mkdir(parents=True, exist_ok=True)

    holes = load_course_holes(course_id)
    bbox, bbox_source = resolve_course_bbox(course_id, holes)
    log.info("[1/6] Course bounds (%s): %s (%.3f km²)", bbox_source, bbox.as_tnm_bbox(), bbox.area_km2())

    log.info("[2/6] Acquiring USGS 3DEP tiles...")
    tiles = acquire.acquire_course_tiles(bbox, RAW_CACHE_DIR)
    if not tiles:
        raise RuntimeError(f"No LiDAR tiles found/downloaded for {course_id} — see acquire.py's warning above")
    log.info("       %d tile(s): %s", len(tiles), [t.name for t in tiles])

    log.info("[3/6] Preprocessing (reproject/crop/classify/HAG/denoise)...")
    all_points = []
    working_crs = None
    for tile in tiles:
        source_crs = preprocess.detect_source_crs(tile)
        if run_smrf is None:
            class_counts = preprocess.inspect_classification(tile)
            tile_run_smrf = not preprocess.class_counts_indicate_preclassified(class_counts)
        else:
            tile_run_smrf = run_smrf
        result = preprocess.build_preprocess_pipeline(tile, source_crs, bbox, run_smrf=tile_run_smrf)
        working_crs = result.working_crs
        points = preprocess.run_preprocess(result)
        all_points.append(points)
    points = np.concatenate(all_points) if len(all_points) > 1 else all_points[0]
    log.info("       %d points after preprocessing, working CRS %s", len(points), working_crs)

    ground_mask = points["Classification"] == preprocess.CLASS_GROUND
    veg_mask = np.isin(points["Classification"], preprocess.CLASS_VEGETATION)

    log.info("[4/7] Building voxel occupancy grid...")
    outputs = {}
    if veg_mask.sum() > 0:
        v_header, v_occ = voxelgrid.build_voxel_grid(
            points["X"][veg_mask], points["Y"][veg_mask], points["Z"][veg_mask], working_crs,
        )
        bin_path = output_dir / f"{course_id}_voxels.bin"
        hdr_path = output_dir / f"{course_id}_voxels_header.json"
        voxelgrid.write_voxel_grid(v_header, v_occ, bin_path, hdr_path)
        outputs["voxels"] = str(bin_path)
        log.info("       %d/%d cells occupied", int(v_occ.sum()), v_occ.size)
    else:
        log.warning("       no vegetation-classified points — skipping voxel grid")

    log.info("[5/7] Building DTM...")
    if ground_mask.sum() > 0:
        d_header, d_grid = terrain.build_dtm_grid(
            points["X"][ground_mask], points["Y"][ground_mask], points["Z"][ground_mask], working_crs,
        )
        dtm_path = output_dir / f"{course_id}_dtm.json"
        terrain.write_dtm_json(d_header, d_grid, dtm_path)
        outputs["dtm"] = str(dtm_path)
        coverage = 1 - (np.isnan(d_grid).sum() / d_grid.size)
        log.info("       %.0f%% ground coverage", coverage * 100)
    else:
        log.warning("       no ground-classified points — skipping DTM")

    log.info("[6/7] Exporting decimated point cloud (Section 3 'true view')...")
    idx = pointcloud_export.decimate_prioritizing_vegetation(points["Classification"])
    if len(idx) > 0:
        import pyproj
        to_wgs84 = pyproj.Transformer.from_crs(working_crs, "EPSG:4326", always_xy=True)
        lng, lat = to_wgs84.transform(points["X"][idx], points["Y"][idx])
        pts_bin_path = output_dir / f"{course_id}_points.bin"
        pts_hdr_path = output_dir / f"{course_id}_points_header.json"
        pointcloud_export.write_point_cloud(
            np.asarray(lng), np.asarray(lat), points["Z"][idx],
            points["Classification"][idx], pts_bin_path, pts_hdr_path,
        )
        outputs["points"] = str(pts_bin_path)
        log.info("       %d point(s) (%.0f%% of %d)", len(idx), 100 * len(idx) / len(points), len(points))
    else:
        log.warning("       no points to export")

    if not skip_trees:
        log.info("[7/7] Segmenting individual trees...")
        trees = segmentation.segment_trees(points, working_crs)
        trees_path = output_dir / f"{course_id}_trees.json"
        schema.write_trees_json(trees, trees_path, course_id,
                                 source_note=f"USGS 3DEP via tools.lidar_pipeline, {len(tiles)} tile(s)")
        outputs["trees"] = str(trees_path)
        log.info("       %d tree(s) written", len(trees))
    else:
        log.info("[7/7] Tree segmentation skipped (--skip-trees)")

    log.info("✓ %s complete. Outputs: %s", course_id, output_dir)
    return outputs


def upload_course(course_id: str) -> list[str]:
    output_dir = OUTPUT_DIR / course_id
    bucket = storage.get_default_bucket()
    return storage.upload_course_outputs(course_id, output_dir, bucket)


def main():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)-7s  %(message)s")

    parser = argparse.ArgumentParser(description="TruArc LiDAR tree inventory pipeline")
    parser.add_argument("--course", "-c", required=True, help="Course id, matching src/data/courses.js")
    parser.add_argument("--skip-trees", action="store_true", help="Stop before segmentation (voxel grid + DTM only)")
    parser.add_argument("--force-smrf", dest="run_smrf", action="store_const", const=True, default=None,
                         help="Always run SMRF ground classification, even if the input looks pre-classified")
    parser.add_argument("--no-smrf", dest="run_smrf", action="store_const", const=False,
                         help="Never run SMRF, trust the input's existing classification")
    parser.add_argument("--upload", action="store_true", help="Upload outputs to Firebase Storage after processing")
    args = parser.parse_args()

    run_course(args.course, skip_trees=args.skip_trees, run_smrf=args.run_smrf)

    if args.upload:
        upload_course(args.course)


if __name__ == "__main__":
    main()
