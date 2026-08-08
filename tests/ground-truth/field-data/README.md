# Field Data

Measured throws (TechDisc sessions, field measurements with a rangefinder) go
here as they're collected, one JSON file per session or per disc:

```json
{
  "disc": "Destroyer",
  "releaseSpeedMph": 62,
  "spinRpm": 1250,
  "noseAngleDeg": 2,
  "hyzerDeg": 0,
  "measuredDistanceFt": 371,
  "lateralFinishFt": -28,
  "notes": "Calm wind, flat field, 3rd throw of session",
  "date": "2026-08-09"
}
```

The harness (once it reads this directory — see `FIELD_DATA_DIR` in
`tests/ground-truth/flight-envelopes.mjs`) treats each row as an additional
absolute envelope with ±10% tolerance, and field data takes precedence over
the synthesized targets in `flight-envelopes.mjs` when they conflict.

No files here yet — this is the intake point for tightening the synthesized
targets with real throws.
