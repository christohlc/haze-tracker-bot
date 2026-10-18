// @ts-check
// What's ahead: NEA's 24-hr PSI forecast when it has issued one, and our range for the next few hours.

import { getOutlook, peekOutlook } from './outlook.js';
import { currentRange } from './range.js';
import { storedRange } from './refresh.js';

/** @typedef {{ outlook: import('./outlook-parse.js').Outlook | null, range: import('./range.js').Range | null }} Ahead */

/**
 * `refreshed` is the getSnapshot() call in flight: the range waits for it (a refetch stores a new
 * one), while NEA's outlook is fetched alongside it.
 * @param {Promise<unknown>} refreshed
 * @param {number} [deadline] passed to getOutlook
 * @returns {Promise<Ahead>}
 */
export async function getAhead(refreshed, deadline) {
  const [stored, outlook] = await Promise.all([refreshed.then(storedRange), getOutlook(deadline)]);
  return { outlook, range: currentRange(stored) };
}

/**
 * getAhead() without fetching NEA's forecast: the stored one, and `due` if getAhead() would fetch it.
 * @returns {Promise<{ ahead: Ahead, due: boolean }>}
 */
export async function peekAhead() {
  const [stored, { outlook, due }] = await Promise.all([storedRange(), peekOutlook()]);
  return { ahead: { outlook, range: currentRange(stored) }, due };
}
