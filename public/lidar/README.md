# LiDAR Overlay

Place your processed LiDAR GeoJSON here to display it on the map.

## Setup

1. **Process your LiDAR data** with the pipeline:
   ```bash
   python process_lidar.py --process raw_data/your_course.laz
   ```

2. **Copy the output** to this folder:
   ```bash
   cp processed_data/your_course_processed.geojson public/lidar/overlay.geojson
   ```

3. **Activate in the app**: Open **Calibrate** mode (C) and toggle **Show LiDAR overlay** on.

4. **Align if needed**: Use the arrow buttons to nudge the overlay to match satellite imagery.
