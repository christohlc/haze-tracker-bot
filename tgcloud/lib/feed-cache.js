// @ts-check
// Feeds fetched only when the Mini App asks for them, kept in the state table.

import { db } from 'sdk';
import { inArray } from 'sdk/db';
import { state } from '../schema.js';
import { errorText } from './http.js';
import { claimEvery, recordSource, setState } from './store.js';

/**
 * The feed kept in state(key) as `{ [key]: value }`, refetched at most once per `everyS` seconds:
 * the attempt is claimed in state(key_attempt) first (atomically, claimEvery), so Mini Apps opened
 * together, or a feed that's down, cost one fetch. `load` throws when it gets nothing, and returns `error` with a
 * value it only partly got. Falls back to the stored copy (null if never). Never throws.
 * @template T
 * @param {string} key @param {number} everyS @param {string} source for recordSource
 * @param {() => Promise<{ value: T, error?: string, detail?: string }>} load
 * @returns {Promise<T | null>}
 */
export async function cachedFeed(key, everyS, source, load) {
  const attemptKey = `${key}_attempt`;
  let cached = null;
  try {
    // One read for both rows: a warm hit costs a single query.
    const rows = await db.select().from(state).where(inArray(state.key, [key, attemptKey])).all();
    const attempt = rows.find((r) => r.key === attemptKey);
    cached = rows.find((r) => r.key === key)?.value?.[key] ?? null;
    if (attempt && Date.now() / 1000 - attempt.updatedAt < everyS) return cached; // skips the claim's write
    if (!(await claimEvery(attemptKey, everyS))) return cached; // someone else is fetching it
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
