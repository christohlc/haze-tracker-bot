// @ts-check
// What's ahead: NEA's 24-hr PSI forecast when it has issued one, and our range for the next few hours.

import { getOutlook } from './outlook.js';
import { currentRange, HISTORY_HOURS, latestRange } from './range.js';
import { getState, recentReadings, setState } from './store.js';

/** @typedef {{ outlook: import('./outlook-parse.js').Outlook | null, range: import('./range.js').Range | null }} Ahead */

/**
 * `refreshed` is the getSnapshot() call in flight: the range waits for it (a refetch stores a new
 * one), while NEA's outlook is fetched alongside it.
 * @param {Promise<unknown>} refreshed
 * @param {number} [deadline] passed to getOutlook
 * @returns {Promise<Ahead>}
 */
export async function getAhead(refreshed, deadline) {
  const [latest, outlook] = await Promise.all([refreshed.then(storedRange), getOutlook(deadline)]);
  return { outlook, range: currentRange(latest) };
}

/**
 * Work the range out from two weeks of readings and store it in state('range'), so a request reads
 * one row instead of 336. `rows` if the caller has just read them (the last HISTORY_HOURS).
 * @param {Array<{ timestamp: string, readings: Record<string, number> }>} [rows]
 */
export async function saveRange(rows) {
  const latest = latestRange(rows ?? (await recentReadings(HISTORY_HOURS)));
  await setState('range', latest);
  return latest;
}

/** The stored range, worked out now if there's none yet (before the first refresh stores one). */
async function storedRange() {
  const row = await getState('range');
  return row ? row.value : saveRange();
}
