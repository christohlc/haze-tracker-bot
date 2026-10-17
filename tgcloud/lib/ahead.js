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
export async function getAhead(refreshed, deadline) {
  const [rows, outlook] = await Promise.all([refreshed.then(() => recentReadings(HISTORY_HOURS)), getOutlook(deadline)]);
  return { outlook, range: nextHours(rows) };
}
