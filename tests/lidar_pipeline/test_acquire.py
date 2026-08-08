import tempfile
import unittest
from pathlib import Path

from tools.lidar_pipeline.geometry import BBox
from tools.lidar_pipeline.acquire import search_products, download_products, acquire_course_tiles, cache_manifest_hash

BBOX = BBox(-71.90, 42.274, -71.886, 42.280)


class FakeResponse:
    def __init__(self, json_data=None, content_chunks=None, status=200):
        self._json = json_data
        self._chunks = content_chunks or []
        self.status_code = status

    def json(self):
        return self._json

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")

    def iter_content(self, chunk_size=1 << 20):
        yield from self._chunks


class FakeSession:
    """Records calls so tests can assert exact request construction."""
    def __init__(self, get_response):
        self.get_response = get_response
        self.calls = []

    def get(self, url, params=None, timeout=None, stream=False):
        self.calls.append({"url": url, "params": params, "stream": stream})
        return self.get_response


# Fixture shaped exactly like the TNM Access API's documented response schema.
TNM_FIXTURE = {
    "total": 2,
    "items": [
        {
            "title": "USGS LPC MA CentralEastern 2021 B21",
            "downloadURL": "https://prd-tnm.s3.amazonaws.com/StagedProducts/Elevation/LPC/Projects/MA/tile_A.laz",
            "sizeInBytes": 123456789,
            "format": "LAZ",
            "publicationDate": "2022-03-01",
        },
        {
            "title": "USGS LPC MA CentralEastern 2021 B22",
            "downloadURL": "https://prd-tnm.s3.amazonaws.com/StagedProducts/Elevation/LPC/Projects/MA/tile_B.laz",
            "sizeInBytes": 98765432,
            "format": "LAZ",
            "publicationDate": "2022-03-01",
        },
    ],
}


class TestSearchProducts(unittest.TestCase):
    def test_parses_documented_response_shape(self):
        fake_get = FakeSession(FakeResponse(json_data=TNM_FIXTURE)).get
        products = search_products(BBOX, http_get=fake_get)
        self.assertEqual(len(products), 2)
        self.assertEqual(products[0].filename, "tile_A.laz")
        self.assertEqual(products[0].size_bytes, 123456789)

    def test_request_uses_correct_bbox_and_params(self):
        session = FakeSession(FakeResponse(json_data=TNM_FIXTURE))
        search_products(BBOX, http_get=session.get)
        call = session.calls[0]
        self.assertEqual(call["url"], "https://tnmaccess.nationalmap.gov/api/v1/products")
        self.assertEqual(call["params"]["bbox"], BBOX.as_tnm_bbox())
        self.assertEqual(call["params"]["datasets"], "Lidar Point Cloud (LPC)")
        self.assertEqual(call["params"]["prodFormats"], "LAZ")

    def test_empty_results_handled_gracefully(self):
        fake_get = FakeSession(FakeResponse(json_data={"total": 0, "items": []})).get
        products = search_products(BBOX, http_get=fake_get)
        self.assertEqual(products, [])

    def test_items_missing_download_url_are_skipped(self):
        data = {"items": [{"title": "no url"}, TNM_FIXTURE["items"][0]]}
        fake_get = FakeSession(FakeResponse(json_data=data)).get
        products = search_products(BBOX, http_get=fake_get)
        self.assertEqual(len(products), 1)

    def test_raises_on_http_error(self):
        fake_get = FakeSession(FakeResponse(status=500)).get
        with self.assertRaises(RuntimeError):
            search_products(BBOX, http_get=fake_get)


class TestDownloadProducts(unittest.TestCase):
    def test_downloads_and_caches(self):
        session = FakeSession(FakeResponse(content_chunks=[b"laz-bytes-here"]))
        fake_get = session.get
        products = search_products(BBOX, http_get=FakeSession(FakeResponse(json_data=TNM_FIXTURE)).get)

        with tempfile.TemporaryDirectory() as d:
            paths = download_products(products, d, http_get=fake_get)
            self.assertEqual(len(paths), 2)
            for p in paths:
                self.assertTrue(p.exists())
                self.assertEqual(p.read_bytes(), b"laz-bytes-here")

    def test_skips_redownload_when_cached_and_size_matches(self):
        with tempfile.TemporaryDirectory() as d:
            cached_path = Path(d) / "tile_A.laz"
            content = b"cached-content"
            cached_path.write_bytes(content)

            products = search_products(BBOX, http_get=FakeSession(FakeResponse(json_data=TNM_FIXTURE)).get)
            # Patch product size to match our small cached file for this test
            product = products[0]
            object.__setattr__(product, "size_bytes", len(content))

            session = FakeSession(FakeResponse(content_chunks=[b"SHOULD-NOT-BE-WRITTEN"]))
            paths = download_products([product], d, http_get=session.get)

            self.assertEqual(paths[0].read_bytes(), b"cached-content")
            self.assertEqual(len(session.calls), 0, "should not have re-downloaded a cached, size-matching file")


class TestAcquireCourseTiles(unittest.TestCase):
    def test_end_to_end_with_fakes(self):
        class RoutedSession:
            def __init__(self):
                self.calls = []

            def get(self, url, params=None, timeout=None, stream=False):
                self.calls.append(url)
                if "tnmaccess" in url:
                    return FakeResponse(json_data=TNM_FIXTURE)
                return FakeResponse(content_chunks=[b"fake-laz-data"])

        session = RoutedSession()
        with tempfile.TemporaryDirectory() as d:
            paths = acquire_course_tiles(BBOX, d, http_get=session.get)
        self.assertEqual(len(paths), 2)
        self.assertEqual(len(session.calls), 3)  # 1 search + 2 downloads


class TestCacheManifestHash(unittest.TestCase):
    def test_stable_across_reordering(self):
        with tempfile.TemporaryDirectory() as d:
            a = Path(d) / "a.laz"
            b = Path(d) / "b.laz"
            a.write_bytes(b"aaa")
            b.write_bytes(b"bbbbb")
            h1 = cache_manifest_hash([a, b])
            h2 = cache_manifest_hash([b, a])
            self.assertEqual(h1, h2)

    def test_changes_when_content_size_changes(self):
        with tempfile.TemporaryDirectory() as d:
            a = Path(d) / "a.laz"
            a.write_bytes(b"aaa")
            h1 = cache_manifest_hash([a])
            a.write_bytes(b"aaaaaaaaaa")
            h2 = cache_manifest_hash([a])
            self.assertNotEqual(h1, h2)


if __name__ == "__main__":
    unittest.main()
