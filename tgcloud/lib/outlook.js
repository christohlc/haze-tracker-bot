// @ts-check
// NEA's 24-hr PSI forecast, cached in state('outlook'). Fetched when someone asks (/haze, /forecast,
// the Mini App), never by the tick: NEA issues it once a day at most.

import { cachedFeed } from './feed-cache.js';
import { getJson } from './http.js';
import { OUTLOOK_FEED, parseOutlook } from './outlook-parse.js';
import { sgtToday } from './time.js';

const OUTLOOK_EVERY_S = 30 * 60;

/** Today's or tomorrow's forecast, or null when NEA hasn't issued one (outside haze episodes). Never throws. */
export async function getOutlook() {
  const outlook = await cachedFeed('outlook', OUTLOOK_EVERY_S, 'nea_outlook', async () => {
    const json = await getJson(`${OUTLOOK_FEED}/${Math.floor(Date.now() / 1000)}`, 'NEA haze update');
    if (typeof json?.BodyText !== 'string') throw new Error('NEA haze update had an unexpected shape');
    const value = parseOutlook(json);
    return { value, detail: value ? `for ${value.forDate}` : 'no forecast issued' };
  });
  // The stored copy can pass its day while NEA is unreachable.
  return outlook && outlook.forDate >= sgtToday() ? outlook : null;
}
