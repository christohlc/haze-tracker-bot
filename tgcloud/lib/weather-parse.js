// @ts-check
// NEA's wind and rain stations from data.gov.sg, summed up for the Mini App's Wind and rain card.
// Pure (no sdk) so tests and the Mini App can load it; lib/weather.js does the fetching and caching.

import { REGIONS } from './config.js';
import { psiBand } from './psi.js';

const BASE = 'https://api-open.data.gov.sg/v2/real-time/api';
export const WEATHER_FEEDS = {
  dir: `${BASE}/wind-direction`, // degrees the wind blows from, 10-minute average
  speed: `${BASE}/wind-speed`, // knots
  rain: `${BASE}/rainfall`, // mm in the last 5 minutes
};

/** @typedef {'north' | 'west' | 'central' | 'east' | 'south'} RegionId */
/** @typedef {{ takenAt: string, readings: Array<{ id: string, region: RegionId, value: number }> }} Stations */
/**
 * @typedef {{
 *   takenAt: string,
 *   wind: { from: number | null, kmh: number, steady: boolean, stations: number } | null,
 *   rain: { raining: RegionId[], wettest: { region: RegionId, mm: number } | null, stations: number } | null,
 * }} Weather
 */

/** NEA's label point for each region (the PSI feed's regionMetadata); a station belongs to the nearest. */
/** @type {Array<[RegionId, number, number]>} */
const REGION_POINTS = [
  ['north', 1.41803, 103.82],
  ['south', 1.29587, 103.82],
  ['east', 1.35735, 103.94],
  ['west', 1.35735, 103.7],
  ['central', 1.35735, 103.82],
];

const KNOTS_TO_KMH = 1.852;
// Under 0.2 mm in 5 minutes is a few drops, or the gauge settling.
const RAIN_MM = 0.2;

/** @param {number} lat @param {number} lon @returns {RegionId} */
function nearestRegion(lat, lon) {
  let best = REGION_POINTS[0];
  let bestD = Infinity;
  for (const p of REGION_POINTS) {
    const d = (p[1] - lat) ** 2 + (p[2] - lon) ** 2;
    if (d < bestD) [best, bestD] = [p, d];
  }
  return best[0];
}

/**
 * One of NEA's station feeds, each reading tagged with its region. Null if there's nothing usable. Never throws.
 * @param {any} json
 * @returns {Stations | null}
 */
export function parseStations(json) {
  const stations = json?.data?.stations;
  const latest = json?.data?.readings?.[0];
  if (!Array.isArray(stations) || !Array.isArray(latest?.data)) return null;
  const takenAt = typeof latest.timestamp === 'string' && Number.isFinite(Date.parse(latest.timestamp)) ? latest.timestamp : '';
  if (!takenAt) return null;
  /** @type {Map<string, RegionId>} */
  const regionOf = new Map();
  for (const s of stations) {
    const lat = Number(s?.location?.latitude);
    const lon = Number(s?.location?.longitude);
    if (s?.id != null && Number.isFinite(lat) && Number.isFinite(lon)) regionOf.set(String(s.id), nearestRegion(lat, lon));
  }
  const readings = [];
  for (const r of latest.data) {
    const id = String(r?.stationId ?? '');
    const region = regionOf.get(id);
    if (region && typeof r.value === 'number' && Number.isFinite(r.value) && r.value >= 0) readings.push({ id, region, value: r.value });
  }
  return readings.length ? { takenAt, readings } : null;
}

/** @param {number[]} xs */
function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * @param {Stations | null} dir
 * @param {Stations | null} speed
 */
function summariseWind(dir, speed) {
  if (!dir || !speed) return null;
  const knots = new Map(speed.readings.map((r) => [r.id, r.value]));
  const pairs = dir.readings.flatMap((r) => (knots.has(r.id) ? [{ deg: r.value, kt: /** @type {number} */ (knots.get(r.id)) }] : []));
  if (!pairs.length) return null;
  // Speed-weighted vector mean, so 350° and 10° average to north and a gusty station counts for more.
  let east = 0;
  let north = 0;
  for (const { deg, kt } of pairs) {
    const rad = (deg * Math.PI) / 180;
    east += kt * Math.sin(rad);
    north += kt * Math.cos(rad);
  }
  const meanKt = pairs.reduce((sum, p) => sum + p.kt, 0) / pairs.length;
  const resultant = Math.hypot(east, north) / pairs.length;
  const from = resultant > 0 ? Math.round(((Math.atan2(east, north) * 180) / Math.PI + 360) % 360) : null;
  return {
    from,
    kmh: Math.round(median(pairs.map((p) => p.kt)) * KNOTS_TO_KMH),
    // Stations pointing different ways cancel out; under half the mean speed left means no clear direction.
    steady: from != null && resultant >= 0.5 * meanKt,
    stations: pairs.length,
  };
}

/** @param {Stations | null} rain */
function summariseRain(rain) {
  if (!rain) return null;
  const wet = rain.readings.filter((r) => r.value > RAIN_MM);
  const top = wet.reduce((a, b) => (b.value > a.value ? b : a), wet[0]);
  return {
    raining: REGIONS.map((r) => /** @type {RegionId} */ (r.id)).filter((id) => wet.some((r) => r.region === id)),
    wettest: top ? { region: top.region, mm: top.value } : null,
    stations: rain.readings.length,
  };
}

/**
 * The three feeds summed up for the card. Null when none of them had anything.
 * @param {Stations | null} dir
 * @param {Stations | null} speed
 * @param {Stations | null} rain
 * @returns {Weather | null}
 */
export function summariseWeather(dir, speed, rain) {
  const wind = summariseWind(dir, speed);
  const rainSum = summariseRain(rain);
  if (!wind && !rainSum) return null;
  // The oldest of the feeds used, so the card never looks fresher than it is.
  const times = [wind && dir?.takenAt, wind && speed?.takenAt, rainSum && rain?.takenAt].filter((t) => typeof t === 'string');
  const takenAt = times.reduce((a, b) => (Date.parse(b) < Date.parse(a) ? b : a));
  return { takenAt, wind, rain: rainSum };
}

const POINTS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];

/** “southwest” for 225°. @param {number} deg */
export function compassName(deg) {
  return POINTS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

/**
 * Whether the wind is coming from where the fires behind Singapore's haze usually are. Our reading, not NEA's.
 * @param {Weather['wind']} wind
 * @param {number | null | undefined} psi24h
 * @returns {string | null}
 */
export function smokeLine(wind, psi24h) {
  if (!wind) return null;
  const clean = psiBand(psi24h)?.id === 'good';
  if (wind.kmh < 5) {
    return clean ? 'Winds are light.' : 'Winds are light, so haze that’s already here may hang around.';
  }
  if (wind.from == null || !wind.steady) return 'Winds are shifting, so it’s hard to say where the air is coming from.';
  const but = clean ? ', but the air is clean right now.' : '.';
  if (wind.from >= 200 && wind.from <= 290) return `The wind is coming from Sumatra, where most of the fires behind our haze burn${but}`;
  if (wind.from >= 100 && wind.from <= 160) return `The wind is coming from Borneo, which can carry smoke from fires in Kalimantan${but}`;
  return 'The wind isn’t coming from the usual fire areas in Sumatra or Borneo.';
}
