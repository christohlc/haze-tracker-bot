// Worst-case data for stress-testing the UI (open the dev server with ?demo=worst).
import type { Dashboard, HourRow } from '../lib/api';

export function worstCase(): Dashboard {
  const start = Date.parse('2026-10-15T14:00:00+08:00');
  const history: HourRow[] = Array.from({ length: 48 }, (_, i) => {
    const t = `${new Date(start + i * 3600_000 + 8 * 3600_000).toISOString().slice(0, 19)}+08:00`;
    // A spike past PSI 500, a gap (missing hours) and a region that stops reporting.
    if (i >= 30 && i <= 32) return { t };
    return {
      t,
      north: i < 40 ? 20 + i * 12 : undefined,
      west: 650,
      central: i % 2 ? 0 : 499,
      east: 12,
      south: 1000,
    };
  });
  return {
    snapshot: {
      asOf: history.at(-1)!.t,
      psiAsOf: history.at(-1)!.t,
      stale: true,
      regions: [
        { id: 'north', name: 'North', pm25: null, psi1h: null, psi3h: null, psi24h: null, pm25Mean24h: null },
        { id: 'west', name: 'West', pm25: 650, psi1h: 600, psi3h: 600, psi24h: 512, pm25Mean24h: 650 },
        { id: 'central', name: 'Central', pm25: 499, psi1h: 500, psi3h: 433, psi24h: 1000, pm25Mean24h: 260 },
        { id: 'east', name: 'East', pm25: 12, psi1h: 50, psi3h: 50, psi24h: 51, pm25Mean24h: 12 },
        { id: 'south', name: 'South', pm25: 1000, psi1h: 833, psi3h: 833, psi24h: 999, pm25Mean24h: 1000 },
      ],
      island: { now: 540.25, mean24h: 480.4 },
      worst: {
        psi1h: { region: 'south', name: 'South', value: 833 },
        psi3h: { region: 'south', name: 'South', value: 833 },
        psi24h: { region: 'central', name: 'Central', value: 1000 },
        pm25: { region: 'south', name: 'South', value: 1000 },
      },
    },
    history,
    sources: [
      { source: 'nea_pm25', lastOkAt: 1_760_590_000, lastErrorAt: 1_760_600_000, lastError: 'NEA pm25 503: Service Unavailable — upstream timeout after 30000 ms while fetching https://api-open.data.gov.sg/v2/real-time/api/pm25?date=2026-10-16', detail: null },
      { source: 'nea_psi', lastOkAt: null, lastErrorAt: 1_760_600_000, lastError: 'NEA psi: no items', detail: null },
      { source: 'some_future_feed_with_a_very_long_identifier', lastOkAt: 1_760_600_000, lastErrorAt: null, lastError: null, detail: null },
    ],
    serverTime: Date.now(),
  };
}

/** NEA returned nothing usable: every value null, no history, no feeds recorded yet. */
export function emptyCase(): Dashboard {
  const t = '2026-10-16T00:00:00+08:00';
  const ids = [
    ['north', 'North'],
    ['west', 'West'],
    ['central', 'Central'],
    ['east', 'East'],
    ['south', 'South'],
  ] as const;
  return {
    snapshot: {
      asOf: t,
      psiAsOf: t,
      stale: false,
      regions: ids.map(([id, name]) => ({ id, name, pm25: null, psi1h: null, psi3h: null, psi24h: null, pm25Mean24h: null })),
      island: { now: null, mean24h: null },
      worst: { psi1h: null, psi3h: null, psi24h: null, pm25: null },
    },
    history: [],
    sources: [],
    serverTime: Date.now(),
  };
}
