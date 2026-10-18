// @ts-check
// Keep the DB's snapshot current. The tick calls refreshNeaIfDue(); chat commands and the Mini
// App call getSnapshot(), which does the same, so a new NEA hour shows within minutes of NEA
// publishing it, whoever asks first (the tick only runs every 15 min, and can be late).

import { getLatestPsi, getPm25History } from './nea.js';
import { buildSnapshot, isStale, neaRefetchEveryS, REVISED_EVERY_S, USER_REVISED_EVERY_S } from './snapshot.js';
import { HISTORY_HOURS, latestRange } from './range.js';
import { claimEvery, getState, getStates, lastHours, recentReadings, recordSource, setState, upsertReadings } from './store.js';
import { sgtDateOf, sgtDayStart, unixHour } from './time.js';

/** A refetch someone is waiting for gets one try (the platform's fetch gives up after ~5 s): a
 *  deadline already past means retryOnce() never retries. */
const NO_RETRY = 0;
/** NEA may still revise yesterday's last hours until this SGT hour; after it, yesterday is fetched
 *  only if some of its hours aren't stored (one request fewer per refetch: data.gov.sg rate-limits). */
const YESTERDAY_UNTIL_H = 3;

/**
 * Fetch NEA, store readings and the new snapshot. Feed errors are recorded, not thrown, if cached data exists.
 * @param {{ deadline?: number, claimed?: boolean }} [opts] `deadline`: see retryOnce() in fetch-retry.js;
 *   `claimed`: the caller already claimed last_fetch_attempt
 */
export async function refreshNea({ deadline, claimed = false } = {}) {
  if (!claimed) await claimEvery('last_fetch_attempt', 0); // always granted: Mini Apps don't refetch right after
  const before = await recentReadings(HISTORY_HOURS);
  const yesterday = sgtDayStart(sgtDateOf(Date.now() - 86_400_000));
  const storedYesterday = before.filter((r) => Date.parse(r.timestamp) / 1000 >= yesterday && Date.parse(r.timestamp) / 1000 < yesterday + 86_400).length;
  const withYesterday = new Date(Date.now() + 8 * 3_600_000).getUTCHours() < YESTERDAY_UNTIL_H || storedYesterday < 24;
  const [pm25, psi] = await Promise.allSettled([getPm25History(deadline, withYesterday), getLatestPsi(deadline)]);

  if (pm25.status === 'fulfilled') {
    // Only hours that are new or that NEA revised: a refetch usually writes one row, not 48.
    const known = new Map(before.map((r) => [unixHour(r.timestamp), JSON.stringify(r.readings)]));
    await upsertReadings(pm25.value.filter((i) => known.get(unixHour(i.timestamp)) !== JSON.stringify(i.readings)));
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
  const [rows, psiState] = await Promise.all([recentReadings(HISTORY_HOURS), getState('psi').then((s) => s?.value)]);
  const history = lastHours(rows, 25);
  if (!history.length || !psiState) throw new Error('No NEA data yet (fetch failed and nothing cached)');
  const snap = buildSnapshot(history, psiState);
  // The range is extra: if it can't be stored, the old one ages out (currentRange) and the snapshot still goes.
  await Promise.all([setState('snapshot', snap), saveRange(rows).catch(() => null)]);
  return snap;
}

/** The stored snapshot as it is, or undefined before the first fetch. */
export async function storedSnapshot() {
  return (await getState('snapshot'))?.value;
}

/**
 * The snapshot, refetched from NEA if it's due (neaRefetchEveryS: every 2 min while NEA's current
 * hour is awaited, then every `revisedEveryS` for revisions). One caller at a time refetches,
 * across every isolate (claimEvery); the rest get the stored one. Throws only if NEA fails with
 * nothing stored. `deadline`: see retryOnce() in fetch-retry.js.
 * @param {{ now?: number, deadline?: number, revisedEveryS?: number }} [opts]
 */
export async function refreshNeaIfDue({ now = Date.now(), deadline, revisedEveryS = REVISED_EVERY_S } = {}) {
  // One read for both rows: a snapshot that isn't due costs a single query.
  const rows = await getStates(['snapshot', 'last_fetch_attempt']);
  const stored = rows.get('snapshot')?.value;
  if (!stored) return refreshNea({ deadline });
  const every = neaRefetchEveryS(stored, now, revisedEveryS);
  const tried = now / 1000 - (rows.get('last_fetch_attempt')?.updatedAt ?? 0) < every;
  if (tried || !(await claimEvery('last_fetch_attempt', every))) return stored;
  return refreshNea({ deadline, claimed: true }).catch(() => stored);
}

/** Latest snapshot, refetched if due (one try). `stale: true` means NEA's latest reading is over 80 min old. */
export async function getSnapshot() {
  const snap = await refreshNeaIfDue({ deadline: NO_RETRY, revisedEveryS: USER_REVISED_EVERY_S });
  return { ...snap, stale: isStale(snap.asOf) };
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
