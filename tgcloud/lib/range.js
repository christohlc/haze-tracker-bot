// @ts-check
// The next few hours as a likely range: the island-wide 1-hour PSI now, widened by how much it
// moved over the same number of hours in the past two weeks. Our calculation, not a model and not
// NEA's. Pure (no sdk) so tests and the Mini App can load it.

import { pm25ToPsi } from './psi.js';
import { islandMean } from './snapshot.js';
import { toSgtIso, unixHour } from './time.js';

/** Hours of readings the range is worked out from. */
export const HISTORY_HOURS = 14 * 24;
const AHEAD = [1, 3, 6];
// With fewer hours of readings (three days) the range would be a guess.
const MIN_HOURS = 72;
// A latest reading older than this isn't "now" any more (NEA publishes hourly).
const STALE_H = 3;

/** How often it held, from `node scripts/range-backtest.mjs` on NEA's readings for 2022–2026. */
export const RANGE_RECORD = 'In four years of NEA readings, the actual value landed in this range about 8 times in 10.';

/** @typedef {{ now: number, steps: Array<{ h: number, t: string, lo: number, hi: number }> }} Range */

/** @param {number[]} sorted @param {number} p 0–1 */
const quantile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))))];

/**
 * 80% range for 1, 3 and 6 hours ahead, or null without enough recent readings. Moves are ratios
 * of PM2.5, so a quiet day at 30 and a hazy one at 150 widen in proportion.
 * @param {Array<{ timestamp: string, readings: Record<string, number> }>} rows oldest first
 * @param {number} [nowMs]
 * @returns {Range | null}
 */
export function nextHours(rows, nowMs = Date.now()) {
  /** @type {Map<number, number>} */
  const byHour = new Map();
  for (const r of rows) {
    const pm = islandMean(r.readings);
    if (pm != null) byHour.set(unixHour(r.timestamp), Math.max(pm, 1));
  }
  const t0 = Math.max(...byHour.keys());
  const pmNow = byHour.get(t0);
  if (pmNow == null || byHour.size < MIN_HOURS || nowMs / 3_600_000 - t0 > STALE_H) return null;
  const psi = (/** @type {number} */ move) => /** @type {number} */ (pm25ToPsi(pmNow * Math.exp(move)));
  const steps = [];
  for (const h of AHEAD) {
    const moves = [];
    for (const [t, pm] of byHour) {
      const later = byHour.get(t + h);
      if (later != null) moves.push(Math.log(later / pm));
    }
    if (!moves.length) return null;
    moves.sort((a, b) => a - b);
    steps.push({ h, t: toSgtIso((t0 + h) * 3600), lo: psi(quantile(moves, 0.1)), hi: psi(quantile(moves, 0.9)) });
  }
  return { now: /** @type {number} */ (pm25ToPsi(pmNow)), steps };
}
