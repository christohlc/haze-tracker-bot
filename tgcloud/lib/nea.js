// @ts-check
// NEA readings via data.gov.sg (v2 real-time API). Fetch only; shaping is in snapshot.js.

import { NEA_API } from './config.js';
import { getJson } from './http.js';
import { sgtDateOf } from './time.js';

async function getItems(path, date) {
  const url = `${NEA_API}/${path}${date ? `?date=${date}` : ''}`;
  const body = await getJson(url, `NEA ${path}`);
  if (body.code !== 0) throw new Error(`NEA ${path}: ${body.errorMsg || body.code}`);
  return body.data?.items ?? [];
}

/**
 * Hourly PM2.5 for today and yesterday (SGT), so there are always ≥24 hours.
 * @returns {Promise<Array<{ timestamp: string, readings: Record<string, number> }>>} oldest first
 */
export async function getPm25History() {
  const [today, yesterday] = await Promise.all([getItems('pm25', sgtDateOf(Date.now())), getItems('pm25', sgtDateOf(Date.now() - 86_400_000))]);
  const byTime = new Map();
  for (const item of [...yesterday, ...today]) {
    byTime.set(item.timestamp, { timestamp: item.timestamp, readings: item.readings.pm25_one_hourly });
  }
  return [...byTime.values()].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
}

/** Latest PSI item (24-hour PSI and sub-indices per region). */
export async function getLatestPsi() {
  const items = await getItems('psi');
  if (!items.length) throw new Error('NEA psi: no items');
  return { timestamp: items[0].timestamp, readings: items[0].readings };
}
