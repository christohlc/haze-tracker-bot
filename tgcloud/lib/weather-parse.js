// @ts-check
// NEA's wind and rain stations from data.gov.sg, summed up for the Mini App's Wind and rain card.
// Pure (no sdk) so tests and the Mini App can load it; lib/weather.js does the fetching and caching.

import { NEA_API, REGIONS } from './config.js';
import { psiBand } from './psi.js';

export const WEATHER_FEEDS = [
  { label: 'wind direction', url: `${NEA_API}/wind-direction` }, // degrees the wind blows from, 10-minute average
  { label: 'wind speed', url: `${NEA_API}/wind-speed` }, // knots
  { label: 'rainfall', url: `${NEA_API}/rainfall` }, // mm in the last 5 minutes
];

/** @typedef {'north' | 'west' | 'central' | 'east' | 'south'} RegionId */
/** @typedef {{ takenAt: string, readings: Array<{ id: string, region: RegionId, value: number }> }} Stations */
/**
 * @typedef {{
 *   takenAt: string,
 *   wind: { from: number | null, kmh: number, steady: boolean, stations: number } | null,
 *   rain: { raining: RegionId[], stations: number } | null,
 * }} Weather
 */

const KNOTS_TO_KMH = 1.852;
// Below this, where the wind comes from says little about where the haze goes.
const LIGHT_KMH = 5;
// Under 0.2 mm in 5 minutes is a few drops, or the gauge settling.
const RAIN_MM = 0.2;

/** The region whose label point is nearest. @param {number} lat @param {number} lon @returns {RegionId} */
function nearestRegion(lat, lon) {
  let best = REGIONS[0];
  let bestD = Infinity;
  for (const p of REGIONS) {
    const d = (p.lat - lat) ** 2 + (p.lon - lon) ** 2;
    if (d < bestD) [best, bestD] = [p, d];
  }
  return /** @type {RegionId} */ (best.id);
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
  const from = resultant > 0 ? Math.round((Math.atan2(east, north) * 180) / Math.PI + 360) % 360 : null;
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
  const wet = new Set(rain.readings.filter((r) => r.value > RAIN_MM).map((r) => r.region));
  return {
    raining: REGIONS.map((r) => /** @type {RegionId} */ (r.id)).filter((id) => wet.has(id)),
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
 * Where the wind is coming from, or null when it's too light or shifting to say.
 * @param {Weather['wind']} wind
 */
export function clearDirection(wind) {
  return wind && wind.kmh >= LIGHT_KMH && wind.steady ? wind.from : null;
}

/**
 * “From the southwest”, or “Light winds” / “Shifting winds” when there's no clear direction.
 * @param {NonNullable<Weather['wind']>} wind
 */
export function windHeadline(wind) {
  const from = clearDirection(wind);
  if (from != null) return `From the ${compassName(from)}`;
  return wind.kmh < LIGHT_KMH ? 'Light winds' : 'Shifting winds';
}

/** Whether a wind from `deg` comes from Sumatra, where most of the fires behind Singapore's haze burn. @param {number} deg */
export const fromSumatra = (deg) => deg >= 200 && deg <= 290;

/**
 * Whether the wind is coming from where the fires behind Singapore's haze usually are. Our reading, not NEA's.
 * @param {Weather['wind']} wind
 * @param {number | null | undefined} psi24h
 * @returns {string | null}
 */
export function smokeLine(wind, psi24h) {
  if (!wind) return null;
  const clean = psiBand(psi24h)?.id === 'good';
  if (wind.kmh < LIGHT_KMH) {
    return clean ? 'Winds are light.' : 'Winds are light, so haze that’s already here may hang around.';
  }
  const from = clearDirection(wind);
  if (from == null) return 'Winds are shifting, so it’s hard to say where the air is coming from.';
  const end = clean ? ', but the air is clean right now.' : '.';
  if (fromSumatra(from)) return `The wind is coming from Sumatra, where most of the fires behind our haze burn${end}`;
  if (from >= 100 && from <= 160) return `The wind is coming from Borneo, which can carry smoke from fires in Kalimantan${end}`;
  return 'The wind isn’t coming from the usual fire areas in Sumatra or Borneo.';
}
