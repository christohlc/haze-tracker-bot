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

/** NEA can't have published an hour's readings before this many ms past it. */
const NEA_EARLIEST_MS = 5 * 60_000;
/** While the current hour is awaited, refetch this often; once it's in, this often, for NEA's revisions. */
export const AWAITED_EVERY_S = 2 * 60;
export const REVISED_EVERY_S = 10 * 60; // under the tick's 15 min, so every tick refetches

/**
 * How often to refetch NEA (seconds), given the latest reading we have: often while NEA's current
 * hour is due and not in yet, less often once it is, as NEA revises an hour's readings during it.
 * @param {string} asOf the stored snapshot's latest hour @param {number} nowMs
 */
export function neaRefetchEveryS(asOf, nowMs) {
  const awaited = unixHour(asOf) < Math.floor(nowMs / 3_600_000) && nowMs % 3_600_000 >= NEA_EARLIEST_MS;
  return awaited ? AWAITED_EVERY_S : REVISED_EVERY_S;
}

/**
 * @param {Array<{ timestamp: string, readings: Record<string, number> }>} pm25History oldest first
 * @param {{ timestamp: string, readings: Record<string, Record<string, number>> }} psi
 */
export function buildSnapshot(pm25History, psi) {
  if (!pm25History.length) throw new Error('No PM2.5 readings');
  const history = pm25History.slice(-25);
  const rows = history.map((h) => ({ t: h.timestamp, ...h.readings }));
  // NEA's own 24-hour PM2.5 averages when its PSI item is for the same hour as the latest reading;
  // otherwise ours, from the hourly readings.
  const nea24h = psi.timestamp === history.at(-1)?.timestamp ? psi.readings.pm25_twenty_four_hourly : null;

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
      pm25Mean24h: nea24h?.[id] ?? meanOfLast(series, 24),
      trend: pm25Trend(rows, id),
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

  return {
    asOf: history[history.length - 1].timestamp,
    psiAsOf: psi.timestamp,
    regions,
    island,
    worst: {
      psi1h: pick(worst('psi1h'), 'psi1h'),
      psi3h: pick(worst('psi3h'), 'psi3h'),
      psi24h: pick(worst('psi24h'), 'psi24h'),
      pm25: pick(worst('pm25'), 'pm25'),
    },
    cigs: cigarettes(island),
    history: rows,
  };
}

/** @param {any} region @param {string} key */
function pick(region, key) {
  return region ? { region: region.id, name: region.name, value: region[key] } : null;
}

/**
 * The readings to lead with for an area: that region's, or for each reading the region where it's
 * highest. `area` is the picked region (null for the highest); `trend` goes with the PM2.5 shown.
 * @param {any} snap @param {string | null | undefined} region
 */
export function readingsFor(snap, region) {
  const area = snap.regions?.find((/** @type {any} */ r) => r.id === region) ?? null;
  /** @param {'psi1h' | 'psi3h' | 'psi24h' | 'pm25'} key */
  const at = (key) => (area ? (area[key] == null ? null : { region: area.id, name: area.name, value: area[key] }) : snap.worst[key]);
  const pm25 = at('pm25');
  const trend = snap.regions?.find((/** @type {any} */ r) => r.id === pm25?.region)?.trend ?? null;
  return { area, psi1h: at('psi1h'), psi3h: at('psi3h'), psi24h: at('psi24h'), pm25, trend };
}
