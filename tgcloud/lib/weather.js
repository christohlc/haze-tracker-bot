// @ts-check
// NEA's wind and rain for the Mini App's Wind and rain card, cached in state('weather').
// Fetched only when someone opens the Mini App, never by the tick.

import { cachedFeed } from './feed-cache.js';
import { errorText, getJson } from './http.js';
import { parseStations, summariseWeather, WEATHER_FEEDS } from './weather-parse.js';

// Wind updates every minute and rain every 5; 5 minutes keeps three feeds inside data.gov.sg's rate limits.
const WEATHER_EVERY_S = 300;

/** @param {string} url */
async function getFeed(url) {
  const stations = parseStations(await getJson(url));
  if (!stations) throw new Error('Feed had no readings we could read');
  return stations;
}

/** The latest wind and rain, or the last we got if the feeds are down (null if never). Never throws. */
export function getWeather() {
  return cachedFeed('weather', WEATHER_EVERY_S, 'nea_weather', async () => {
    // One feed failing still leaves the others: the card shows wind without rain, or the reverse.
    const results = await Promise.allSettled(WEATHER_FEEDS.map((f) => getFeed(f.url)));
    const [dir, speed, rain] = results.map((r) => (r.status === 'fulfilled' ? r.value : null));
    const weather = summariseWeather(dir, speed, rain);
    const failed = results.flatMap((r, i) => (r.status === 'rejected' ? [`${WEATHER_FEEDS[i].label}: ${errorText(r.reason)}`] : []));
    if (!weather) throw new Error(failed.join('; ') || 'No readings');
    return {
      value: weather,
      error: failed.join('; ') || undefined,
      detail: `${weather.wind?.stations ?? 0} wind, ${weather.rain?.stations ?? 0} rain stations`,
    };
  });
}
