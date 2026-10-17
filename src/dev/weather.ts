// Dev-only wind and rain for the Wind and rain card (see loadWeather in lib/api.ts).
import { REGIONS } from '../../tgcloud/lib/config.js';
import { parseStations, summariseWeather, type RegionId } from '../../tgcloud/lib/weather-parse.js';
import { parse24h, parse4day, type Forecast } from '../../tgcloud/lib/forecast-parse.js';
import { sgtDateOf } from '../../tgcloud/lib/time.js';
import type { WeatherResult } from '../lib/api';
import day from '../../test/forecast-24h.json';
import days from '../../test/forecast-4day.json';
import dir from '../../test/weather-wind-direction.json';
import speed from '../../test/weather-wind-speed.json';
import rain from '../../test/weather-rainfall.json';

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

/** The SGT date `n` days from now. */
const dayFromNow = (n: number) => sgtDateOf(Date.now() + n * 86_400_000);

/** NEA's real forecast from 17 Oct 2026 (SSE today, then SSE, SE, SE, ESE), re-dated to start today. */
function demoForecast(): Forecast {
  const today = parse24h(day)!;
  const next = parse4day(days)!;
  return {
    issuedAt: ago(95),
    next24h: { ...today.next24h, until: new Date(Date.now() + 20 * 3_600_000).toISOString() },
    days: next.days.map((d, i) => ({ ...d, date: dayFromNow(i + 1) })),
  };
}

/** NEA's real readings from 16 Oct 2026, re-timed to a minute ago, and its forecast from the 17th. */
export function demoWeather(): WeatherResult {
  const weather = summariseWeather(parseStations(dir), parseStations(speed), parseStations(rain));
  return { weather: weather && { ...weather, takenAt: ago(1) }, forecast: demoForecast(), serverTime: Date.now() };
}

/**
 * Calm, shifting wind, rain everywhere, and readings 40 minutes old. The forecast has no 24-hour
 * part and keeps changing, through variable winds to the south-southwest that bring the smoke line.
 */
export function worstWeather(): WeatherResult {
  const codes: Array<[string, number | null]> = [['WNW', 292.5], ['VAR', null], ['SSW', 202.5], ['NE', 45]];
  return {
    weather: {
      takenAt: ago(40),
      wind: { from: 212, kmh: 2, steady: false, stations: 3 },
      rain: { raining: REGIONS.map((r) => r.id as RegionId), stations: 90 },
    },
    forecast: {
      issuedAt: ago(26 * 60),
      next24h: null,
      days: codes.map(([code, from], i) => ({ date: dayFromNow(i + 1), wind: { code, from } })),
    },
    serverTime: Date.now(),
  };
}

/** Wind, but the rain feed failed. */
export function partialWeather(): WeatherResult {
  const { weather, serverTime } = demoWeather();
  return { weather: weather && { ...weather, rain: null }, serverTime };
}
