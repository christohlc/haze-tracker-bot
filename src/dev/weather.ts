// Dev-only wind and rain for the Wind and rain card (see loadWeather in lib/api.ts).
import { REGIONS } from '../../tgcloud/lib/config.js';
import { parseStations, summariseWeather, type RegionId } from '../../tgcloud/lib/weather-parse.js';
import type { WeatherResult } from '../lib/api';
import dir from '../../test/weather-wind-direction.json';
import speed from '../../test/weather-wind-speed.json';
import rain from '../../test/weather-rainfall.json';

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

/** NEA's real readings from 16 Oct 2026, re-timed to a minute ago. */
export function demoWeather(): WeatherResult {
  const weather = summariseWeather(parseStations(dir), parseStations(speed), parseStations(rain));
  return { weather: weather && { ...weather, takenAt: ago(1) }, serverTime: Date.now() };
}

/** Calm, shifting wind, rain everywhere, and readings 40 minutes old. */
export function worstWeather(): WeatherResult {
  return {
    weather: {
      takenAt: ago(40),
      wind: { from: 212, kmh: 2, steady: false, stations: 3 },
      rain: { raining: REGIONS.map((r) => r.id as RegionId), stations: 90 },
    },
    serverTime: Date.now(),
  };
}

/** Wind, but the rain feed failed. */
export function partialWeather(): WeatherResult {
  const { weather, serverTime } = demoWeather();
  return { weather: weather && { ...weather, rain: null }, serverTime };
}
