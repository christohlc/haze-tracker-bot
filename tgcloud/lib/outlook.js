// @ts-check
// NEA's 24-hr PSI forecast, cached in state('outlook'). Fetched when someone asks (/haze, /forecast,
// the Mini App, and the tick only when a daily update is due): NEA issues it once a day at most.

import { cachedFeed, peekFeed } from './feed-cache.js';
import { getJson } from './http.js';
import { isCurrent, OUTLOOK_FEED, parseOutlook } from './outlook-parse.js';

// NEA issues it about 6 pm; checked often enough that it shows within minutes.
const OUTLOOK_EVERY_S = 10 * 60;

/**
 * Today's or tomorrow's forecast, or null when NEA hasn't issued one (outside haze episodes). Never throws.
 * @param {number} [deadline] a caller's time budget (getJson): no retry past it. Every caller has
 *   someone waiting (/haze, /forecast, the dashboard, the tick's alerts), so by default one try.
 */
export async function getOutlook(deadline = 0) {
  const outlook = await cachedFeed('outlook', OUTLOOK_EVERY_S, 'nea_outlook', async () => {
    // The last path segment only busts caches, as on haze.gov.sg.
    const json = await getJson(`${OUTLOOK_FEED}/${Math.floor(Date.now() / 1000)}`, 'NEA haze update', deadline);
    if (typeof json?.BodyText !== 'string') throw new Error('NEA haze update had an unexpected shape');
    const value = parseOutlook(json);
    return { value, detail: value ? `latest for ${value.forDate}` : 'no forecast we could read' };
  });
  return ifCurrent(outlook);
}

/** getOutlook() without fetching: the stored forecast, and `due` if getOutlook() would fetch it now. */
export async function peekOutlook() {
  const { value, due } = await peekFeed('outlook', OUTLOOK_EVERY_S);
  return { outlook: ifCurrent(value), due };
}

// NEA leaves its last update up between episodes, and a stored copy ages while NEA is unreachable.
const ifCurrent = (/** @type {import('./outlook-parse.js').Outlook | null} */ o) => (o && isCurrent(o) ? o : null);
