"""
TruArc LiDAR Pipeline — Output Upload (Section 2, step 7)

Uploads a course's `{course}_trees.json`, `{course}_voxels.bin` (+
header), and `{course}_dtm.json` to Firebase Storage, replacing the
current `public/lidar/{courseId}_trees.geojson` static-file convention
(see docs/LIDAR_WORKFLOW.md's "TruArc + Database (Planned)" section —
this is that plan, implemented).

Split the same way as the PDAL-dependent modules: `plan_uploads()` is
pure and fully testable (given a directory and course id, which files
should upload to which storage paths); `upload_course_outputs()` does
the actual network calls via firebase-admin and cannot be exercised in
this sandbox (no credentials, and Firebase isn't network-reachable here
either). The upload function takes an injectable `bucket` so the upload
LOGIC (which files, what content-type, what happens on partial failure)
is still testable with a fake bucket — only the real firebase-admin
wiring itself is unverified.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

log = logging.getLogger("truarc.lidar.storage")

STORAGE_PREFIX = "lidar"  # gs://{bucket}/lidar/{course_id}/...

OUTPUT_FILES = {
    "trees": ("{course_id}_trees.json", "application/json"),
    "voxels_bin": ("{course_id}_voxels.bin", "application/octet-stream"),
    "voxels_header": ("{course_id}_voxels_header.json", "application/json"),
    "dtm": ("{course_id}_dtm.json", "application/json"),
    "points_bin": ("{course_id}_points.bin", "application/octet-stream"),
    "points_header": ("{course_id}_points_header.json", "application/json"),
}


@dataclass(frozen=True)
class PlannedUpload:
    key: str
    local_path: Path
    storage_path: str
    content_type: str


def plan_uploads(course_id: str, output_dir: Path | str) -> list[PlannedUpload]:
    """Which local files (if present) go to which Storage paths. Missing
    files are skipped rather than erroring — a course processed before
    Section 2 step 3 (segmentation) lands will have voxels/dtm but no
    trees.json yet, and that's a legitimate partial state, not a bug."""
    output_dir = Path(output_dir)
    plan = []
    for key, (name_tpl, content_type) in OUTPUT_FILES.items():
        name = name_tpl.format(course_id=course_id)
        local_path = output_dir / name
        if not local_path.exists():
            log.info("  skip (not generated yet): %s", name)
            continue
        plan.append(PlannedUpload(
            key=key,
            local_path=local_path,
            storage_path=f"{STORAGE_PREFIX}/{course_id}/{name}",
            content_type=content_type,
        ))
    return plan


class Bucket(Protocol):
    """Minimal interface this module needs from a storage bucket — matches
    the subset of google-cloud-storage's Bucket/Blob API firebase-admin
    exposes via `firebase_admin.storage.bucket()`, so the real bucket
    object satisfies this without adaptation."""
    def blob(self, path: str): ...


def upload_course_outputs(course_id: str, output_dir: Path | str, bucket: "Bucket") -> list[str]:
    """
    Upload every planned file for `course_id`. Returns the list of
    storage paths successfully uploaded. Continues past a single file's
    failure (logs and skips) rather than aborting the whole course —
    a partial upload is recoverable by re-running; losing progress on
    files that DID succeed is not.
    """
    uploaded = []
    for item in plan_uploads(course_id, output_dir):
        try:
            blob = bucket.blob(item.storage_path)
            blob.upload_from_filename(str(item.local_path), content_type=item.content_type)
            log.info("  uploaded: %s -> %s", item.local_path.name, item.storage_path)
            uploaded.append(item.storage_path)
        except Exception as e:
            log.error("  upload FAILED for %s: %s", item.local_path.name, e)
    return uploaded


def get_default_bucket():
    """
    Real firebase-admin wiring — untested in this sandbox (no
    credentials, no network to Firebase). Expects
    GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_SERVICE_ACCOUNT_JSON in
    the environment, matching standard firebase-admin initialization.
    """
    import firebase_admin
    from firebase_admin import credentials, storage
    import os

    if not firebase_admin._apps:
        cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
        cred = credentials.Certificate(cred_path) if cred_path else credentials.ApplicationDefault()
        bucket_name = os.environ.get("FIREBASE_STORAGE_BUCKET")
        firebase_admin.initialize_app(cred, {"storageBucket": bucket_name} if bucket_name else None)
    return storage.bucket()
