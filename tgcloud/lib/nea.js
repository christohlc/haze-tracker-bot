// @ts-check
// NEA readings via data.gov.sg (v2 real-time API). Fetch only; shaping is in snapshot.js.

import { NEA_API } from './config.js';
import { getJson } from './http.js';
import { sgtDateOf } from './time.js';

async function getItems(path, date, deadline) {
  const url = `${NEA_API}/${path}${date ? `?date=${date}` : ''}`;
  const body = await getJson(url, `NEA ${path}`, deadline);
  if (body.code !== 0) throw new Error(`NEA ${path}: ${body.errorMsg || body.code}`);
  return body.data?.items ?? [];
}

/** @typedef {{ timestamp: string, readings: Record<string, number> }} Pm25Item */

/**
 * Hourly PM2.5 for one SGT date ("2026-10-16"); NEA has up to 24 items a day.
 * @param {string} date
 * @param {number} [deadline] see retryOnce() in fetch-retry.js
 * @returns {Promise<Pm25Item[]>} oldest first
 */
export async function getPm25Day(date, deadline) {
  return byTime(await getItems('pm25', date, deadline));
}

/**
 * Hourly PM2.5 for today, and yesterday (SGT) when `withYesterday`, so there are ≥24 hours.
 * @param {number} [deadline] see retryOnce() in fetch-retry.js @param {boolean} [withYesterday]
 * @returns {Promise<Pm25Item[]>} oldest first
 */
export async function getPm25History(deadline, withYesterday = true) {
  const [today, yesterday] = await Promise.all([
    getItems('pm25', sgtDateOf(Date.now()), deadline),
    withYesterday ? getItems('pm25', sgtDateOf(Date.now() - 86_400_000), deadline) : [],
  ]);
  return byTime([...yesterday, ...today]);
}

/** NEA items → one Pm25Item per hour, oldest first. @param {any[]} items @returns {Pm25Item[]} */
function byTime(items) {
  const out = new Map();
  for (const item of items) out.set(item.timestamp, { timestamp: item.timestamp, readings: item.readings.pm25_one_hourly });
  return [...out.values()].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
}

/** Latest PSI item (24-hour PSI and sub-indices per region). @param {number} [deadline] see getPm25History */
export async function getLatestPsi(deadline) {
  const items = await getItems('psi', null, deadline);
  if (!items.length) throw new Error('NEA psi: no items');
  return { timestamp: items[0].timestamp, readings: items[0].readings };
}
