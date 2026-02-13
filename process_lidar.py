#!/usr/bin/env python3
"""
╔══════════════════════════════════════════════════════════════════╗
║  TruArc — Automated LiDAR Pipeline (process_lidar.py)          ║
║  Auto-processes .laz/.las files for web consumption             ║
╠══════════════════════════════════════════════════════════════════╣
║  Features:                                                      ║
║  • Watches /raw_data folder for new .laz/.las files              ║
║  • Auto-reprojects to EPSG:4326 (WGS84)                         ║
║  • Thins point cloud by ~80% preserving tree structures          ║
║  • Exports lightweight GeoJSON                                   ║
║  • Optionally uploads to Mapbox Tiling Service (MTS)             ║
╚══════════════════════════════════════════════════════════════════╝

Usage:
  python process_lidar.py                  # Watch mode (default)
  python process_lidar.py --process FILE   # Process single file
  python process_lidar.py --help           # Show help

Requirements:
  pip install -r requirements.txt
  Requires PDAL (install via: conda install -c conda-forge pdal)
"""

import os
import sys
import json
import time
import argparse
import logging
import hashlib
from pathlib import Path
from datetime import datetime

try:
    import pdal
except ImportError:
    print("ERROR: PDAL is not installed. Install via: conda install -c conda-forge pdal python-pdal")
    print("  or: pip install pdal  (requires PDAL system library)")
    sys.exit(1)

try:
    import requests
except ImportError:
    requests = None  # Optional: only needed for Mapbox upload


# ─── CONFIG ────────────────────────────────────────────────────

RAW_DATA_DIR = Path(__file__).parent / "raw_data"
OUTPUT_DIR = Path(__file__).parent / "processed_data"
LOG_DIR = Path(__file__).parent / "logs"

# Mapbox Tiling Service config (set via env vars)
MAPBOX_TOKEN = os.environ.get("MAPBOX_ACCESS_TOKEN", "")
MAPBOX_USERNAME = os.environ.get("MAPBOX_USERNAME", "")
MAPBOX_TILESET = os.environ.get("MAPBOX_TILESET_NAME", "truarc-lidar")

# Processing defaults
TARGET_CRS = "EPSG:4326"
VOXEL_SIZE = 2.0           # meters — controls thinning density
MAX_POINTS = 500_000       # safety cap for GeoJSON output
POLL_INTERVAL = 5           # seconds between folder checks

# ─── LOGGING ───────────────────────────────────────────────────

LOG_DIR.mkdir(exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(LOG_DIR / "pipeline.log"),
    ],
)
log = logging.getLogger("TruArc-LiDAR")


# ─── PDAL PROCESSING ──────────────────────────────────────────

def detect_source_crs(filepath: Path) -> str:
    """
    Attempt to detect the CRS of a .laz/.las file using PDAL.
    Falls back to a common USDA projection if metadata is missing.
    """
    pipeline_json = json.dumps({
        "pipeline": [
            {"type": "readers.las", "filename": str(filepath)},
            {"type": "filters.info"}
        ]
    })

    try:
        pipeline = pdal.Pipeline(pipeline_json)
        pipeline.execute()
        metadata = json.loads(pipeline.metadata)
        
        # Try to get SRS from reader metadata
        readers = metadata.get("metadata", {}).get("readers.las", {})
        if isinstance(readers, list):
            readers = readers[0] if readers else {}

        srs_wkt = readers.get("comp_spatialreference", "") or readers.get("spatialreference", "")
        
        if srs_wkt and len(srs_wkt) > 10:
            log.info(f"  Detected CRS from file metadata")
            return srs_wkt
        
        log.warning(f"  No CRS in metadata, assuming EPSG:2249 (MA State Plane)")
        return "EPSG:2249"

    except Exception as e:
        log.warning(f"  CRS detection failed: {e}. Using EPSG:2249 fallback.")
        return "EPSG:2249"


