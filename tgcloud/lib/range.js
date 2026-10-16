// @ts-check
// The next few hours as a likely range: the island-wide 1-hour PSI now, widened by how much it
// moved over the same number of hours in the past two weeks. Our calculation, not a model and not
// NEA's. Pure (no sdk) so tests and the Mini App can load it.

import { pm25ToPsi } from './psi.js';
import { islandMean } from './snapshot.js';
import { toSgtIso, unixHour } from './time.js';

export const RANGE_HOURS = 14 * 24;
export const RANGE_STEPS = [1, 3, 6];
// Fewer past moves than this (about three days' worth) and the range would be a guess.
const MIN_MOVES = 72;

/** @typedef {{ issuedAt: string, now: number, steps: Array<{ h: number, t: string, lo: number, hi: number }> }} Range */

/** @param {number[]} sorted @param {number} p 0–1 */
const quantile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))))];

/**
 * 80% range for each of RANGE_STEPS hours ahead, or null without enough readings. Moves are
 * ratios of PM2.5, so a quiet day at 30 and a hazy one at 150 widen in proportion.
 * @param {Array<{ timestamp: string, readings: Record<string, number> }>} rows oldest first, last = now
 * @returns {Range | null}
 */
export function nextHours(rows) {
  /** @type {Map<number, number>} */
  const byHour = new Map();
  for (const r of rows) {
    const pm = islandMean(r.readings);
    if (pm != null) byHour.set(unixHour(r.timestamp), Math.max(pm, 1));
  }
  const last = rows.at(-1);
  const pmNow = last ? byHour.get(unixHour(last.timestamp)) : undefined;
  if (!last || pmNow == null) return null;
  const t0 = unixHour(last.timestamp);
  const steps = [];
  for (const h of RANGE_STEPS) {
    const moves = [];
    for (const [t, pm] of byHour) {
      const later = byHour.get(t + h);
      if (later != null) moves.push(Math.log(later / pm));
    }
    if (moves.length < MIN_MOVES) return null;
    moves.sort((a, b) => a - b);
    const psi = (/** @type {number} */ m) => /** @type {number} */ (pm25ToPsi(pmNow * Math.exp(m)));
    steps.push({ h, t: toSgtIso((t0 + h) * 3600), lo: psi(quantile(moves, 0.1)), hi: psi(quantile(moves, 0.9)) });
  }
  return { issuedAt: last.timestamp, now: /** @type {number} */ (pm25ToPsi(pmNow)), steps };
}
