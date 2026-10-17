// @ts-check
// Keep the DB's snapshot current. The tick calls refreshNeaIfDue(); chat commands and the Mini
// App call getSnapshot(), which does the same, so a new NEA hour shows within minutes of NEA
// publishing it, whoever asks first (the tick only runs every 15 min, and can be late).

import { getLatestPsi, getPm25History } from './nea.js';
import { buildSnapshot, neaRefetchEveryS } from './snapshot.js';
import { HISTORY_HOURS, latestRange } from './range.js';
import { claimEvery, getState, getStates, lastHours, recentReadings, recordSource, setState, upsertReadings } from './store.js';

const STALE_MS = 80 * 60_000; // NEA publishes ~15 min past the hour
/** A refetch someone is waiting for gets one try (the platform's fetch gives up after ~5 s): no retry. */
const ONE_TRY_MS = 5_000;

/**
 * Fetch NEA, store readings and the new snapshot. Feed errors are recorded, not thrown, if cached data exists.
 * @param {number} [deadline] see retryOnce() in fetch-retry.js
 */
export async function refreshNea(deadline) {
  await claimEvery('last_fetch_attempt', 0); // always granted: Mini Apps don't refetch right after
  const [pm25, psi] = await Promise.allSettled([getPm25History(deadline), getLatestPsi(deadline)]);

  if (pm25.status === 'fulfilled') {
    await upsertReadings(pm25.value);
    await recordSource('nea_pm25', { ok: true, detail: `latest ${pm25.value.at(-1)?.timestamp}` });
  } else {
    await recordSource('nea_pm25', { ok: false, error: pm25.reason?.message ?? pm25.reason });
  }
  if (psi.status === 'fulfilled') {
    const { psi_twenty_four_hourly, pm25_twenty_four_hourly } = psi.value.readings;
    const latest = { timestamp: psi.value.timestamp, readings: { psi_twenty_four_hourly, pm25_twenty_four_hourly } };
    await setState('psi', latest);
    await recordSource('nea_psi', { ok: true, detail: `latest ${psi.value.timestamp}` });
  } else {
    await recordSource('nea_psi', { ok: false, error: psi.reason?.message ?? psi.reason });
  }

  // One read for the snapshot (the last 25 hours) and the range (two weeks).
  const [rows, states] = await Promise.all([recentReadings(HISTORY_HOURS), getStates(['psi'])]);
  const psiState = states.get('psi')?.value;
  const history = lastHours(rows, 25);
  if (!history.length || !psiState) throw new Error('No NEA data yet (fetch failed and nothing cached)');
  const snap = buildSnapshot(history, psiState);
  // The range is extra: if it can't be stored, the old one ages out (currentRange) and the snapshot still goes.
  await Promise.all([setState('snapshot', snap), saveRange(rows).catch(() => null)]);
  return snap;
}

/** The stored snapshot as it is, or undefined before the first fetch. */
export async function storedSnapshot() {
  return (await getStates(['snapshot'])).get('snapshot')?.value;
}

/**
 * The snapshot, refetched from NEA if it's due (neaRefetchEveryS: every 2 min while NEA's current
 * hour is awaited, every 10 min after for revisions). One caller at a time refetches, across every
 * isolate (claimEvery); the rest get the stored one. Throws only if NEA fails with nothing stored.
 * @param {number} [now] @param {number} [deadline] see retryOnce() in fetch-retry.js
 */
export async function refreshNeaIfDue(now = Date.now(), deadline) {
  // One read for both rows: a snapshot that isn't due costs a single query.
  const rows = await getStates(['snapshot', 'last_fetch_attempt']);
  const stored = rows.get('snapshot')?.value;
  if (!stored) return refreshNea(deadline);
  const every = neaRefetchEveryS(stored.asOf, now);
  const tried = now / 1000 - (rows.get('last_fetch_attempt')?.updatedAt ?? 0) < every;
  if (tried || !(await claimEvery('last_fetch_attempt', every))) return stored;
  return refreshNea(deadline).catch(() => stored);
}

/** Latest snapshot, refetched if due (one try). `stale: true` means NEA couldn't be reached for a while. */
export async function getSnapshot() {
  const snap = await refreshNeaIfDue(Date.now(), Date.now() + ONE_TRY_MS);
  return { ...snap, stale: Date.now() - Date.parse(snap.asOf) >= STALE_MS };
}

/**
 * Work the next-hours range out from two weeks of readings and keep it in state('range'), so a
 * request reads one row instead of 336. `rows` if the caller has just read them (the last
 * HISTORY_HOURS). Called when the readings change: a refetch, a backfill.
 * @param {Array<{ timestamp: string, readings: Record<string, number> }>} [rows]
 */
export async function saveRange(rows) {
  const stored = latestRange(rows ?? (await recentReadings(HISTORY_HOURS)));
  await setState('range', stored);
  return stored;
}

/** The stored range (currentRange() checks its age), worked out now if none was stored yet. */
export async function storedRange() {
  const row = await getState('range');
  return row ? row.value : saveRange();
}
