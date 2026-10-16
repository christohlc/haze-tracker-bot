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

export interface Camera {
  id: string;
  name: string;
  region: RegionId | null;
  image: string;
  takenAt: string;
}

export interface CamerasResult {
  /** Null until the feed has answered once. */
  cameras: Camera[] | null;
  serverTime: number;
}

/**
 * Dev-only: ?demo= plus this card's own state from `?card=cameras:error,weather:partial`, since
 * ?demo=error and ?demo=loading hide every card. Throws for `error`, never settles for `loading`.
 */
async function devQuery(card: string, failure: string) {
  const q = new URLSearchParams(location.search);
  const state =
    q
      .get('card')
      ?.split(',')
      .find((s) => s.startsWith(`${card}:`))
      ?.slice(card.length + 1) ?? null;
  if (state === 'error') throw new Error(failure);
  if (state === 'loading') await new Promise(() => {});
  return { demo: q.get('demo'), state };
}

export async function loadCameras(): Promise<CamerasResult> {
  if (inTelegram) return callEndpoint<CamerasResult>('getCameras');
  if (import.meta.env.DEV) {
    // ?demo=worst | empty, ?card=cameras:error | loading
    const { demo } = await devQuery('cameras', 'Couldn’t load the camera pictures.');
    const dev = await import('../dev/cameras');
    if (demo === 'worst') return dev.worstCameras();
    if (demo === 'empty') return { cameras: [], serverTime: Date.now() };
    return dev.demoCameras();
  }
  throw new Error('Open this dashboard from the bot in Telegram.');
}

export type Weather = import('../../tgcloud/lib/weather-parse.js').Weather;

export interface WeatherResult {
  /** Null until the feeds have answered once. */
  weather: Weather | null;
  serverTime: number;
}

export async function loadWeather(): Promise<WeatherResult> {
  if (inTelegram) return callEndpoint<WeatherResult>('getWeather');
  if (import.meta.env.DEV) {
    // ?demo=worst | empty, ?card=weather:error | loading | partial
    const { demo, state } = await devQuery('weather', 'Couldn’t load wind and rain.');
    const dev = await import('../dev/weather');
    if (state === 'partial') return dev.partialWeather();
    if (demo === 'worst') return dev.worstWeather();
    if (demo === 'empty') return { weather: null, serverTime: Date.now() };
    return dev.demoWeather();
  }
  throw new Error('Open this dashboard from the bot in Telegram.');
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
