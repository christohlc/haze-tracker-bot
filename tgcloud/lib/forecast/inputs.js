// @ts-check
// Fetch live forecast inputs from Open-Meteo and assemble the raw window (see features.js).
// Only the inputs the current model uses (MODEL.needs) are requested.

import { fetch } from 'sdk';
import { islandMean } from '../snapshot.js';
import { unixHour } from '../time.js';
import { MODEL } from './model.js';

const WX = 'https://api.open-meteo.com/v1/forecast';
const AQ = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const WEATHER_VARS = {
  ws: 'wind_speed_10m',
  wd: 'wind_direction_10m',
  precip: 'precipitation',
  blh: 'boundary_layer_height',
};

/** @param {string} url */
async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  return res.json();
}

/**
 * Hourly Open-Meteo series → 25 values at hours t..t+24 (NaN where missing).
 * @param {{ time: string[] } & Record<string, Array<number | null>>} hourly
 * @param {string} key @param {number} t unix hour
 */
function alignHourly(hourly, key, t) {
  const byHour = new Map(hourly.time.map((time, i) => [unixHour(`${time}Z`), hourly[key][i]]));
  return Array.from({ length: 25 }, (_, i) => byHour.get(t + i) ?? NaN);
}

/**
 * @param {{ asOf: string, history: Array<{ t: string } & Record<string, any>> }} snap
 *   the snapshot just built; its history is the 25 hours t-24..t the model needs
 * @returns {Promise<import('./features.js').RawWindow>}
 */
export async function fetchInputs(snap) {
  const t = unixHour(snap.asOf);
  const pmByHour = new Map(snap.history.map((row) => [unixHour(row.t), islandMean(row) ?? NaN]));
  // A missing NEA hour takes the hour before (training skips such windows; live can't).
  /** @type {number[]} */
  const pm = [];
  for (let i = 0; i < 25; i++) {
    const v = pmByHour.get(t - 24 + i);
    pm.push(v != null && Number.isFinite(v) ? v : (pm[i - 1] ?? NaN));
  }
  if (!Number.isFinite(pm[24])) throw new Error('No PM2.5 for the issue hour');

  const { weather, aq } = MODEL.needs;
  /** @type {Record<string, [number, number]>} */
  const points = MODEL.points; // written by train.py
  const [wx, aqBody] = await Promise.all([
    weather.length
      ? getJson(
          `${WX}?latitude=${points.sg[0]}&longitude=${points.sg[1]}&hourly=${weather.map((k) => WEATHER_VARS[k]).join(',')}&past_days=1&forecast_days=2&timezone=GMT`,
        )
      : null,
    aq.length
      ? getJson(
          `${AQ}?latitude=${aq.map((/** @type {string} */ p) => points[p][0]).join(',')}&longitude=${aq.map((/** @type {string} */ p) => points[p][1]).join(',')}&hourly=pm2_5&past_days=1&forecast_days=2&timezone=GMT`,
        )
      : null,
  ]);
  const aqList = aqBody ? (Array.isArray(aqBody) ? aqBody : [aqBody]) : [];
  /** @type {any} */
  const raw = { pm, aq: {}, hour_utc: t % 24 };
  for (const k of weather) raw[k] = alignHourly(wx.hourly, WEATHER_VARS[k], t);
  aq.forEach((/** @type {string} */ p, /** @type {number} */ i) => {
    raw.aq[p] = alignHourly(aqList[i].hourly, 'pm2_5', t);
  });
  return raw;
}
