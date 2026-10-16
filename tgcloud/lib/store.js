// @ts-check
// Thin DB helpers over schema.js.

import { db } from 'sdk';
import { desc, eq, gte, inArray } from 'sdk/db';
import { readings, settings, sourceStatus, state } from '../schema.js';
import { errorText } from './http.js';
import { toSgtIso } from './time.js';

const nowSec = () => Math.floor(Date.now() / 1000);

export async function getState(key) {
  const row = await db.select().from(state).where(eq(state.key, key)).get();
  return row ? { value: row.value, updatedAt: row.updatedAt } : null;
}

export async function setState(key, value) {
  const updatedAt = nowSec();
  await db
    .insert(state)
    .values({ key, value, updatedAt })
    .onConflictDoUpdate({ target: state.key, set: { value, updatedAt } })
    .run();
}

export async function getSetting(key) {
  return (await db.select().from(settings).where(eq(settings.key, key)).get())?.value ?? null;
}

export async function setSetting(key, value) {
  await db.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } }).run();
}

export async function deleteSetting(key) {
  await db.delete(settings).where(eq(settings.key, key)).run();
}

/** @param {Array<{ timestamp: string, readings: Record<string, number> }>} items */
export async function upsertReadings(items) {
  const fetchedAt = nowSec();
  for (const item of items) {
    const hour = Math.floor(Date.parse(item.timestamp) / 1000);
    await db
      .insert(readings)
      .values({ hour, pm25: item.readings, fetchedAt })
      .onConflictDoUpdate({ target: readings.hour, set: { pm25: item.readings, fetchedAt } })
      .run();
  }
}

/** Last `hours` of readings, oldest first, in NEA's item shape (timestamps in SGT). */
export async function recentReadings(hours = 25) {
  const since = nowSec() - (hours + 2) * 3600;
  const rows = await db.select().from(readings).where(gte(readings.hour, since)).orderBy(desc(readings.hour)).limit(hours).all();
  return rows.reverse().map((r) => ({ timestamp: toSgtIso(r.hour), readings: r.pm25 }));
}

export async function countReadings() {
  return db.$count(readings);
}

export { toSgtIso } from './time.js';

export async function recordSource(source, result) {
  const at = nowSec();
  const set = result.ok
    ? { lastOkAt: at, detail: result.detail ?? null }
    : { lastErrorAt: at, lastError: String(result.error).slice(0, 500) };
  await db.insert(sourceStatus).values({ source, ...set }).onConflictDoUpdate({ target: sourceStatus.source, set }).run();
}

export async function allSourceStatus() {
  return db.select().from(sourceStatus).all();
}

/**
 * A feed fetched only when asked for, at most once per `everyS` seconds, kept in state(key) as
 * `{ [key]: value }`. The attempt is claimed in state(key_attempt) before fetching, so Mini Apps
 * opened together, or a feed that's down, cost one fetch per `everyS`. `load` returns the new
 * value, with `error` for a partial failure (the value is still stored) and `detail` for the
 * source's status; throwing counts as a failure. Returns the stored copy when there's nothing
 * new (null if never). Never throws.
 * @template T
 * @param {string} key @param {number} everyS @param {string} source for recordSource
 * @param {() => Promise<{ value: T | null, error?: string, detail?: string }>} load
 * @returns {Promise<T | null>}
 */
export async function cachedFeed(key, everyS, source, load) {
  const attemptKey = `${key}_attempt`;
  let cached = null;
  try {
    // One read for both rows: a warm hit costs a single query.
    const rows = await db.select().from(state).where(inArray(state.key, [key, attemptKey])).all();
    const stored = rows.find((r) => r.key === key);
    const attempt = rows.find((r) => r.key === attemptKey);
    cached = stored?.value?.[key] ?? null;
    if (attempt && nowSec() - attempt.updatedAt < everyS) return cached;
    await setState(attemptKey, {});
    /** @type {{ value: T | null, error?: string, detail?: string }} */
    let result;
    try {
      result = await load();
    } catch (e) {
      result = { value: null, error: errorText(e) };
    }
    const { value, error, detail } = result;
    const status = error || value == null ? { ok: false, error: error || 'No data' } : { ok: true, detail };
    await Promise.all([value != null && setState(key, { [key]: value }), recordSource(source, status)]);
    return value ?? cached;
  } catch {
    return cached;
  }
}
