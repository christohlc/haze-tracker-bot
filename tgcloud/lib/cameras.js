// @ts-check
// LTA's camera pictures for the Mini App's Live views, cached in state('cameras') for a minute.
// Fetched only when someone opens the Mini App, never by the tick.

import { fetch } from 'sdk';
import { CAMERAS_FEED, parseCameras } from './cameras-parse.js';
import { getState, recordSource, setState } from './store.js';

/** @param {unknown} e */
const errorText = (e) => (e instanceof Error ? e.message : String(e));

// The pictures change about every 20 s; a minute keeps us well inside data.gov.sg's rate limits.
const CAMERAS_EVERY_S = 60;

/** The latest camera pictures, or the last ones we got if the feed is down (null if never). Never throws. */
export async function getCameras() {
  const prev = await getState('cameras');
  if (prev && Date.now() / 1000 - prev.updatedAt < CAMERAS_EVERY_S) return prev.value.cameras;
  try {
    const res = await fetch(CAMERAS_FEED, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; HazeTrackerBot)' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const cameras = parseCameras(await res.json());
    if (!cameras.length) throw new Error('Feed had no camera pictures we could read');
    await Promise.all([
      setState('cameras', { cameras }),
      recordSource('lta_cameras', { ok: true, detail: `${cameras.length} cameras` }),
    ]);
    return cameras;
  } catch (e) {
    await recordSource('lta_cameras', { ok: false, error: errorText(e) }).catch(() => {});
    return prev?.value?.cameras ?? null;
  }
}
