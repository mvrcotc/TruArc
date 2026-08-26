"""
TruArc LiDAR Pipeline — USGS 3DEP Acquisition (Section 2, step 1)

Fetches LAZ tiles covering a course's bounds automatically instead of
requiring manual download-and-drop into raw_data/, via the USGS "The
National Map" (TNM) Access API:

    GET https://tnmaccess.nationalmap.gov/api/v1/products
        ?bbox=minLng,minLat,maxLng,maxLat
        &datasets=Lidar Point Cloud (LPC)
        &prodFormats=LAZ
        &outputFormat=JSON

This is the officially documented, stable USGS product-search endpoint
(as opposed to hand-rolling an Entwine/EPT catalog lookup, which would
need PDAL's `readers.ept` and a maintained index of EPT resource
boundaries — a reasonable future optimization to stream just the
windowed bbox instead of downloading whole tiles, noted below, but not
needed to get an automated pipeline working). A typical disc golf
course footprint (40-80 acres) is covered by 1-4 USGS LPC tiles (each
usually ~1 mi²).

NOTE ON THIS SESSION'S VERIFICATION: this environment's outbound network
is allowlisted to npm/PyPI/Anthropic only — tnmaccess.nationalmap.gov is
unreachable here, so the live API call itself could not be exercised
end-to-end. What IS verified (see tests/lidar_pipeline/test_acquire.py):
request construction (bbox format, params) and response parsing against
a fixture built from the TNM API's documented JSON schema, plus the
caching logic. Run `python -m tools.lidar_pipeline.pipeline` in an
environment with real network access to confirm the live call — this is
the same category of gap as Section 1's missing Mapbox token.
"""
from __future__ import annotations

import hashlib
import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

from .geometry import BBox

log = logging.getLogger("truarc.lidar.acquire")

TNM_PRODUCTS_URL = "https://tnmaccess.nationalmap.gov/api/v1/products"
DEFAULT_DATASET = "Lidar Point Cloud (LPC)"


@dataclass(frozen=True)
class LazProduct:
    title: str
    download_url: str
    size_bytes: int
    format: str
    publication_date: str | None = None

    @property
    def filename(self) -> str:
        # downloadURL's basename, stable across requests — used as the
        # cache key so re-running acquisition is a no-op once cached.
        return self.download_url.rstrip("/").rsplit("/", 1)[-1]


def search_products(bbox: BBox, dataset: str = DEFAULT_DATASET, prod_formats: str = "LAZ",
                     http_get: Callable | None = None, max_results: int = 50) -> list[LazProduct]:
    """
    Query the TNM Access API for LAZ products covering `bbox`.

    `http_get` is injectable (defaults to `requests.get`) so this is
    testable without live network — tests pass a fake that returns a
    canned response shaped like the real API's documented JSON.
    """
    if http_get is None:
        import requests
        http_get = requests.get

    params = {
        "bbox": bbox.as_tnm_bbox(),
        "datasets": dataset,
        "prodFormats": prod_formats,
        "outputFormat": "JSON",
        "max": max_results,
    }
    resp = http_get(TNM_PRODUCTS_URL, params=params, timeout=30)
    resp.raise_for_status()
    data = resp.json()

    products = []
    for item in data.get("items", []):
        url = item.get("downloadURL")
        if not url:
            continue
        products.append(LazProduct(
            title=item.get("title", ""),
            download_url=url,
            size_bytes=int(item.get("sizeInBytes") or 0),
            format=item.get("format", ""),
            publication_date=item.get("publicationDate"),
        ))
    log.info("TNM search: %d product(s) for bbox=%s", len(products), bbox.as_tnm_bbox())
    return products


def download_products(products: list[LazProduct], cache_dir: Path | str,
                       http_get: Callable | None = None) -> list[Path]:
    """
    Download each product to `cache_dir`, skipping any file that already
    exists with a matching size (cheap, good-enough cache validation —
    USGS doesn't publish stable content hashes in the product listing).
    """
    if http_get is None:
        import requests
        http_get = requests.get

    cache_dir = Path(cache_dir)
    cache_dir.mkdir(parents=True, exist_ok=True)
    paths = []

    for product in products:
        dest = cache_dir / product.filename
        if dest.exists() and product.size_bytes and dest.stat().st_size == product.size_bytes:
            log.info("  cached: %s (%.1f MB)", dest.name, product.size_bytes / 1e6)
            paths.append(dest)
            continue

        log.info("  downloading: %s (%.1f MB)", product.filename, product.size_bytes / 1e6)
        resp = http_get(product.download_url, stream=True, timeout=120)
        resp.raise_for_status()
        tmp = dest.with_suffix(dest.suffix + ".part")
        with open(tmp, "wb") as f:
            for chunk in resp.iter_content(chunk_size=1 << 20):
                f.write(chunk)
        tmp.rename(dest)
        paths.append(dest)

    return paths


def acquire_course_tiles(bbox: BBox, cache_dir: Path | str, http_get: Callable | None = None) -> list[Path]:
    """End-to-end step 1: search + download, deduplicated and cached."""
    products = search_products(bbox, http_get=http_get)
    if not products:
        log.warning("No LiDAR products found for bbox=%s — course may be outside 3DEP coverage, "
                     "or coverage predates the LPC dataset (check tnmaccess.nationalmap.gov manually).",
                     bbox.as_tnm_bbox())
    return download_products(products, cache_dir, http_get=http_get)


def cache_manifest_hash(paths: list[Path]) -> str:
    """Stable hash of a set of input tiles, used by pipeline.py to decide
    whether downstream processing needs to re-run."""
    h = hashlib.sha256()
    for p in sorted(paths, key=lambda p: p.name):
        h.update(p.name.encode())
        h.update(str(p.stat().st_size).encode())
    return h.hexdigest()[:16]
