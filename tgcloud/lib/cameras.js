// @ts-check
// LTA's camera pictures for the Mini App's Live views, cached in state('cameras').
// Fetched only when someone opens the Mini App, never by the tick.

import { fetch } from 'sdk';
import { CAMERAS_FEED, parseCameras } from './cameras-parse.js';
import { errorText, USER_AGENT } from './http.js';
import { getState, recordSource, setState } from './store.js';

// The pictures change about every 20 s; a minute keeps us well inside data.gov.sg's rate limits.
const CAMERAS_EVERY_S = 60;

/** The latest camera pictures, or the last ones we got if the feed is down (null if never). Never throws. */
export async function getCameras() {
  try {
    const [stored, attempt] = await Promise.all([getState('cameras'), getState('cameras_attempt')]);
    const cached = stored?.value?.cameras ?? null;
    // Claimed before fetching, like forecast_attempt: Mini Apps opened together, or a down feed,
    // cost one fetch a minute.
    if (attempt && Date.now() / 1000 - attempt.updatedAt < CAMERAS_EVERY_S) return cached;
    await setState('cameras_attempt', {});
    try {
      const res = await fetch(CAMERAS_FEED, { headers: { 'user-agent': USER_AGENT } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const cameras = parseCameras(await res.json());
      if (!cameras.length) throw new Error('Feed had no camera pictures we could read');
      await Promise.all([setState('cameras', { cameras }), recordSource('lta_cameras', { ok: true, detail: `${cameras.length} cameras` })]);
      return cameras;
    } catch (e) {
      await recordSource('lta_cameras', { ok: false, error: errorText(e) });
      return cached;
    }
  } catch {
    return null;
  }
}
