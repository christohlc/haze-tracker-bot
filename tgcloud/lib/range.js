// @ts-check
// The next few hours as a likely range: the island-wide 1-hour PSI now, widened by how much it
// moved over the same number of hours in the past two weeks. Our calculation, not a model and not
// NEA's. Pure (no sdk) so tests and the Mini App can load it.

import { pm25ToPsi } from './psi.js';
import { islandMean } from './snapshot.js';
import { toSgtIso, unixHour } from './time.js';

/** Hours of readings the range is worked out from. */
export const HISTORY_HOURS = 14 * 24;
export const AHEAD = [1, 3, 6];
// With fewer hours of readings (three days) the range would be a guess.
const MIN_HOURS = 72;
// A latest reading older than this isn't "now" any more (NEA publishes hourly).
const STALE_H = 3;

/** How often it held, from `node scripts/range-backtest.mjs` on NEA's readings for 2022–2026. */
export const RANGE_RECORD = 'In four years of NEA readings, the actual value landed in this range about 8 times in 10.';

/** @typedef {{ now: number, steps: Array<{ h: number, t: string, lo: number, hi: number }> }} Range */
/** The range as of the latest reading's hour (unix hours), however old that is. @typedef {{ hour: number, range: Range }} LatestRange */

/** @param {number[]} sorted @param {number} p 0–1 */
const quantile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))))];

/**
 * 80% range for 1, 3 and 6 hours ahead, or null without enough recent readings or when the latest
 * is no longer "now".
 * @param {Array<{ timestamp: string, readings: Record<string, number> }>} rows oldest first
 * @param {number} [nowMs]
 * @returns {Range | null}
 */
export const nextHours = (rows, nowMs = Date.now()) => currentRange(latestRange(rows), nowMs);

/** The range, unless its latest reading is too old to count as now. @param {LatestRange | null} latest @param {number} [nowMs] */
export const currentRange = (latest, nowMs = Date.now()) => (latest && nowMs / 3_600_000 - latest.hour <= STALE_H ? latest.range : null);

/**
 * The range from the latest reading, worked out once per NEA hour and stored (currentRange checks
 * its age at read time), or null without enough readings. Moves are ratios of PM2.5, so a quiet
 * day at 30 and a hazy one at 150 widen in proportion.
 * @param {Array<{ timestamp: string, readings: Record<string, number> }>} rows oldest first
 * @returns {LatestRange | null}
 */
export function latestRange(rows) {
  /** @type {Map<number, number>} */
  const byHour = new Map();
  for (const r of rows) {
    const pm = islandMean(r.readings);
    if (pm != null) byHour.set(unixHour(r.timestamp), Math.max(pm, 1));
  }
  const t0 = Math.max(...byHour.keys());
  const pmNow = byHour.get(t0);
  if (pmNow == null || byHour.size < MIN_HOURS) return null;
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
  return { hour: t0, range: { now: /** @type {number} */ (pm25ToPsi(pmNow)), steps } };
}
