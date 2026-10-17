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
 * @param {number} [deadline] see retryOnce()
 */
async function get(url, what = 'HTTP', deadline) {
  const res = await retryOnce(() => fetch(url, { headers: { 'user-agent': USER_AGENT } }), deadline);
  if (!res.ok) throw new Error(`${what} ${res.status}`);
  return res;
}

/** @param {string} url @param {string} [what] @param {number} [deadline] see get() */
export async function getJson(url, what, deadline) {
  return (await get(url, what, deadline)).json();
}

/** @param {string} url @param {string} [what] see get() */
export async function getText(url, what) {
  return (await get(url, what)).text();
}
