// @ts-check
// NEA's wind forecast for Singapore (the 24-hour forecast and the 4-day outlook on data.gov.sg),
// for the Mini App's Wind and rain card. Pure (no sdk) so tests and the Mini App can load it;
// lib/forecast.js does the fetching and caching.

import { NEA_API } from './config.js';
import { compassName } from './weather-parse.js';
import { sgtDateOf } from './time.js';

export const FORECAST_FEEDS = [
  { label: '24-hour forecast', url: `${NEA_API}/twenty-four-hr-forecast` },
  { label: '4-day outlook', url: `${NEA_API}/four-day-outlook` },
];

/**
 * `code` is NEA's compass point (“SSE”); `from` is its bearing, null for NEA's “variable”.
 * @typedef {{ code: string, from: number | null }} ForecastWind
 * @typedef {{ date: string, wind: ForecastWind }} ForecastDay `date` is YYYY-MM-DD, SGT
 * @typedef {{
 *   issuedAt: string,
 *   next24h: { wind: ForecastWind, kmh: { low: number, high: number } | null, until: string } | null,
 *   days: ForecastDay[],
 * }} Forecast
 */

const POINTS16 = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const VARIABLE = ['VAR', 'VARIABLE', 'VRB'];

/** NEA's direction code as a wind, or null if it's not one we know. @param {unknown} code @returns {ForecastWind | null} */
function windOf(code) {
  if (typeof code !== 'string') return null;
  const c = code.trim().toUpperCase();
  const i = POINTS16.indexOf(c);
  if (i >= 0) return { code: c, from: i * 22.5 };
  return VARIABLE.includes(c) ? { code: 'VAR', from: null } : null;
}

/** @param {unknown} s */
const isTime = (s) => typeof s === 'string' && Number.isFinite(Date.parse(s));

/**
 * The general wind from NEA's 24-hour forecast. Null if there's nothing usable. Never throws.
 * @param {any} json
 * @returns {{ issuedAt: string, next24h: NonNullable<Forecast['next24h']> } | null}
 */
export function parse24h(json) {
  const rec = json?.data?.records?.[0];
  const general = rec?.general;
  const wind = windOf(general?.wind?.direction);
  const until = general?.validPeriod?.end;
  const issuedAt = isTime(rec?.updatedTimestamp) ? rec.updatedTimestamp : rec?.timestamp;
  if (!wind || !isTime(until) || !isTime(issuedAt)) return null;
  const low = Number(general.wind.speed?.low);
  const high = Number(general.wind.speed?.high);
  const kmh = Number.isFinite(low) && Number.isFinite(high) && low >= 0 && high >= low ? { low, high } : null;
  return { issuedAt, next24h: { wind, kmh, until } };
}

/**
 * Each day's wind from NEA's 4-day outlook, in date order. Null if there's nothing usable. Never throws.
 * @param {any} json
 * @returns {{ issuedAt: string, days: ForecastDay[] } | null}
 */
