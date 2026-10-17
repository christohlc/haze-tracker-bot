// @ts-check
// Shared bits for modules that fetch outside feeds.

import { fetch } from 'sdk';
import { NEA_API } from './config.js';
import { retryOnce } from './fetch-retry.js';
import { getSetting } from './store.js';

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
  const key = url.startsWith(NEA_API) ? await datagovKey() : null;
  const headers = { 'user-agent': USER_AGENT, ...(key && { 'x-api-key': key }) };
  const res = await retryOnce(() => fetch(url, { headers }), deadline);
  if (!res.ok) throw new Error(`${what} ${res.status}`);
  return res;
}

/** How long an isolate keeps the key before reading the setting again, so a new key needs no redeploy. */
const KEY_READ_MS = 10 * 60_000;
/** @type {{ key: Promise<string | null>, at: number } | null} */
let keyRead = null;
/**
 * data.gov.sg's API key, if one is set (admin `datagov_api_key`): it raises the rate limit that
 * NEA's readings sit behind. data.gov.sg answers an unknown or revoked key like no key (17 Oct
 * 2026), so revoking the old one never breaks a fetch.
 */
function datagovKey() {
  if (!keyRead || Date.now() - keyRead.at > KEY_READ_MS) keyRead = { key: getSetting('datagov_api_key').catch(() => null), at: Date.now() };
  return keyRead.key;
}

/** @param {string} url @param {string} [what] @param {number} [deadline] see get() */
export async function getJson(url, what, deadline) {
  return (await get(url, what, deadline)).json();
}

/** @param {string} url @param {string} [what] see get() */
export async function getText(url, what) {
  return (await get(url, what)).text();
}
