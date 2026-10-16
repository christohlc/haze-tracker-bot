// @ts-check
// The "current state" object shared by the bot and the Mini App.
// Pure (no SDK) so it can be unit-tested; lib/live.js fetches and calls it.

import { REGIONS } from './config.js';
import { meanOfLast, pm25ToPsi } from './psi.js';
import { cigarettes } from './cigs.js';

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

  const islandSeries = history.map((h) => {
    const xs = REGIONS.map((r) => h.readings?.[r.id]).filter((v) => v != null);
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  });
  const island = { now: islandSeries.at(-1) ?? null, mean24h: meanOfLast(islandSeries, 24) };

  /** @param {'psi1h'|'psi3h'|'psi24h'|'pm25'} key */
  const worst = (key) =>
    regions.reduce((best, r) => (r[key] != null && (best == null || r[key] > best[key]) ? r : best), null);

  return {
    asOf: history.at(-1).timestamp,
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
    history: history.map((h) => ({ t: h.timestamp, ...h.readings })),
  };
}

function pick(region, key) {
  return region ? { region: region.id, name: region.name, value: region[key] } : null;
}
