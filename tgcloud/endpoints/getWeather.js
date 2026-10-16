// @ts-check
// endpoints/getWeather.js — NEA's measured wind and rain for the Wind and rain card.
// Separate from getDashboard so a slow weather feed never holds up the PSI.

import { getWeather } from '../lib/weather.js';

export default async function () {
  return { weather: await getWeather(), serverTime: Date.now() };
}
