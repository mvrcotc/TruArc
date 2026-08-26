# Field Data

Measured throws go here as `*.json`, one file per session. The loader is
`tests/ground-truth/field-data.mjs`; `npm run test:physics` and
`npm run calibrate` both pick them up automatically and say so on startup.

**There are no files here yet.** Every target the engine is fitted against is
currently expert judgement rather than measurement, which is the single largest
open problem in this project — see `docs/ACCURACY_ROADMAP.md`.

## Format

One row, or an array of rows:

```json
[
  {
    "disc": "Destroyer",
    "releaseSpeedMph": 62,
    "spinRpm": 1250,
    "noseAngleDeg": 2,
    "hyzerDeg": 0,
    "measuredDistanceFt": 371,
    "lateralFinishFt": -28,
    "windMph": 0,
    "windFromDeg": 0,
    "notes": "3rd throw of session, flat field",
    "date": "2026-08-09"
  }
]
```

| Field | Required | Notes |
|---|---|---|
| `disc` | ✅ | Name from `src/data/discs.js` (260 discs), or an inline `{name,speed,glide,turn,fade}` |
| `releaseSpeedMph` | ✅ | **The reason this format exists.** 10–90 |
| `measuredDistanceFt` | ✅ | 10–800 |
| `lateralFinishFt` | | Negative left, positive right. Omit if unmeasured |
| `spinRpm` | | Omitted → derived at 20 rpm/mph and flagged `spinAssumed` |
| `noseAngleDeg`, `hyzerDeg` | | Default 0 |
| `windMph`, `windFromDeg` | | Default calm |
| `supersedes` | | Envelope ids this row explicitly replaces |
| `notes`, `date` | | Free text |

## How rows are used

**Tolerance.** Distance becomes `measured ±10%` — roughly one player's
throw-to-throw spread, since a row is one sample of a distribution, not a
constant. Lateral gets ±10% *or* ±15 ft, whichever is wider: a percentage band
is meaningless near zero, where ±10% of a 2 ft finish would demand precision
nobody can measure.

**Precedence.** A row supersedes a synthesized envelope when it describes the
same throw — same mold, release speed within 8% of what that envelope assumes,
matching release angles, and both calm or both windy. The synthesized target is
then dropped entirely rather than patched, because it would otherwise keep
running at the tier's *assumed* release speed, and that assumption is exactly
what these rows exist to test. Comparatives referencing a dropped id are
remapped automatically.

**Validation is strict and loud.** A malformed row throws rather than being
skipped — a session you believe is loaded but isn't would not look like a bug,
it would look like a calibration result. Unit slips are caught explicitly
(km/h as mph, metres as feet).

## What one session would settle

`leopard-rec-flat` currently *assumes* a 34 mph release and *expects* 195–255 ft;
the engine produces 121 ft. Nothing in this repo can say whether the engine is
wrong or the target is. A handful of rows measuring what a real Leopard leaves
the hand at, next to where it actually lands, decides it — and that answer gates
the disc-recommendation feature in `src/bag/coverage.js`.

Six discs across the stability range, ten throws each, on a calm day.
A launch monitor (release speed *and* spin) is worth substantially more than a
rangefinder session, because a spin-less row falls back to an assumption that
disagrees with the tier model by ~15% on slower discs.
