// @ts-check
// Thin DB helpers over schema.js.

import { db } from 'sdk';
import { and, desc, eq, gte, lt } from 'sdk/db';
import { readings, settings, sourceStatus, state } from '../schema.js';
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

/**
 * Every alert scope's current band (alert-rules.js ALERT_SCOPES), in one state row. Before regions
 * there was only the highest region's, in 'alert_band'; it carries over until the first tick.
 * @returns {Promise<Record<string, import('./alert-rules.js').AlertBand>>}
 */
export async function getAlertBands() {
  const bands = (await getState('alert_bands'))?.value;
  if (bands) return bands;
  const legacy = (await getState('alert_band'))?.value;
  return legacy ? { highest: legacy } : {};
}

/** @param {Record<string, import('./alert-rules.js').AlertBand>} bands */
export const setAlertBands = (bands) => setState('alert_bands', bands);

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

/** Readings with `from` ≤ hour < `to` (unix seconds). @param {number} from @param {number} to */
export async function countReadingsBetween(from, to) {
  return db.$count(readings, and(gte(readings.hour, from), lt(readings.hour, to)));
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
