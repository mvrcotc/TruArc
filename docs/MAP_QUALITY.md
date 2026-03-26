# High-Quality Map & 3D Visualization Guide

TruArc uses Mapbox for 3D terrain and satellite imagery. Here's how to get the best possible visualization of trees and objects on your course.

## Current Setup (Upgraded)

The app now uses **Mapbox Standard Satellite** style, which provides:
- **50cm resolution** satellite imagery (Maxar Vivid) in many areas
- **3D terrain** with 2x exaggeration for dramatic elevation
- **3D buildings** where data is available
- **Dynamic lighting** and sky atmosphere

## Mapbox Style Options

If you need to switch styles, edit `src/components/MapCanvas.jsx`:

| Style | Best For | Resolution |
|-------|----------|------------|
| `mapbox://styles/mapbox/standard-satellite` | Satellite + 3D (current) | Up to 50cm |
| `mapbox://styles/mapbox/satellite-streets-v12` | Satellite + labels | High |
| `mapbox://styles/mapbox/satellite-v9` | Pure satellite | High |
| `mapbox://styles/mapbox/outdoors-v12` | Terrain/topographic | N/A |

## Getting 3D Trees & Objects

### Option 1: Mapbox Standard (Built-in)
Mapbox Standard Satellite includes 3D trees and landmarks where data exists. Coverage varies by region.

### Option 2: LiDAR Data (Best Accuracy)
For course-specific 3D trees and terrain:

1. **Source LiDAR data** for your course:
   - [USGS 3DEP](https://www.usgs.gov/3d-elevation) - Free US elevation data
   - State/county GIS portals
   - Commercial: Nearmap, Vexcel, Hexagon

2. **Process with TruArc's pipeline**:
   ```bash
   # Place .laz or .las files in raw_data/
   python process_lidar.py --process raw_data/your_course.laz
   ```

3. **Upload to Mapbox** (optional):
   ```bash
   export MAPBOX_ACCESS_TOKEN=your_secret_token
   export MAPBOX_USERNAME=your_username
   python process_lidar.py --process raw_data/your_course.laz
   ```

4. **Activate in the app**:
   - Copy `processed_data/your_course_processed.geojson` to `public/lidar/overlay.geojson`
   - Open **Calibrate** mode (C) and toggle **Show LiDAR overlay** on
   - Use the arrow buttons to nudge alignment if needed

### Option 3: Custom GeoJSON Overlays
Add tree positions, obstacles, or fairway boundaries as GeoJSON layers. See `src/data/courses.js` for the course data structure.

## Terrain Exaggeration

Adjust in `MapCanvas.jsx`:
```javascript
map.setTerrain({ source: 'mapbox-dem', exaggeration: 2.0 });
// Try 1.5–3.0 for different emphasis levels
```

## Mapbox Token Requirements

- **Standard Satellite** requires a Mapbox account with GL JS v3 access
- Free tier: 50,000 map loads/month
- Sign up: https://account.mapbox.com/

## Troubleshooting

- **Black/gray map**: Check `VITE_MAPBOX_TOKEN` in `.env`
- **No 3D terrain**: Ensure map fully loads before adding terrain source
- **Low resolution**: Zoom in (17–20) for best detail; coverage varies by location
