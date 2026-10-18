// @ts-check
// Feeds fetched only when the Mini App asks for them, kept in the state table.

import { errorText } from './http.js';
import { claimEvery, getStates, recordSource, setState } from './store.js';

/**
 * The feed kept in state(key) as `{ [key]: value }`, refetched at most once per `everyS` seconds:
 * the attempt is claimed in state(key_attempt) first (atomically, claimEvery), so Mini Apps opened
 * together, or a feed that's down, cost one fetch. `load` throws when it gets nothing, and returns
 * `error` with a value it only partly got. Falls back to the stored copy (null if never). Never throws.
 * @template T
 * @param {string} key @param {number} everyS @param {string} source for recordSource
 * @param {() => Promise<{ value: T, error?: string, detail?: string }>} load
 * @returns {Promise<T | null>}
 */
export async function cachedFeed(key, everyS, source, load) {
  let cached = null;
  try {
    const stored = await readFeed(key, everyS);
    cached = stored.value;
    if (!stored.due) return cached; // skips the claim's write
    if (!(await claimEvery(`${key}_attempt`, everyS))) return cached; // someone else is fetching it
    try {
      const { value, error, detail } = await load();
      const status = error ? { ok: false, error } : { ok: true, detail };
      await Promise.all([setState(key, { [key]: value }), recordSource(source, status)]);
      return value;
    } catch (e) {
      await recordSource(source, { ok: false, error: errorText(e) });
      return cached;
    }
  } catch {
    return cached;
  }
}

/**
 * What cachedFeed(key, everyS) would return, without fetching, and `due` if it would fetch now.
 * Never throws.
 * @param {string} key @param {number} everyS
 */
export async function peekFeed(key, everyS) {
  return readFeed(key, everyS).catch(() => ({ value: null, due: true }));
}

/** The stored copy and whether a fetch is due. One read for both rows: a warm hit costs a single query. */
async function readFeed(/** @type {string} */ key, /** @type {number} */ everyS) {
  const rows = await getStates([key, `${key}_attempt`]);
  const attempt = rows.get(`${key}_attempt`);
  const due = !attempt || Date.now() / 1000 - attempt.updatedAt >= everyS;
  return { value: rows.get(key)?.value?.[key] ?? null, due };
}