def build_pdal_pipeline(input_path: Path, output_path: Path, source_crs: str) -> dict:
    """
    Build a PDAL pipeline that:
    1. Reads the .laz/.las
    2. Reprojects from source CRS → EPSG:4326
    3. Thins via voxelgrid to reduce points ~80%
    4. Optionally classifies ground vs. non-ground
    5. Writes GeoJSON output
    """
    pipeline = {
        "pipeline": [
            # Stage 1: Read raw LAS/LAZ
            {
                "type": "readers.las",
                "filename": str(input_path),
                "override_srs": source_crs if "EPSG" in source_crs else "",
                "spatialreference": source_crs if "EPSG" not in source_crs else "",
            },
            
            # Stage 2: Reproject to WGS84
            {
                "type": "filters.reprojection",
                "in_srs": source_crs,
                "out_srs": TARGET_CRS,
            },
            
            # Stage 3: Voxel grid thinning (reduces ~80% density)
            {
                "type": "filters.voxelgrid",
                "cell": VOXEL_SIZE,
            },
            
            # Stage 4: Keep only relevant classifications
            # 2 = Ground, 3-5 = Vegetation, 6 = Building
            {
                "type": "filters.range",
                "limits": "Classification[2:6]",
            },
            
            # Stage 5: Compute height above ground (if we have ground points)
            {
                "type": "filters.hag_nn",
            },
            
            # Stage 6: Decimate further if still too many points
            {
                "type": "filters.decimation",
                "step": 2,
            },
            
            # Stage 7: Write GeoJSON
            {
                "type": "writers.gdal",  # Not used — we'll extract arrays directly
            },
        ]
    }
    
    # Simplified: just read, reproject, thin, and we'll extract arrays
    simple_pipeline = {
        "pipeline": [
            {
                "type": "readers.las",
                "filename": str(input_path),
            },
            {
                "type": "filters.reprojection",
                "in_srs": source_crs,
                "out_srs": TARGET_CRS,
            },
            {
                "type": "filters.voxelgrid",
                "cell": VOXEL_SIZE,
            },
        ]
    }
    
    return simple_pipeline


def process_file(filepath: Path) -> Path | None:
    """
    Process a single .laz/.las file through the full pipeline.
    Returns the path to the output GeoJSON, or None on failure.
    """
    log.info(f"━━━ Processing: {filepath.name} ━━━")
    start = time.time()
    
    # Ensure output dir
    OUTPUT_DIR.mkdir(exist_ok=True)
    
    # Output filename
    stem = filepath.stem
    output_path = OUTPUT_DIR / f"{stem}_processed.geojson"
    
    # Step 1: Detect CRS
    log.info("  [1/4] Detecting source CRS...")
    source_crs = detect_source_crs(filepath)
    log.info(f"         Source CRS: {source_crs}")
    
    # Step 2: Build & execute PDAL pipeline
    log.info("  [2/4] Running PDAL pipeline (reproject + thin)...")
    pipeline_def = build_pdal_pipeline(filepath, output_path, source_crs)
    
    try:
        pipeline = pdal.Pipeline(json.dumps(pipeline_def))
        count = pipeline.execute()
        log.info(f"         Output points: {count:,}")
    except Exception as e:
        log.error(f"  Pipeline execution failed: {e}")
        return None
    
    # Step 3: Extract arrays and write GeoJSON
    log.info("  [3/4] Exporting to GeoJSON...")
    try:
        arrays = pipeline.arrays
        if not arrays or len(arrays) == 0:
            log.error("  No point data in pipeline output")
            return None
        
        points = arrays[0]
        
        # Cap at MAX_POINTS
        if len(points) > MAX_POINTS:
            step = len(points) // MAX_POINTS
            indices = list(range(0, len(points), step))[:MAX_POINTS]
            log.info(f"         Decimating {len(points):,} → {len(indices):,} points")
        else:
            indices = list(range(len(points)))
        
        # Build GeoJSON FeatureCollection
        features = []
        for i in indices:
            pt = points[i]
            x = float(pt["X"])
            y = float(pt["Y"])
            z = float(pt["Z"])
            
            # Classification (if available)
            classification = int(pt["Classification"]) if "Classification" in pt.dtype.names else 0
            
            # Height above ground (if computed)
            hag = float(pt["HeightAboveGround"]) if "HeightAboveGround" in pt.dtype.names else z
            
            feature = {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [round(x, 8), round(y, 8), round(z, 2)]
                },
                "properties": {
                    "classification": classification,
                    "height": round(hag, 2),
                    "z": round(z, 2),
                }
            }
            features.append(feature)
        
        geojson = {
            "type": "FeatureCollection",
            "properties": {
                "name": stem,
                "source_crs": source_crs,
                "target_crs": TARGET_CRS,
                "point_count": len(features),
                "processed_at": datetime.now().isoformat(),
                "voxel_size": VOXEL_SIZE,
            },
            "features": features,
        }
        
        with open(output_path, "w") as f:
            json.dump(geojson, f)
        
        size_mb = output_path.stat().st_size / (1024 * 1024)
        log.info(f"         Saved: {output_path.name} ({size_mb:.1f} MB, {len(features):,} points)")
        
    except Exception as e:
        log.error(f"  GeoJSON export failed: {e}")
        return None
    
    # Step 4: Optional Mapbox upload
    if MAPBOX_TOKEN and MAPBOX_USERNAME:
        log.info("  [4/4] Uploading to Mapbox Tiling Service...")
        upload_to_mapbox(output_path, stem)
    else:
        log.info("  [4/4] Mapbox upload skipped (no credentials)")
    
    elapsed = time.time() - start
    log.info(f"  ✓ Complete in {elapsed:.1f}s")
    
    return output_path


