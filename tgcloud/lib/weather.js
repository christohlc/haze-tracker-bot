// @ts-check
// NEA's wind and rain for the Mini App's Wind and rain card, cached in state('weather').
// Fetched only when someone opens the Mini App, never by the tick.

import { fetch } from 'sdk';
import { errorText, USER_AGENT } from './http.js';
import { getState, recordSource, setState } from './store.js';
import { parseStations, summariseWeather, WEATHER_FEEDS } from './weather-parse.js';

// Wind updates every minute and rain every 5; 5 minutes keeps three feeds inside data.gov.sg's rate limits.
const WEATHER_EVERY_S = 300;

/** @param {string} url */
async function getFeed(url) {
  const res = await fetch(url, { headers: { 'user-agent': USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const stations = parseStations(await res.json());
  if (!stations) throw new Error('Feed had no readings we could read');
  return stations;
}

/** The latest wind and rain, or the last we got if the feeds are down (null if never). Never throws. */
export async function getWeather() {
  let cached = null;
  try {
    const [stored, attempt] = await Promise.all([getState('weather'), getState('weather_attempt')]);
    cached = stored?.value?.weather ?? null;
    // Claimed before fetching, like cameras_attempt.
    if (attempt && Date.now() / 1000 - attempt.updatedAt < WEATHER_EVERY_S) return cached;
    await setState('weather_attempt', {});
    // One feed failing still leaves the others: the card shows wind without rain, or the reverse.
    const results = await Promise.allSettled(WEATHER_FEEDS.map((f) => getFeed(f.url)));
    const [dir, speed, rain] = results.map((r) => (r.status === 'fulfilled' ? r.value : null));
    const weather = summariseWeather(dir, speed, rain);
    const failed = results.flatMap((r, i) => (r.status === 'rejected' ? [`${WEATHER_FEEDS[i].label}: ${errorText(r.reason)}`] : []));
    const status = failed.length || !weather
      ? { ok: false, error: failed.join('; ') || 'No readings' }
      : { ok: true, detail: `${weather.wind?.stations ?? 0} wind, ${weather.rain?.stations ?? 0} rain stations` };
    await Promise.all([weather && setState('weather', { weather }), recordSource('nea_weather', status)]);
    return weather ?? cached;
  } catch {
    return cached;
  }
}
