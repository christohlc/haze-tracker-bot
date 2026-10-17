// @ts-check
// NEA's wind forecast for the Mini App's Wind and rain card. Each feed has its own state row
// (forecast24h, forecast4day), so one feed failing never wipes the other's stored copy.
// Fetched only when someone opens the Mini App, never by the tick.

import { cachedFeed } from './feed-cache.js';
import { getJson } from './http.js';
import { combineForecast, FORECAST_24H_FEED, FORECAST_4DAY_FEED, parse24h, parse4day } from './forecast-parse.js';

// NEA reissues the 24-hour forecast a few times a day and the 4-day outlook about twice; these keep
// both well inside data.gov.sg's rate limits alongside the weather feeds.
const FORECAST_24H_EVERY_S = 30 * 60;
const FORECAST_4DAY_EVERY_S = 2 * 3600;

/**
 * One feed through cachedFeed; throws (so the stored copy stays) when it has no wind we can read.
 * @template T
 * @param {string} key @param {number} everyS @param {string} url @param {string} what
 * @param {(json: any) => (T & { issuedAt: string }) | null} parse
 */
function cachedForecast(key, everyS, url, what, parse) {
  return cachedFeed(key, everyS, `nea_${key}`, async () => {
    const value = parse(await getJson(url, what));
    if (!value) throw new Error(`${what} had no wind forecast we could read`);
    return { value, detail: `issued ${value.issuedAt}` };
  });
}

/** NEA's wind forecast, or the last we got of each part if a feed is down (null if never, or all past). Never throws. */
export async function getForecast() {
  const [next24h, outlook] = await Promise.all([
    cachedForecast('forecast24h', FORECAST_24H_EVERY_S, FORECAST_24H_FEED, 'NEA 24-hour forecast', parse24h),
    cachedForecast('forecast4day', FORECAST_4DAY_EVERY_S, FORECAST_4DAY_FEED, 'NEA 4-day outlook', parse4day),
  ]);
  return combineForecast(next24h, outlook);
}
