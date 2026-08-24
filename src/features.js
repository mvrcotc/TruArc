/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  What TruArc is willing to tell a player                         ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * One place, deliberately tiny and greppable, deciding which features
 * reach the UI. Not a config file and not an experiment framework: a
 * record of which parts of this app are currently good enough to be
 * believed.
 *
 * ── WHY ANYTHING IS OFF ──────────────────────────────────────────────
 * A tool used to pick real lines at real holes trades on being right.
 * One confidently wrong number does not cost you that number — it costs
 * you the reader's trust in every number beside it, including the ones
 * that were correct. Showing a flight path that is 30 % short devalues
 * the measured terrain reading sitting next to it.
 *
 * So the rule here is simple: if the app cannot say how wrong a number
 * might be, it does not show the number.
 */

/**
 * Simulated disc flight — throw mode, the flight path on the map, and
 * the per-disc flight chart.
 *
 * OFF. The 6-DOF engine clears **4 of 23** absolute ground-truth
 * envelopes (docs/ACCURACY_ROADMAP.md). Concretely, as measured in this
 * repo:
 *
 *   • distances run 20–38 % short, worst at low arm speeds
 *     (leopard-rec −38 %, destroyer-rec −28 %)
 *   • stable discs finish far left of where they should
 *     (a Teebird, the canonical straight fairway driver, ~60 ft left)
 *   • the disc ladder collapses — a Firebird and a Roc land 3 ft apart
 *   • no S-curve: a Destroyer renders as a pure hyzer disc, so the
 *     flight chart draws a Leopard and a Mamba identically
 *
 * ── THIS IS NOT A CODE-QUALITY JUDGEMENT ─────────────────────────────
 * The engine itself is sound. It passes 11/11 calibration-independent
 * invariants — frames, spin signs, timestep convergence, handedness
 * mirroring, no energy creation — and turn/fade emerge from gyroscopic
 * precession rather than being scripted. Nothing here is thrown away
 * and every test still runs in CI.
 *
 * What is missing is EVIDENCE. Every target the engine was fitted
 * against is expert judgement rather than measurement, and constraining
 * the coefficients to physically-legal lift showed the remaining error
 * is not in the coefficient mapping at all — it is in the release-speed
 * model or in the targets. Nothing in this repo can currently say which.
 *
 * ── HOW IT COMES BACK ────────────────────────────────────────────────
 * Measured throws in `tests/ground-truth/field-data/` (the loader is
 * built and wired; the directory is empty), then re-run
 * `npm run calibrate`. When the envelopes pass, flip this to `true`.
 * There is no other work to do — the UI is intact behind this flag.
 */
export const FLIGHT_SIM_ENABLED = false;

/**
 * Bag gap analysis (`src/bag/coverage.js`).
 *
 * OFF for the same reason, and it is worth naming the specific failure
 * because the module itself is fine: with the ladder collapsed, the
 * redundancy pass reports "Aviar is 100 % covered by Roc" — a putter
 * and a midrange as the same disc — and flags 8 of 8 discs in a normal
 * bag. Advice that confident and that wrong is worse than none.
 *
 * The GAP half becomes trustworthy sooner than the redundancy half,
 * because a player anchoring the chart with distances they actually
 * throw supplies the measurement the model lacks. Split this flag when
 * that lands rather than shipping both together.
 */
export const BAG_ANALYSIS_ENABLED = false;
