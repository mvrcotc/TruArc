# LiDAR Workflow for TruArc

**LidarCropper** is a separate app for clipping USGS LiDAR to course bounds.  
TruArc will later load cropped data from a database. This doc describes the current flow and future DB integration.

---

## LidarCropper (Standalone App)

Location: `../LidarCropper/` (sibling to TruArc)

### Setup

```bash
cd ../LidarCropper
conda install -c conda-forge pdal python-pdal
pip install -r requirements.txt
```

### Usage

```bash
# Drop USGS .laz into input/
# Define bounds in bounds/course.json or pass bbox

python -m cropper.extract -i input/maple_hill.laz \
  -b bounds/maple_hill.json \
  -p maple-hill-gold
```

### Output

- `output/maple-hill-gold_trees.geojson` — Vegetation with heightM
- `output/maple-hill-gold_terrain.geojson` — Ground points

---

## TruArc Integration (Current)

- TruArc loads obstacles from `public/lidar/{courseId}_trees.geojson` when a course is selected
- Copy LidarCropper output into `TruArc/public/lidar/` for local use

---

## TruArc + Database (Planned)

- Cropped courses will be dropped into a database
- TruArc will query the database for course LiDAR when a course is selected
- No more `public/lidar/` — data comes from the backend
