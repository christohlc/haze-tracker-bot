// @ts-check
// NEA's regional haze map for the Mini App's Where it's coming from card, cached in state('hazemap').
// Fetched only when someone opens the Outlook tab, never by the tick. The links come from
// haze.gov.sg's homepage, not a documented API, so each layer may go missing on its own.

import { cachedFeed } from './feed-cache.js';
import { errorText, getText } from './http.js';
import { fileDate, HAZE_HOME, parseHaze, parseHome, parseHotspots, parseWind } from './hazemap-parse.js';

// NEA redraws the map once or twice a day.
const HAZEMAP_EVERY_S = 30 * 60;

/** @typedef {import('./hazemap-parse.js').HazeMap} HazeMap */

/** The latest map, or the last we got if haze.gov.sg is down (null if never). Never throws. */
export function getHazeMap() {
  return cachedFeed('hazemap', HAZEMAP_EVERY_S, 'nea_hazemap', async () => {
    const home = parseHome(await getText(HAZE_HOME, 'haze.gov.sg'));
    /** @type {string[]} */
    const failed = [];
    /** @template T @param {string} label @param {string | null} url @param {(kml: string, url: string) => T | null} parse */
    const layer = async (label, url, parse) => {
      if (!url) return failed.push(`${label}: no link on haze.gov.sg`), null;
      try {
        const value = parse(await getText(url, label), url);
        if (!value) failed.push(`${label}: nothing we could read`);
        return value;
      } catch (e) {
        failed.push(`${label}: ${errorText(e)}`);
        return null;
      }
    };
    const [hotspots, haze, wind] = await Promise.all([
      layer('Hotspots', home.hotspotsUrl, (kml, url) => parseHotspots(kml, fileDate(url))),
      layer('Haze areas', home.hazeUrl, (kml, url) => parseHaze(kml, fileDate(url))),
      layer('Wind', home.windUrl, parseWind),
    ]);
    /** @type {HazeMap} */
    const value = { hotspots, haze, wind, situation: home.situation, outlook: home.outlook, updatedAt: home.updatedAt };
    if (!hotspots && !haze && !wind && !home.situation) throw new Error(failed.join('; ') || 'Nothing we could read');
    return {
      value,
      error: failed.join('; ') || undefined,
      detail: `${hotspots?.total ?? 0} hotspots, ${(haze?.dense.length ?? 0) + (haze?.moderate.length ?? 0)} haze areas`,
    };
  });
}
