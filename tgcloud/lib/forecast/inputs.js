// @ts-check
// Fetch live forecast inputs (Open-Meteo weather + air quality) and assemble the raw window
// described in features.js. Two HTTP calls per run.

import { fetch } from 'sdk';
import { REGIONS } from '../config.js';
import { POINTS } from './features.js';

const WX = 'https://api.open-meteo.com/v1/forecast';
const AQ = 'https://air-quality-api.open-meteo.com/v1/air-quality';

/** @param {string} iso */
const hourOf = (iso) => Math.floor(Date.parse(iso) / 3_600_000);

/** @param {string} url */
async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  return res.json();
}

/**
 * Hourly Open-Meteo series → 25 values at hours t..t+24 (NaN where missing).
 * @param {{ time: string[] } & Record<string, Array<number | null>>} hourly
 * @param {string} key
 * @param {number} t unix hour
 */
function pick(hourly, key, t) {
  const by = new Map(hourly.time.map((time, i) => [hourOf(`${time}Z`), hourly[key][i]]));
  return Array.from({ length: 25 }, (_, i) => by.get(t + i) ?? NaN);
}

/**
 * @param {string} issueIso snapshot.asOf (latest NEA hour, SGT ISO)
 * @param {Array<{ timestamp: string, readings: Record<string, number> }>} history oldest first
 */
export async function fetchInputs(issueIso, history) {
  const t = hourOf(issueIso);
  const pmBy = new Map(
    history.map((h) => {
      const xs = REGIONS.map((r) => h.readings?.[r.id]).filter((v) => v != null);
      return [hourOf(h.timestamp), xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN];
    }),
  );
  // Fill a missing hour with the hour before (NEA occasionally skips one).
  const pm = [];
  for (let i = 0; i < 25; i++) {
    const v = pmBy.get(t - 24 + i);
    pm.push(Number.isFinite(v) ? v : (pm[i - 1] ?? NaN));
  }
  if (!Number.isFinite(pm[24])) throw new Error('No PM2.5 for the issue hour');

  const names = Object.keys(POINTS);
  const lats = names.map((n) => POINTS[n][0]).join(',');
  const lons = names.map((n) => POINTS[n][1]).join(',');
  const [wx, aqBody] = await Promise.all([
    getJson(
      `${WX}?latitude=${POINTS.sg[0]}&longitude=${POINTS.sg[1]}&hourly=boundary_layer_height,wind_speed_10m,wind_direction_10m,precipitation&past_days=1&forecast_days=2&timezone=GMT`,
    ),
    getJson(`${AQ}?latitude=${lats}&longitude=${lons}&hourly=pm2_5&past_days=1&forecast_days=2&timezone=GMT`),
  ]);
  const aqList = Array.isArray(aqBody) ? aqBody : [aqBody];

  return {
    pm,
    blh: pick(wx.hourly, 'boundary_layer_height', t),
    ws: pick(wx.hourly, 'wind_speed_10m', t),
    wd: pick(wx.hourly, 'wind_direction_10m', t),
    precip: pick(wx.hourly, 'precipitation', t),
    aq: Object.fromEntries(names.map((n, i) => [n, pick(aqList[i].hourly, 'pm2_5', t)])),
    hour_utc: ((t % 24) + 24) % 24,
  };
}
