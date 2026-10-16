import type { PUBLISHERS } from '../../tgcloud/lib/news-parse.js';
import { callEndpoint, inTelegram } from './telegram';

export type RegionId = 'north' | 'west' | 'central' | 'east' | 'south';

export interface Region {
  id: RegionId;
  name: string;
  pm25: number | null;
  psi1h: number | null;
  psi3h: number | null;
  psi24h: number | null;
  pm25Mean24h: number | null;
}

export interface Worst {
  region: RegionId;
  name: string;
  value: number;
}

export interface Snapshot {
  asOf: string;
  psiAsOf: string;
  stale: boolean;
  regions: Region[];
  island: { now: number | null; mean24h: number | null };
  worst: { psi1h: Worst | null; psi3h: Worst | null; psi24h: Worst | null; pm25: Worst | null };
}

export type HourRow = { t: string } & Partial<Record<RegionId, number>>;

export interface SourceStatus {
  source: string;
  lastOkAt: number | null;
  lastErrorAt: number | null;
  lastError: string | null;
  detail: string | null;
}

export interface ForecastStep {
  h: number;
  t: string;
  psi: number;
  lo: number;
  hi: number;
}

export interface Forecast {
  issuedAt: string;
  now: number | null;
  steps: ForecastStep[];
  factors: { group: string; label: string; delta: number }[];
  missingInputs: number;
  model: { version: number; trainedAt: string; backtest?: { coverage: [number, number]; testFrom: string } | null };
}

export interface NewsItem {
  source: keyof typeof PUBLISHERS;
  title: string;
  link: string;
  publishedAt: string;
}

export interface Dashboard {
  snapshot: Snapshot;
  history: HourRow[];
  sources: SourceStatus[];
  forecast?: Forecast | null;
  /** Haze headlines, newest first; null until the hourly job has fetched them once. */
  news?: NewsItem[] | null;
  serverTime: number;
}

export async function loadDashboard(): Promise<Dashboard> {
  if (inTelegram) return callEndpoint<Dashboard>('getDashboard');
  if (import.meta.env.DEV) {
    // Dev-only data switch (see DevDataToggle): ?demo=worst | empty | error | loading
    const demo = new URLSearchParams(location.search).get('demo');
    if (demo === 'worst') return (await import('../dev/worst')).worstCase();
    if (demo === 'empty') return (await import('../dev/worst')).emptyCase();
    if (demo === 'error') throw new Error('Couldn’t reach the haze service. Check your connection and try again.');
    if (demo === 'loading') return new Promise(() => {});
    return (await import('../dev/fixture.json')).default as Dashboard;
  }
  throw new Error('Open this dashboard from the bot in Telegram.');
}
