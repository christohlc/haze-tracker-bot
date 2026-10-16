// @ts-check
// Public, non-secret settings. Secrets (e.g. the FIRMS key) live in the DB `settings` table.

/** Mini App host printed by `tgcloud push` (the app id is public). */
export const MINI_APP_URL = 'https://app8809761337.tgcloud.ai/';

/** Region ids as NEA names them, in the order the site lists them. */
export const REGIONS = [
  { id: 'north', name: 'North' },
  { id: 'west', name: 'West' },
  { id: 'central', name: 'Central' },
  { id: 'east', name: 'East' },
  { id: 'south', name: 'South' },
];
