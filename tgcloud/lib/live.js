// @ts-check
// Fetch live NEA data and build a snapshot.

import { getLatestPsi, getPm25History } from './nea.js';
import { buildSnapshot } from './snapshot.js';

export async function loadSnapshot() {
  const [history, psi] = await Promise.all([getPm25History(), getLatestPsi()]);
  return buildSnapshot(history, psi);
}