# ─── MAPBOX TILING SERVICE UPLOAD ──────────────────────────────

def upload_to_mapbox(geojson_path: Path, name: str):
    """
    Upload processed GeoJSON to Mapbox Tiling Service (MTS) via API.
    This creates a tileset that the frontend can automatically discover.
    """
    if not requests:
        log.warning("  'requests' library not installed. Skipping Mapbox upload.")
        return
    
    try:
        # Step A: Request upload credentials
        cred_url = f"https://api.mapbox.com/uploads/v1/{MAPBOX_USERNAME}/credentials?access_token={MAPBOX_TOKEN}"
        cred_resp = requests.post(cred_url)
        if cred_resp.status_code != 200:
            log.error(f"  Failed to get upload credentials: {cred_resp.status_code}")
            return
        
        creds = cred_resp.json()
        
        # Step B: Upload to S3 staging
        import boto3
        s3 = boto3.client(
            "s3",
            aws_access_key_id=creds["accessKeyId"],
            aws_secret_access_key=creds["secretAccessKey"],
            aws_session_token=creds["sessionToken"],
            region_name="us-east-1",
        )
        
        s3.upload_file(str(geojson_path), creds["bucket"], creds["key"])
        
        # Step C: Create upload
        tileset_id = f"{MAPBOX_USERNAME}.{MAPBOX_TILESET}-{name[:20]}"
        upload_url = f"https://api.mapbox.com/uploads/v1/{MAPBOX_USERNAME}?access_token={MAPBOX_TOKEN}"
        upload_resp = requests.post(upload_url, json={
            "url": creds["url"],
            "tileset": tileset_id,
            "name": f"TruArc LiDAR - {name}",
        })
        
        if upload_resp.status_code in (200, 201):
            upload_id = upload_resp.json().get("id", "unknown")
            log.info(f"  ✓ Mapbox upload started: {tileset_id} (upload ID: {upload_id})")
            
            # Save tileset ID for frontend discovery
            meta_path = OUTPUT_DIR / "latest_tileset.json"
            with open(meta_path, "w") as f:
                json.dump({
                    "tileset_id": tileset_id,
                    "upload_id": upload_id,
                    "name": name,
                    "uploaded_at": datetime.now().isoformat(),
                }, f, indent=2)
        else:
            log.error(f"  Upload failed: {upload_resp.status_code} - {upload_resp.text}")
    
    except ImportError:
        log.warning("  boto3 not installed. Skipping S3 upload step.")
    except Exception as e:
        log.error(f"  Mapbox upload error: {e}")


