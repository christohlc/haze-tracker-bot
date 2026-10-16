// @ts-check
// Shared bits for modules that fetch outside feeds.

import { fetch } from 'sdk';

export const USER_AGENT = 'Mozilla/5.0 (compatible; HazeTrackerBot)';

/** @param {unknown} e */
export const errorText = (e) => (e instanceof Error ? e.message : String(e));

/** GET `url`; throws `${what} ${status}` unless the response is ok. */
async function get(url, what = 'HTTP') {
  const res = await fetch(url, { headers: { 'user-agent': USER_AGENT } });
  if (!res.ok) throw new Error(`${what} ${res.status}`);
  return res;
}

/** GET `url` and parse it as JSON. @param {string} url @param {string} [what] prefix for the HTTP error */
export async function getJson(url, what) {
  return (await get(url, what)).json();
}

/** GET `url` as text. @param {string} url @param {string} [what] prefix for the HTTP error */
export async function getText(url, what) {
  return (await get(url, what)).text();
}
