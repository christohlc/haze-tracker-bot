// @ts-check
// NEA's wind forecast for the Mini App's Wind and rain card, cached in state('forecast').
// Fetched only when someone opens the Mini App, never by the tick.

import { cachedFeed } from './feed-cache.js';
import { errorText, getJson } from './http.js';
import { combineForecast, currentForecast, FORECAST_FEEDS, parse24h, parse4day } from './forecast-parse.js';

// NEA reissues the 24-hour forecast a few times a day and the 4-day outlook about twice;
// 30 minutes keeps the two feeds well inside data.gov.sg's rate limits.
const FORECAST_EVERY_S = 30 * 60;

/**
 * @template T
 * @param {number} i index into FORECAST_FEEDS @param {(json: any) => T | null} parse
 * @returns {Promise<T>}
 */
async function getFeed(i, parse) {
  const { url, label } = FORECAST_FEEDS[i];
  const parsed = parse(await getJson(url, `NEA ${label}`));
  if (!parsed) throw new Error('Feed had no wind forecast we could read');
  return parsed;
}

/** NEA's wind forecast, or the last we got if the feeds are down (null if never, or all past). Never throws. */
export async function getForecast() {
  const forecast = await cachedFeed('forecast', FORECAST_EVERY_S, 'nea_forecast', async () => {
    // One feed failing still leaves the other: today's wind without the next days, or the reverse.
    const results = await Promise.allSettled([getFeed(0, parse24h), getFeed(1, parse4day)]);
    const [day, days] = results;
    const value = combineForecast(day.status === 'fulfilled' ? day.value : null, days.status === 'fulfilled' ? days.value : null);
    const failed = results.flatMap((r, i) => (r.status === 'rejected' ? [`${FORECAST_FEEDS[i].label}: ${errorText(r.reason)}`] : []));
    if (!value) throw new Error(failed.join('; ') || 'No forecast');
    return { value, error: failed.join('; ') || undefined, detail: `issued ${value.issuedAt}` };
  });
  return currentForecast(forecast);
}
