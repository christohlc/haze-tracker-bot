// @ts-check
// LTA's camera pictures for the Mini App's Live views, cached in state('cameras').
// Fetched only when someone opens the Mini App, never by the tick.

import { CAMERAS_FEED, parseCameras } from './cameras-parse.js';
import { cachedFeed } from './feed-cache.js';
import { getJson } from './http.js';

// The pictures change about every 20 s; a minute keeps us well inside data.gov.sg's rate limits.
const CAMERAS_EVERY_S = 60;

/** The latest camera pictures, or the last ones we got if the feed is down (null if never). Never throws. */
export function getCameras() {
  return cachedFeed('cameras', CAMERAS_EVERY_S, 'lta_cameras', async () => {
    const cameras = parseCameras(await getJson(CAMERAS_FEED));
    if (!cameras.length) throw new Error('Feed had no camera pictures we could read');
    return { value: cameras, detail: `${cameras.length} cameras` };
  });
}
