// @ts-check
// What's ahead: NEA's 24-hr PSI forecast when it has issued one, and our range for the next few hours.

import { getOutlook } from './outlook.js';
import { HISTORY_HOURS, nextHours } from './range.js';
import { recentReadings } from './store.js';

/** @typedef {{ outlook: import('./outlook-parse.js').Outlook | null, range: import('./range.js').Range | null }} Ahead */

/**
 * `refreshed` is the getSnapshot() call in flight: the range waits for its readings, while NEA's
 * outlook is fetched alongside it.
 * @param {Promise<unknown>} refreshed
 * @param {number} [deadline] passed to getOutlook
 * @returns {Promise<Ahead>}
 */
export function getAhead(refreshed, deadline) {
  return aheadFrom(refreshed.then(() => recentReadings(HISTORY_HOURS)), deadline);
}

/**
 * The same from readings already being read (the last HISTORY_HOURS, oldest first), for a caller
 * that needs them too. @param {Promise<Array<{ timestamp: string, readings: Record<string, number> }>>} readings
 * @param {number} [deadline] passed to getOutlook @returns {Promise<Ahead>}
 */
export async function aheadFrom(readings, deadline) {
  const [rows, outlook] = await Promise.all([readings, getOutlook(deadline)]);
  return { outlook, range: nextHours(rows) };
}
