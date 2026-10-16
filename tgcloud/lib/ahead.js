// @ts-check
// What's ahead: NEA's 24-hr PSI forecast when it has issued one, and our range for the next few hours.

import { getOutlook } from './outlook.js';
import { nextHours, RANGE_HOURS } from './range.js';
import { recentReadings } from './store.js';

/** @typedef {{ outlook: import('./outlook-parse.js').Outlook | null, range: import('./range.js').Range | null }} Ahead */

/** Also returns the readings it read, oldest first, so the dashboard needn't read them again. */
export async function getAhead() {
  const [rows, outlook] = await Promise.all([recentReadings(RANGE_HOURS), getOutlook()]);
  /** @type {Ahead} */
  const ahead = { outlook, range: nextHours(rows) };
  return { rows, ahead };
}
