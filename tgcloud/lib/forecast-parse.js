// @ts-check
// NEA's wind forecast for Singapore (the 24-hour forecast and the 4-day outlook on data.gov.sg),
// for the Mini App's Wind and rain card. Pure (no sdk) so tests and the Mini App can load it;
// lib/forecast.js does the fetching and caching.

import { NEA_API } from './config.js';
import { psiBand } from './psi.js';
import { sgtDateOf, sgtWeekday } from './time.js';
import { compassName, fromSumatra } from './weather-parse.js';

export const FORECAST_24H_FEED = `${NEA_API}/twenty-four-hr-forecast`;
export const FORECAST_4DAY_FEED = `${NEA_API}/four-day-outlook`;

/**
 * `code` is NEA's compass point (“SSE”); `from` is its bearing, null for NEA's “variable”.
 * @typedef {{ code: string, from: number | null }} ForecastWind
 * @typedef {{ date: string, wind: ForecastWind }} ForecastDay `date` is YYYY-MM-DD, SGT
 * @typedef {{ issuedAt: string, start: string, until: string, wind: ForecastWind }} Next24h
 * @typedef {{ issuedAt: string, days: ForecastDay[] }} Outlook4day
 * @typedef {{ issuedAt: string, next24h: Next24h | null, days: ForecastDay[] }} Forecast
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

/** @param {unknown} s @returns {s is string} */
const isTime = (s) => typeof s === 'string' && Number.isFinite(Date.parse(s));

/** When NEA issued a record: its update time, else its own. @param {any} rec @returns {string | null} */
const issuedAtOf = (rec) => [rec?.updatedTimestamp, rec?.timestamp].find(isTime) ?? null;

/**
 * The general wind from NEA's 24-hour forecast. Null if there's nothing usable. Never throws.
 * @param {any} json
 * @returns {Next24h | null}
 */
export function parse24h(json) {
  const rec = json?.data?.records?.[0];
  const wind = windOf(rec?.general?.wind?.direction);
  const start = rec?.general?.validPeriod?.start;
  const until = rec?.general?.validPeriod?.end;
  const issuedAt = issuedAtOf(rec);
  if (!wind || !isTime(start) || !isTime(until) || !issuedAt) return null;
  return { issuedAt, start, until, wind };
}

/**
 * Each day's wind from NEA's 4-day outlook, in date order. Null if there's nothing usable. Never throws.
 * @param {any} json
 * @returns {Outlook4day | null}
 */
export function parse4day(json) {
  const rec = json?.data?.records?.[0];
  const issuedAt = issuedAtOf(rec);
  if (!Array.isArray(rec?.forecasts) || !issuedAt) return null;
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
 * The two feeds together, without what's already past (a stored copy ages while data.gov.sg is
 * unreachable). Null when nothing's left.
 * @param {Next24h | null} next24h
 * @param {Outlook4day | null} outlook
 * @param {number} [now]
 * @returns {Forecast | null}
 */
export function combineForecast(next24h, outlook, now = Date.now()) {
  const current = next24h && Date.parse(next24h.until) > now ? next24h : null;
  // The 4-day outlook starts tomorrow; today is covered by the 24-hour forecast.
  const today = sgtDateOf(now);
  const days = outlook?.days.filter((d) => d.date > today) ?? [];
  const issued = [current?.issuedAt, days.length ? outlook?.issuedAt : null].filter(isTime);
  if (!issued.length) return null;
  // The older issue time, so the card never looks fresher than it is.
  const issuedAt = issued.reduce((a, b) => (Date.parse(b) < Date.parse(a) ? b : a));
  return { issuedAt, next24h: current, days };
}

/** NEA reissues the 4-day outlook twice a day, so a day-old forecast means data.gov.sg hasn't answered since. */
export const FORECAST_STALE_MS = 24 * 3_600_000;

const NAMES = { N: 'north', E: 'east', S: 'south', W: 'west' };