export function parse4day(json) {
  const rec = json?.data?.records?.[0];
  if (!Array.isArray(rec?.forecasts)) return null;
  const issuedAt = isTime(rec.updatedTimestamp) ? rec.updatedTimestamp : rec.timestamp;
  if (!isTime(issuedAt)) return null;
  /** @type {Map<string, ForecastDay>} */
  const byDate = new Map();
  for (const f of rec.forecasts) {
    const wind = windOf(f?.wind?.direction);
    if (wind && isTime(f?.timestamp)) {
      const date = sgtDateOf(Date.parse(f.timestamp));
      if (!byDate.has(date)) byDate.set(date, { date, wind });
    }
  }
  const days = [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  return days.length ? { issuedAt, days } : null;
}

/**
 * The two feeds together. Null when neither had anything.
 * @param {ReturnType<typeof parse24h>} day
 * @param {ReturnType<typeof parse4day>} days
 * @returns {Forecast | null}
 */
export function combineForecast(day, days) {
  if (!day && !days) return null;
  // The older issue time, so the card never looks fresher than it is.
  const times = [day?.issuedAt, days?.issuedAt].filter((t) => typeof t === 'string');
  const issuedAt = times.reduce((a, b) => (Date.parse(b) < Date.parse(a) ? b : a));
  return { issuedAt, next24h: day?.next24h ?? null, days: days?.days ?? [] };
}

/**
 * Drops what's already past: a stored copy ages while data.gov.sg is unreachable. Null if nothing's left.
 * @param {Forecast | null} f
 * @param {number} [now]
 * @returns {Forecast | null}
 */
export function currentForecast(f, now = Date.now()) {
  if (!f) return null;
  const next24h = f.next24h && Date.parse(f.next24h.until) > now ? f.next24h : null;
  // The 4-day outlook starts tomorrow; today is covered by the 24-hour forecast.
  const today = sgtDateOf(now);
  const days = f.days.filter((d) => d.date > today);
  return next24h || days.length ? { ...f, next24h, days } : null;
}

const NAMES = { N: 'north', E: 'east', S: 'south', W: 'west' };

/** “south-southeast” for SSE; “variable” for NEA's variable winds. @param {ForecastWind} w */
export function forecastName(w) {
  if (w.from == null) return 'variable';
  const words = /** @type {Array<keyof typeof NAMES>} */ ([...w.code]).map((c) => NAMES[c]);
  return words.length === 3 ? `${words[0]}-${words[1]}${words[2]}` : words.join('');
}

/** The difference between two bearings, 0 to 180. @param {number} a @param {number} b */
const apart = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

/** The average of some bearings, on the circle (350° and 10° make 0°). @param {number[]} degs */
function meanBearing(degs) {
  const rad = (/** @type {number} */ d) => (d * Math.PI) / 180;
  const east = degs.reduce((s, d) => s + Math.sin(rad(d)), 0);
  const north = degs.reduce((s, d) => s + Math.cos(rad(d)), 0);
  return ((Math.atan2(east, north) * 180) / Math.PI + 360) % 360;
}

/** Today's wind, then each day's, as one list. @param {Forecast} f */
function allWinds(f) {
  return [...(f.next24h ? [{ date: null, wind: f.next24h.wind }] : []), ...f.days];
}

/**
 * “NEA expects winds from the southeast for the next 4 days.” Null when there's no forecast.
 * @param {Forecast | null} f
 * @param {number} [now] to name days
 * @returns {string | null}
 */
export function forecastLine(f, now = Date.now()) {
  if (!f) return null;
  const winds = allWinds(f);
  if (!winds.length) return null;
  // Runs of days whose winds stay within 45° of the run's first: SSE, SE then ESE is one wind, not a change.
  /** @type {Array<{ degs: number[], codes: Set<string>, date: string | null }>} */
  const groups = [];
  for (const { date, wind } of winds) {
    const run = groups.at(-1);
    const first = run?.degs[0];
    const same = run && (first == null ? wind.from == null : wind.from != null && apart(first, wind.from) <= 45);
    if (same) {
      if (wind.from != null) run.degs.push(wind.from);
      run.codes.add(wind.code);
    } else groups.push({ degs: wind.from == null ? [] : [wind.from], codes: new Set([wind.code]), date });
  }
  // A run of one direction keeps NEA's name for it; a mix is named by its average, to the nearest of eight points.
  const runs = groups.map((g) => {
    const [code] = g.codes;
    const name = g.codes.size === 1 ? forecastName({ code, from: g.degs[0] ?? null }) : compassName(meanBearing(g.degs));
    return { name, date: g.date };
  });
  const next = `the next ${f.days.length === 1 ? 'day' : `${f.days.length} days`}`;
  const span = !f.days.length ? 'the next 24 hours' : f.next24h ? `today and ${next}` : next;
  const from = (/** @type {string} */ name) => (name === 'variable' ? 'variable winds' : `winds from the ${name}`);
  if (runs.length === 1) return `NEA expects ${from(runs[0].name)} for ${span}.`;
  if (runs.length === 2 && runs[1].date) {
    const turn = runs[1].name === 'variable' ? 'turning variable' : `turning ${runs[1].name}`;
    return `NEA expects ${from(runs[0].name)}, ${turn} from ${dayName(runs[1].date, now)}.`;
  }
  return `NEA expects the wind to change direction over ${span}.`;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
/** 0 for Sunday. No Intl: the runtime may not have time zones. @param {string} ymd */
const weekday = (ymd) => new Date(`${ymd}T00:00:00Z`).getUTCDay();

/** “tomorrow” or “Tuesday”. @param {string} ymd @param {number} now */
function dayName(ymd, now) {
  if (ymd === sgtDateOf(now + 86_400_000)) return 'tomorrow';
  return WEEKDAYS[weekday(ymd)];
}

/** “Sunday”, or “Today” for the 24-hour forecast. @param {string | null} ymd */
export function dayLong(ymd) {
  return ymd ? WEEKDAYS[weekday(ymd)] : 'Today';
}

/** “Sun”, or “Today” for the 24-hour forecast. @param {string | null} ymd */
export function dayShort(ymd) {
  return ymd ? dayLong(ymd).slice(0, 3) : 'Today';
}

/** S, SSW, SW, WSW and W: from where most of the fires behind Singapore's haze burn. @param {ForecastWind} w */
const fromSumatra = (w) => w.from != null && w.from >= 180 && w.from <= 270;

/**
 * During a haze episode (some 24-hour PSI above 100), whether NEA's forecast wind would blow in from
 * Sumatra. Our reading, not NEA's, and the copy says so. Null otherwise.
 * @param {Forecast | null} f
 * @param {number | null | undefined} psi24h the worst region's
 * @param {number} [now] to name days
 * @returns {string | null}
 */
export function forecastSmokeLine(f, psi24h, now = Date.now()) {
  if (!f || psi24h == null || psi24h <= 100) return null;
  const first = allWinds(f).find((w) => fromSumatra(w.wind));
  if (!first) return null;
  const when = first.date ? `from ${dayName(first.date, now)}` : 'today';
  return `With winds from the ${forecastName(first.wind)} ${when}, smoke from fires in Sumatra may blow in. That’s our reading, not NEA’s.`;
}
