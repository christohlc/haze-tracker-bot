// @ts-check
// "Singapore’s highest 24-hr PSI since Sep 2019": how today's official 24-hour PSI compares with past hazes.
// Past days come from psi-history.js (generated, Feb 2016 on), 2015's peak (below) and the days
// the bot has seen since (state('psi_peaks'), kept by refreshNea). Pure module, no SDK.

import { PEAKS, THROUGH } from './psi-history.js';
import { pm25ToPsi } from './psi.js';
import { MONTHS } from './time.js';

/** Only a reading above this (Unhealthy) gets compared with the past. */
const FROM_PSI = 100;
/** Say it only when the last day as high was at least this long ago, so not for the day before. */
const GAP_DAYS = 365;

/** 2015's haze, before NEA's data online. Not NEA's exact peak, which isn't published: a lower bound,
    from "As of 7am, the 24-hour PSI was 263-321" (The Star, 25 Sep 2015). Earlier hazes (2013's
    highest 24-hour PSI was 246) used a PSI without PM2.5, so they aren't on the same scale. */
const PEAK_2015 = /** @type {[string, number]} */ (['2015-09-25', 321]);

/**
 * The highest regional 24-hour PSI from haze: each region's no higher than its 24-hour PM2.5
 * sub-index, as psi-history.js counts it, so an ozone spike or a glitch isn't taken for haze.
 * @param {Array<{ psi24h: number | null, pm25Mean24h: number | null }>} regions from buildSnapshot
 * @returns {number | null}
 */
export function hazePsi(regions) {
  const vals = regions.filter((r) => r.psi24h != null).map((r) => Math.min(/** @type {number} */ (r.psi24h), pm25ToPsi(r.pm25Mean24h) ?? Infinity));
  return vals.length ? Math.max(...vals) : null;
}

/**
 * The days to keep in state('psi_peaks'), with `psi` noted as `date`'s highest if it is: only
 * days after psi-history.js ends and above 100. Returns `kept` itself when nothing changed.
 * @param {Array<[string, number]>} kept @param {string} date SGT @param {number | null | undefined} psi
 */
export function notePeak(kept, date, psi) {
  if (psi == null || psi <= FROM_PSI || date <= THROUGH) return kept;
  const old = kept.find(([d]) => d === date);
  if (old && old[1] >= psi) return kept;
  return [...kept.filter(([d]) => d !== date), /** @type {[string, number]} */ ([date, psi])].sort(([a], [b]) => a.localeCompare(b));
}

/**
 * How `psi` (today's highest regional 24-hour PSI) compares with past days: `{ since }`, the last
 * day it was as high, when that's over a year ago; `{ since: null }` when no day since 2015 was.
 * Null when it's 100 or under, or as high as recently.
 * @param {number | null | undefined} psi @param {string} today SGT date @param {Array<[string, number]>} [kept]
 * @returns {{ since: string | null } | null}
 */
export function highestSince(psi, today, kept = []) {
  if (psi == null || psi <= FROM_PSI) return null;
  let last = null;
  for (const [d, v] of [PEAK_2015, ...PEAKS, ...kept]) if (d < today && v >= psi && (last == null || d > last)) last = d;
  if (last == null) return { since: null };
  return (Date.parse(today) - Date.parse(last)) / 86_400_000 >= GAP_DAYS ? { since: last } : null;
}

/** "Singapore’s highest 24-hr PSI since Sep 2019", or null. @param {{ since: string | null } | null | undefined} record */
export function recordText(record) {
  if (!record) return null;
  if (!record.since) return 'Singapore’s highest 24-hr PSI since the 2015 haze, or higher';
  const [y, m] = record.since.split('-');
  return `Singapore’s highest 24-hr PSI since ${MONTHS[Number(m) - 1]} ${y}`;
}
