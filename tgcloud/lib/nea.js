// @ts-check
// NEA readings via data.gov.sg (v2 real-time API). Fetch only; shaping is in snapshot.js.

import { fetch } from 'sdk';
import { NEA_API } from './config.js';

/** YYYY-MM-DD in Singapore time, `daysAgo` days back. */
export function sgtDate(daysAgo = 0, now = Date.now()) {
  return new Date(now + 8 * 3600_000 - daysAgo * 86_400_000).toISOString().slice(0, 10);
}

async function getItems(path, date) {
  const url = `${NEA_API}/${path}${date ? `?date=${date}` : ''}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`NEA ${path} ${res.status}`);
  const body = await res.json();
  if (body.code !== 0) throw new Error(`NEA ${path}: ${body.errorMsg || body.code}`);
  return body.data?.items ?? [];
}

/**
 * Hourly PM2.5 for today and yesterday (SGT), so there are always ≥24 hours.
 * @returns {Promise<Array<{ timestamp: string, readings: Record<string, number> }>>} oldest first
 */
export async function getPm25History() {
  const [today, yesterday] = await Promise.all([getItems('pm25', sgtDate(0)), getItems('pm25', sgtDate(1))]);
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
