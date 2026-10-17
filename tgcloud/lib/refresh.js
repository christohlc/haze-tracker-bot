// @ts-check
// Keep the DB's snapshot current. The tick calls refreshNeaIfNewHour(); chat commands and
// the Mini App call getSnapshot(), which refetches itself if the tick is late
// (the GitHub Actions cron can be delayed or skipped).

import { getLatestPsi, getPm25History } from './nea.js';
import { buildSnapshot } from './snapshot.js';
import { saveRange } from './ahead.js';
import { HISTORY_HOURS } from './range.js';
import { claimEvery, getState, lastHours, recentReadings, recordSource, setState, upsertReadings } from './store.js';
import { unixHour } from './time.js';

const STALE_MS = 80 * 60_000; // NEA publishes ~15 min past the hour
const RETRY_MS = 5 * 60_000; // don't hammer NEA when it's down

/** Fetch NEA, store readings and the new snapshot. Feed errors are recorded, not thrown, if cached data exists. */
export async function refreshNea() {
  await claimEvery('last_fetch_attempt', 0); // always granted: Mini Apps don't refetch right after
  const [pm25, psi] = await Promise.allSettled([getPm25History(), getLatestPsi()]);

  if (pm25.status === 'fulfilled') {
    await upsertReadings(pm25.value);
    await recordSource('nea_pm25', { ok: true, detail: `latest ${pm25.value.at(-1)?.timestamp}` });
  } else {
    await recordSource('nea_pm25', { ok: false, error: pm25.reason?.message ?? pm25.reason });
  }
  if (psi.status === 'fulfilled') {
    const latest = { timestamp: psi.value.timestamp, readings: { psi_twenty_four_hourly: psi.value.readings.psi_twenty_four_hourly } };
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
  await Promise.all([setState('snapshot', snap), saveRange(rows)]);
  return snap;
}

/** The stored snapshot as it is, or undefined before the first fetch. */
export async function storedSnapshot() {
  return (await getState('snapshot'))?.value;
}

/**
 * For the tick (every 15 min): refetch only until NEA has published the current hour.
 * @param {any} stored from storedSnapshot(), which the tick reads once for news too
 * @param {number} [now]
 */
export async function refreshNeaIfNewHour(stored, now = Date.now()) {
  if (stored && unixHour(stored.asOf) === Math.floor(now / 3_600_000)) return stored;
  return refreshNea();
}

/** Latest snapshot, refetching when stale. `stale: true` means NEA couldn't be reached. */
export async function getSnapshot() {
  const cached = await storedSnapshot();
  const fresh = cached && Date.now() - Date.parse(cached.asOf) < STALE_MS;
  if (fresh) return { ...cached, stale: false };

  if (cached) {
    const lastAttempt = (await getState('last_fetch_attempt'))?.updatedAt ?? 0;
    // A read first, so NEA being down doesn't make every open a write; then only one of the Mini
    // Apps opened together refetches (data.gov.sg rate-limits), the rest show the stored copy.
    const tried = Date.now() / 1000 - lastAttempt < RETRY_MS / 1000;
    if (tried || !(await claimEvery('last_fetch_attempt', RETRY_MS / 1000))) return { ...cached, stale: true };
  }
  try {
    const snap = await refreshNea();
    return { ...snap, stale: Date.now() - Date.parse(snap.asOf) >= STALE_MS };
  } catch (e) {
    if (cached) return { ...cached, stale: true };
    throw e;
  }
}
