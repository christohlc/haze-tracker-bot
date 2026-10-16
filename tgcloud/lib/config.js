// @ts-check
// Public, non-secret settings. Secrets (e.g. the FIRMS key) live in the DB `settings` table.

/** Mini App host printed by `tgcloud push` (the app id is public). */
export const MINI_APP_URL = 'https://app8809761337.tgcloud.ai/';

/** data.gov.sg's v2 real-time API, where NEA's readings come from. */
export const NEA_API = 'https://api-open.data.gov.sg/v2/real-time/api';

/** Region ids as NEA names them, in the order the site lists them, at NEA's label point (the PSI feed's regionMetadata). */
export const REGIONS = [
  { id: 'north', name: 'North', lat: 1.41803, lon: 103.82 },
  { id: 'west', name: 'West', lat: 1.35735, lon: 103.7 },
  { id: 'central', name: 'Central', lat: 1.35735, lon: 103.82 },
  { id: 'east', name: 'East', lat: 1.35735, lon: 103.94 },
  { id: 'south', name: 'South', lat: 1.29587, lon: 103.82 },
];

/** @type {Record<string, string>} */
export const REGION_NAMES = Object.fromEntries(REGIONS.map((r) => [r.id, r.name]));
