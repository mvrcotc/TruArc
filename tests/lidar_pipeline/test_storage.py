import tempfile
import unittest
from pathlib import Path

from tools.lidar_pipeline.storage import plan_uploads, upload_course_outputs


class FakeBlob:
    def __init__(self, path, fail_on=None):
        self.path = path
        self.fail_on = fail_on
        self.uploaded_from = None
        self.content_type = None

    def upload_from_filename(self, local_path, content_type=None):
        if self.fail_on and self.path == self.fail_on:
            raise RuntimeError("simulated failure")
        self.uploaded_from = local_path
        self.content_type = content_type


class FakeBucket:
    def __init__(self, fail_on=None):
        self.fail_on = fail_on
        self.blobs = []

    def blob(self, path):
        b = FakeBlob(path, fail_on=self.fail_on)
        self.blobs.append(b)
        return b


class TestPlanUploads(unittest.TestCase):
    def test_only_plans_files_that_exist(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            (d / "maple-hill-gold_trees.json").write_text("{}")
            (d / "maple-hill-gold_dtm.json").write_text("{}")
            plan = plan_uploads("maple-hill-gold", d)
            keys = {p.key for p in plan}
            self.assertEqual(keys, {"trees", "dtm"})

    def test_storage_paths_are_namespaced_by_course(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            (d / "winthrop-gold_trees.json").write_text("{}")
            plan = plan_uploads("winthrop-gold", d)
            self.assertEqual(plan[0].storage_path, "lidar/winthrop-gold/winthrop-gold_trees.json")

    def test_empty_directory_plans_nothing(self):
        with tempfile.TemporaryDirectory() as d:
            plan = plan_uploads("nonexistent", d)
            self.assertEqual(plan, [])


class TestUploadCourseOutputs(unittest.TestCase):
    def _make_outputs(self, d: Path):
        (d / "maple-hill-gold_trees.json").write_text("{}")
        (d / "maple-hill-gold_voxels.bin").write_bytes(b"TVOX")
        (d / "maple-hill-gold_voxels_header.json").write_text("{}")
        (d / "maple-hill-gold_dtm.json").write_text("{}")
        (d / "maple-hill-gold_points.bin").write_bytes(b"TPTS")
        (d / "maple-hill-gold_points_header.json").write_text("{}")

    def test_all_succeed(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            self._make_outputs(d)
            uploaded = upload_course_outputs("maple-hill-gold", d, FakeBucket())
            self.assertEqual(len(uploaded), 6)

    def test_partial_failure_does_not_abort_remaining_uploads(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            self._make_outputs(d)
            fail_path = "lidar/maple-hill-gold/maple-hill-gold_voxels.bin"
            uploaded = upload_course_outputs("maple-hill-gold", d, FakeBucket(fail_on=fail_path))
            self.assertEqual(len(uploaded), 5)
            self.assertNotIn(fail_path, uploaded)

    def test_content_type_set_per_file(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            self._make_outputs(d)
            bucket = FakeBucket()
            upload_course_outputs("maple-hill-gold", d, bucket)
            content_types = {b.path: b.content_type for b in bucket.blobs}
            self.assertEqual(content_types["lidar/maple-hill-gold/maple-hill-gold_trees.json"], "application/json")
            self.assertEqual(content_types["lidar/maple-hill-gold/maple-hill-gold_voxels.bin"], "application/octet-stream")


if __name__ == "__main__":
    unittest.main()