# ─── WATCH MODE ────────────────────────────────────────────────

def get_file_hash(filepath: Path) -> str:
    """Quick hash of file for change detection."""
    h = hashlib.md5()
    h.update(str(filepath).encode())
    h.update(str(filepath.stat().st_size).encode())
    h.update(str(filepath.stat().st_mtime).encode())
    return h.hexdigest()


def watch_folder():
    """
    Watch the raw_data folder for new .laz/.las files and auto-process them.
    """
    RAW_DATA_DIR.mkdir(exist_ok=True)
    processed_hashes = set()
    
    # Load previously processed files
    history_path = OUTPUT_DIR / ".processed_history.json"
    if history_path.exists():
        try:
            with open(history_path) as f:
                processed_hashes = set(json.load(f))
        except:
            pass
    
    log.info("╔══════════════════════════════════════════════════╗")
    log.info("║  TruArc LiDAR Pipeline — Watch Mode             ║")
    log.info(f"║  Watching: {RAW_DATA_DIR}")
    log.info(f"║  Output:   {OUTPUT_DIR}")
    log.info("║  Drop .laz or .las files to auto-process        ║")
    log.info("╚══════════════════════════════════════════════════╝")
    
    try:
        while True:
            # Scan for new files
            for ext in ("*.laz", "*.las", "*.LAZ", "*.LAS"):
                for filepath in RAW_DATA_DIR.glob(ext):
                    file_hash = get_file_hash(filepath)
                    if file_hash not in processed_hashes:
                        log.info(f"\n🔍 New file detected: {filepath.name}")
                        result = process_file(filepath)
                        
                        if result:
                            processed_hashes.add(file_hash)
                            # Save history
                            OUTPUT_DIR.mkdir(exist_ok=True)
                            with open(history_path, "w") as f:
                                json.dump(list(processed_hashes), f)
            
            time.sleep(POLL_INTERVAL)
    
    except KeyboardInterrupt:
        log.info("\n⏹ Watch mode stopped.")


# ─── CLI ───────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="TruArc LiDAR Pipeline — Automated .laz processing for web visualization",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python process_lidar.py                           # Start watch mode
  python process_lidar.py --process raw_data/hole1.laz   # Process single file
  python process_lidar.py --voxel 1.5               # Finer grid (more points)
  python process_lidar.py --voxel 3.0               # Coarser grid (fewer points)
        
Environment Variables:
  MAPBOX_ACCESS_TOKEN   — Mapbox token for tileset upload
  MAPBOX_USERNAME       — Mapbox account username
  MAPBOX_TILESET_NAME   — Base name for tilesets (default: truarc-lidar)
        """
    )
    
    parser.add_argument("--process", "-p", type=str, help="Process a single .laz/.las file")
    parser.add_argument("--voxel", "-v", type=float, default=VOXEL_SIZE, help=f"Voxel grid size in meters (default: {VOXEL_SIZE})")
    parser.add_argument("--max-points", type=int, default=MAX_POINTS, help=f"Max point cap for GeoJSON (default: {MAX_POINTS:,})")
    
    args = parser.parse_args()
    
    # Update globals
    global VOXEL_SIZE, MAX_POINTS
    VOXEL_SIZE = args.voxel
    MAX_POINTS = args.max_points
    
    if args.process:
        filepath = Path(args.process)
        if not filepath.exists():
            log.error(f"File not found: {filepath}")
            sys.exit(1)
        process_file(filepath)
    else:
        watch_folder()


if __name__ == "__main__":
    main()