/** “south-southeast” for SSE; “variable” for NEA's variable winds. @param {ForecastWind} w */
export function forecastName(w) {
  if (w.from == null) return 'variable';
  const words = /** @type {Array<keyof typeof NAMES>} */ ([...w.code]).map((c) => NAMES[c]);
  return words.length === 3 ? `${words[0]}-${words[1]}${words[2]}` : words.join('');
}

/** “winds from the southeast”, or “variable winds”. @param {string} name from forecastName or compassName */
export const windsPhrase = (name) => (name === 'variable' ? 'variable winds' : `winds from the ${name}`);

/** “Today”, or “Tonight” for the forecast NEA issues in the evening (valid 6 pm to 6 pm). @param {Next24h} n */
export const next24hLabel = (n) => (Number(n.start.slice(11, 13)) >= 18 ? 'Tonight' : 'Today');

/**
 * The 24-hour forecast's wind (date null), then each day's, as one list.
 * @param {Forecast} f
 * @returns {Array<{ date: string | null, wind: ForecastWind }>}
 */
export function allWinds(f) {
  return [...(f.next24h ? [{ date: null, wind: f.next24h.wind }] : []), ...f.days];
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

/** “tomorrow” or “Tuesday”. @param {string} ymd @param {number} now */
const dayName = (ymd, now) => (ymd === sgtDateOf(now + 86_400_000) ? 'tomorrow' : sgtWeekday(ymd));

/**
 * “NEA expects winds from the southeast for today and the next 4 days.” Null when there's no forecast.
 * @param {Forecast | null} f
 * @param {number} [now] to name days
 * @returns {string | null}
 */
export function forecastLine(f, now = Date.now()) {
  if (!f) return null;
  // Runs of days whose winds stay within 45° of the run's first: SSE, SE then ESE is one wind, not a change.
  /** @type {Array<{ winds: ForecastWind[], date: string | null }>} */
  const runs = [];
  for (const { date, wind } of allWinds(f)) {
    const run = runs.at(-1);
    const first = run?.winds[0];
    const same = first && (first.from == null || wind.from == null ? first.from === wind.from : apart(first.from, wind.from) <= 45);
    if (run && same) run.winds.push(wind);
    else runs.push({ winds: [wind], date });
  }
  if (!runs.length) return null;
  // A run of one direction keeps NEA's name for it; a mix is named by its average, to the nearest of eight points.
  const names = runs.map(({ winds }) =>
    winds.every((w) => w.code === winds[0].code)
      ? forecastName(winds[0])
      : compassName(meanBearing(winds.map((w) => /** @type {number} */ (w.from)))),
  );
  const next = `the next ${f.days.length === 1 ? 'day' : `${f.days.length} days`}`;
  const lead = f.next24h && next24hLabel(f.next24h).toLowerCase();
  const span = !f.days.length ? 'the next 24 hours' : lead ? `${lead} and ${next}` : next;
  if (runs.length === 1) return `NEA expects ${windsPhrase(names[0])} for ${span}.`;
  const turnDate = runs[1].date;
  if (runs.length === 2 && turnDate) {
    return `NEA expects ${windsPhrase(names[0])}, turning ${names[1]} from ${dayName(turnDate, now)}.`;
  }
  return `NEA expects the wind to change direction over ${span}.`;
}

/**
 * During a haze episode (some 24-hour PSI above 100), whether NEA's forecast wind would blow in from
 * Sumatra. Our reading, not NEA's, and the copy says so. Null otherwise.
 * @param {Forecast | null} f
 * @param {number | null | undefined} psi24h the worst region's
 * @param {number} [now] to name days
 * @returns {string | null}
 */
export function forecastSmokeLine(f, psi24h, now = Date.now()) {
  const band = psiBand(psi24h)?.id;
  if (!f || !band || band === 'good' || band === 'moderate') return null;
  const first = allWinds(f).find(({ wind }) => wind.from != null && fromSumatra(wind.from));
  if (!first) return null;
  const when = first.date ? `from ${dayName(first.date, now)}` : f.next24h && next24hLabel(f.next24h).toLowerCase();
  return `With winds from the ${forecastName(first.wind)} ${when}, smoke from fires in Sumatra may blow in. That’s our reading, not NEA’s.`;
}
