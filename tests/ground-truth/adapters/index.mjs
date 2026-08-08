/**
 * Engine selection for the ground-truth harness.
 *
 *   TRUARC_ENGINE=sixdof   (default) — the Section 1 6-DOF engine
 *   TRUARC_ENGINE=current            — the legacy pseudo-force engine,
 *                                      kept only for baseline comparison
 *                                      until Section 1 ships.
 */

import { runEnvelope as runSixDof } from './sixDof.mjs';
import { runEnvelope as runCurrent } from './currentEngine.mjs';

const ENGINE = process.env.TRUARC_ENGINE ?? 'sixdof';

export const engineName = ENGINE;
export const runEnvelope = ENGINE === 'current' ? runCurrent : runSixDof;
