// @ts-check
// LTA's traffic cameras from data.gov.sg. Pure (no sdk) so tests and the Mini App can load it;
// lib/cameras.js does the fetching and caching.
// Since 30 June 2026 LTA runs only the cameras at Woodlands and Tuas Checkpoints and Sentosa Gateway.

import { REGIONS } from './config.js';

export const CAMERAS_FEED = 'https://api.data.gov.sg/v1/transport/traffic-images';

/** @typedef {'north' | 'west' | 'central' | 'east' | 'south'} RegionId */

/**
 * The feed has no names, so these are OneMotoring's labels for each camera id.
 * @type {Record<string, { name: string, region: RegionId }>}
 */
export const CAMERAS = {
  2701: { name: 'Woodlands Causeway, towards Johor', region: 'north' },
  2702: { name: 'Woodlands Checkpoint, towards BKE', region: 'north' },
  2704: { name: 'Woodlands Flyover, towards Checkpoint', region: 'north' },
  4703: { name: 'Second Link at Tuas', region: 'west' },
  4712: { name: 'After Tuas West Road', region: 'west' },
  4713: { name: 'Tuas Checkpoint', region: 'west' },
  4798: { name: 'Sentosa Gateway, towards Telok Blangah', region: 'south' },
  4799: { name: 'Sentosa Gateway, towards Sentosa', region: 'south' },
};

const REGION_ORDER = REGIONS.map((r) => r.id);

// Only pictures on data.gov.sg's own image host get through to the Mini App.
const IMAGE_URL = /^https:\/\/images\.data\.gov\.sg\/[^\s"'<>]+$/;

/**
 * The feed's cameras, by region in NEA's order, then by id. Never throws.
 * @param {any} json
 * @returns {Array<{ id: string, name: string, region: RegionId | null, image: string, takenAt: string }>}
 */
export function parseCameras(json) {
  const list = json?.items?.[0]?.cameras;
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const c of list) {
    const id = String(c?.camera_id ?? '');
    const image = typeof c?.image === 'string' ? c.image : '';
    const takenAt = typeof c?.timestamp === 'string' && Number.isFinite(Date.parse(c.timestamp)) ? c.timestamp : '';
    if (!id || !IMAGE_URL.test(image) || !takenAt) continue;
    const known = CAMERAS[id];
    out.push({ id, name: known?.name ?? `Camera ${id}`, region: known?.region ?? null, image, takenAt });
  }
  const rank = (/** @type {RegionId | null} */ r) => (r ? REGION_ORDER.indexOf(r) : REGION_ORDER.length);
  return out.sort((a, b) => rank(a.region) - rank(b.region) || a.id.localeCompare(b.id));
}
