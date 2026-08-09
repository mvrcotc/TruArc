"""
TruArc LiDAR Pipeline — Segmentation Accuracy Measurement

Matches detected trees against known ground truth and reports the error
that actually matters downstream, rather than a single aggregate score:

  • detection rate / commission — is the tree there at all
  • position error             — Section 3 renders it in the wrong place
  • height & crown radius      — wrong size on screen, wrong gap width
  • crown base & profile       — whether a line UNDER the canopy exists
  • form accuracy              — conifer vs broadleaf silhouette

Matching is greedy from the tallest true tree down, pairing each with the
nearest unclaimed detection inside a height-scaled radius. Tallest-first
matters: on a real stand a big crown often hides a smaller neighbour, and
matching greedily from the top means a large tree cannot be "matched" by
a detection that plainly belongs to the small tree beside it.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np

from .schema import TreeRecord
from .synthetic import SyntheticTree


@dataclass
class ValidationReport:
    n_true: int = 0
    n_detected: int = 0
    n_matched: int = 0
    position_errors_m: list[float] = field(default_factory=list)
    height_errors_m: list[float] = field(default_factory=list)
    radius_errors_m: list[float] = field(default_factory=list)
    crown_base_errors_m: list[float] = field(default_factory=list)
    form_correct: int = 0

    @property
    def detection_rate(self) -> float:
        return self.n_matched / self.n_true if self.n_true else 0.0

    @property
    def commission_rate(self) -> float:
        """Fraction of detections that matched no real tree (false positives)."""
        return (self.n_detected - self.n_matched) / self.n_detected if self.n_detected else 0.0

    @property
    def form_accuracy(self) -> float:
        return self.form_correct / self.n_matched if self.n_matched else 0.0

    def rmse(self, values: list[float]) -> float:
        return math.sqrt(sum(v * v for v in values) / len(values)) if values else 0.0

    def summary(self) -> str:
        return (
            f"trees: {self.n_matched}/{self.n_true} detected "
            f"({self.detection_rate:.0%}), commission {self.commission_rate:.0%}\n"
            f"  position RMSE   {self.rmse(self.position_errors_m):5.2f} m\n"
            f"  height   RMSE   {self.rmse(self.height_errors_m):5.2f} m\n"
            f"  radius   RMSE   {self.rmse(self.radius_errors_m):5.2f} m\n"
            f"  crown base RMSE {self.rmse(self.crown_base_errors_m):5.2f} m\n"
            f"  form accuracy   {self.form_accuracy:.0%}"
        )


def validate(true_trees: list[SyntheticTree], detected: list[TreeRecord],
              to_working_crs=None, match_scale: float = 1.0) -> ValidationReport:
    """
    @param to_working_crs: callable (lng, lat) -> (x, y) converting a
        detection back into the synthetic cloud's metric frame. Omit when
        detections are already in that frame.
    @param match_scale: multiplies the per-tree match radius (which is
        max(3 m, crown radius)). Loosening it measures "did we find
        *something* here"; tightening it measures placement precision.
    """
    det_xy = []
    for rec in detected:
        if to_working_crs is not None:
            det_xy.append(to_working_crs(rec.lng, rec.lat))
        else:
            det_xy.append((rec.lng, rec.lat))

    report = ValidationReport(n_true=len(true_trees), n_detected=len(detected))
    claimed: set[int] = set()

    for tree in sorted(true_trees, key=lambda t: -t.height_m):
        radius = max(3.0, tree.crown_radius_m) * match_scale
        best_i, best_d = None, float("inf")
        for i, (dx, dy) in enumerate(det_xy):
            if i in claimed:
                continue
            d = math.hypot(dx - tree.x, dy - tree.y)
            if d < best_d and d <= radius:
                best_i, best_d = i, d
        if best_i is None:
            continue

        claimed.add(best_i)
        rec = detected[best_i]
        report.n_matched += 1
        report.position_errors_m.append(best_d)
        report.height_errors_m.append(rec.height_m - tree.height_m)
        report.radius_errors_m.append(rec.crown_radius_m - tree.crown_radius_m)
        report.crown_base_errors_m.append(rec.crown_base_m - tree.crown_base_m)
        if rec.form == tree.form:
            report.form_correct += 1

    return report
