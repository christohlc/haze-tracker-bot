// @ts-check
// Shared bits for modules that fetch outside feeds.

import { fetch } from 'sdk';
import { retryOnce } from './fetch-retry.js';

export const USER_AGENT = 'Mozilla/5.0 (compatible; HazeTrackerBot)';

/** @param {unknown} e */
export const errorText = (e) => (e instanceof Error ? e.message : String(e));

/**
 * GET `url` with our user agent, retrying once if no response came; throws `${what} ${status}`
 * unless the response is ok.
 * @param {string} url
 * @param {string} [what] prefix for the HTTP error
 * @param {number} [retryUntil] see retryOnce()
 */
async function get(url, what = 'HTTP', retryUntil) {
  const res = await retryOnce(() => fetch(url, { headers: { 'user-agent': USER_AGENT } }), retryUntil);
  if (!res.ok) throw new Error(`${what} ${res.status}`);
  return res;
}

/** @param {string} url @param {string} [what] @param {number} [retryUntil] see get() */
export async function getJson(url, what, retryUntil) {
  return (await get(url, what, retryUntil)).json();
}

/** @param {string} url @param {string} [what] see get() */
export async function getText(url, what) {
  return (await get(url, what)).text();
}
