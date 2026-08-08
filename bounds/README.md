# Course Boundary Overrides

By default, `tools/lidar_pipeline` derives a course's LiDAR coverage area
automatically from its tee/basket coordinates in `src/data/courses.js`,
expanded by a 45 m buffer (see `geometry.course_bbox_from_holes`).

For a course where that buffer is wrong — cuts off a real dogleg, or
pulls in an unrelated adjacent hole on a tightly-packed course — drop a
hand-drawn boundary here as `{course_id}.geojson`: a single `Polygon`
geometry (bare, or as a `Feature`, or the first Polygon feature of a
`FeatureCollection`). Its presence overrides the derived bounds entirely
for that course — see `geometry.resolve_course_bbox`.

No files here yet; every course currently uses the derived bounds.
