# LiDAR Workflow for TruArc

There are now **two** LiDAR-related tools in this repo, for different purposes.
Don't confuse them:

| | `process_lidar.py` (repo root) | `tools/lidar_pipeline/` |
|---|---|---|
| Purpose | Quick point-cloud thinning for the in-app **calibration overlay** (Calibrate mode, `public/lidar/overlay.geojson`) | Section 2's **tree inventory pipeline** — per-tree crown shapes + voxel occupancy grid + DTM, replacing generic placeholder trees |
| Input | Manually dropped `.laz`/`.las` in `raw_data/` | Automatic — derives a course's bounds from `src/data/courses.js` and fetches USGS 3DEP tiles itself |
| Output | One flat GeoJSON of decimated points | Per course: `{course}_trees.json`, `{course}_voxels.bin`(+header), `{course}_dtm.json` |
| Status | Existing, unchanged | See `docs/ACCURACY_ROADMAP.md` §2 for exact status |

The **LidarCropper** sibling-repo approach described in earlier versions of this doc
was superseded by `tools/lidar_pipeline/` living in-repo instead — see
`docs/ACCURACY_ROADMAP.md` §2 for why.

---

## `tools/lidar_pipeline/` — Tree Inventory Pipeline

```bash
pip install -r requirements.txt   # needs PDAL system library too — see below
python -m tools.lidar_pipeline.pipeline --course maple-hill-gold
```

**Requires PDAL** (`conda install -c conda-forge pdal` — pip alone can't build it,
it needs the system library) **and network access** to `tnmaccess.nationalmap.gov`
(USGS tile search/download) and, with `--upload`, Firebase Storage. Neither was
available in the sandbox this pipeline was developed in — see the module docstrings
in `acquire.py`, `preprocess.py`, `terrain.py`, and `storage.py` for exactly what was
and wasn't verified there, and `docs/ACCURACY_ROADMAP.md` §2 for the full status.

### What it does

1. Derives the course's LiDAR bounds from its tee/basket coordinates (or a hand-drawn
   override in `bounds/{course_id}.geojson` — see `bounds/README.md`).
2. Searches and downloads covering USGS 3DEP LAZ tiles, cached in `raw_data/usgs_cache/`.
3. Preprocesses via PDAL: reproject to a metric working CRS → crop → ground-classify
   (skipped if the input is already classified) → denoise → height-above-ground.
4. Segments individual trees — **not yet implemented**; this step raises
   `NotImplementedError` naming itself so a full run fails clearly rather than
   silently producing an empty tree inventory. Use `--skip-trees` to stop cleanly
   before it and still get the voxel grid + DTM, which don't depend on it.
5. Builds the voxel occupancy grid and DTM (both fully implemented and tested).
6. Writes everything to `processed_data/courses/{course_id}/`; `--upload` pushes to
   Firebase Storage at `lidar/{course_id}/...`.

### Testing

```bash
python -m unittest discover -s tests/lidar_pipeline -p "test_*.py" -v
```

86 tests covering everything that doesn't need PDAL or live network: course-bounds
geometry, CRS resolution/reprojection (real `pyproj` transforms, not mocked), PDAL
pipeline-JSON construction (structure/ordering, not execution), the tree schema and
its validation, voxel-grid pack/unpack (verified against a synthetic canopy gap), DTM
gridding (verified against a synthetic slope, with missing-data cells confirmed to
stay `null` rather than being fabricated), and the USGS API request/response handling
against a fixture built from its documented schema. Wired into CI
(`.github/workflows/lidar-pipeline-tests.yml`) as a blocking step.

---

## `process_lidar.py` — Calibration Overlay (unchanged)

Still exactly as before: drop a `.laz`/`.las` in `raw_data/`, run `python
process_lidar.py --process raw_data/your_file.laz`, copy the output into
`public/lidar/overlay.geojson`, and toggle it on in Calibrate mode (`C`).
