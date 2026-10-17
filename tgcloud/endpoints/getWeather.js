// @ts-check
// endpoints/getWeather.js — NEA's measured wind and rain, and its wind forecast, for the Wind and rain card.
// Separate from getDashboard so a slow weather feed never holds up the PSI.

import { getForecast } from '../lib/forecast.js';
import { getWeather } from '../lib/weather.js';

export default async function () {
  const [weather, forecast] = await Promise.all([getWeather(), getForecast()]);
  return { weather, forecast, serverTime: Date.now() };
}
