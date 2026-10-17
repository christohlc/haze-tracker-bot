// @ts-check
// The "current state" object shared by the bot and the Mini App.
// Pure (no SDK) so it can be unit-tested; lib/live.js fetches and calls it.

import { REGIONS } from './config.js';
import { meanOfLast, pm25ToPsi } from './psi.js';
import { cigarettes } from './cigs.js';
import { unixHour } from './time.js';

/**
 * Mean PM2.5 over the regions that reported; null if none did. The island-wide figure, and
 * what the next-hours range is worked out from.
 * @param {Record<string, any> | undefined} readings region id → µg/m³ (other keys ignored)
 * @returns {number | null}
 */
export function islandMean(readings) {
  const xs = /** @type {number[]} */ (REGIONS.map((r) => readings?.[r.id]).filter((v) => v != null));
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

/**
 * Which way a region's 1-hour PM2.5 is heading: the latest hour against three hours earlier (found
 * by time, so a missing hour can't stretch the gap). Moves under 10 µg/m³ or 15% are steady; null
 * when either hour is missing. Our calculation, not NEA's.
 * @param {Array<{ t: string } & Record<string, any>>} rows oldest first  @param {string} region
 * @returns {'rising' | 'easing' | 'steady' | null}
 */
export function pm25Trend(rows, region) {
  const last = rows.at(-1);
  if (!last) return null;
  const h0 = unixHour(last.t);
  const now = last[region];
  const before = rows.find((r) => unixHour(r.t) === h0 - 3)?.[region];
  if (now == null || before == null) return null;
  const d = now - before;
  if (Math.abs(d) < 10 || Math.abs(d) < before * 0.15) return 'steady';
  return d > 0 ? 'rising' : 'easing';
}

/**
 * @param {Array<{ timestamp: string, readings: Record<string, number> }>} pm25History oldest first
 * @param {{ timestamp: string, readings: Record<string, Record<string, number>> }} psi
 */
export function buildSnapshot(pm25History, psi) {
  if (!pm25History.length) throw new Error('No PM2.5 readings');
  const history = pm25History.slice(-25);

  const regions = REGIONS.map(({ id, name }) => {
    const series = history.map((h) => h.readings?.[id] ?? null);
    const pm25 = series.at(-1) ?? null;
    return {
      id,
      name,
      pm25,
      psi1h: pm25ToPsi(pm25),
      psi3h: pm25ToPsi(meanOfLast(series, 3)),
      psi24h: psi.readings.psi_twenty_four_hourly?.[id] ?? null,
      pm25Mean24h: meanOfLast(series, 24),
    };
  });

  const islandSeries = history.map((h) => islandMean(h.readings));
  const island = { now: islandSeries.at(-1) ?? null, mean24h: meanOfLast(islandSeries, 24) };

  /** @param {'psi1h'|'psi3h'|'psi24h'|'pm25'} key */
  const worst = (key) =>
    regions.reduce(
      (/** @type {(typeof regions)[number] | null} */ best, r) =>
        r[key] != null && (best == null || r[key] > /** @type {number} */ (best[key])) ? r : best,
      null,
    );

  const rows = history.map((h) => ({ t: h.timestamp, ...h.readings }));
  const worstPm25 = pick(worst('pm25'), 'pm25');

  return {
    asOf: history[history.length - 1].timestamp,
    psiAsOf: psi.timestamp,
    regions,
    island,
    worst: {
      psi1h: pick(worst('psi1h'), 'psi1h'),
      psi3h: pick(worst('psi3h'), 'psi3h'),
      psi24h: pick(worst('psi24h'), 'psi24h'),
      pm25: worstPm25 && { ...worstPm25, trend: pm25Trend(rows, worstPm25.region) },
    },
    cigs: cigarettes(island),
    history: rows,
  };
}

/** @param {any} region @param {string} key */
function pick(region, key) {
  return region ? { region: region.id, name: region.name, value: region[key] } : null;
}
