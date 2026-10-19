// @ts-check
// Which feeds to tell the operator about (ops.js sends it). Pure: shared with tests.

import { toSgtIso } from './time.js';

/** A source that keeps failing is DM'd again after this many seconds (ops.js). */
export const OPS_REPEAT_S = 6 * 3600;

// The tick fetches these itself, so one failed fetch is retried within minutes: they count as failing
// only once they've had no good fetch for this long. NEA every 15 min, the news about hourly.
const NEA_STALE_S = 2 * 3600;
const NEWS_STALE_S = 6 * 3600;

/**
 * @typedef {{ source: string, lastOkAt: number | null, lastErrorAt: number | null, lastError: string | null }} SourceStatus
 * (store.js allSourceStatus; times in unix seconds)
 */

/** How long a source may go without a good fetch, or null for a feed fetched only when asked for. @param {string} source */
function staleAfterS(source) {
  if (source === 'nea_pm25' || source === 'nea_psi') return NEA_STALE_S;
  return source.startsWith('news_') ? NEWS_STALE_S : null;
}

/**
 * A feed fetched only when the Mini App asks (cachedFeed), which may not be asked for again for hours,
 * so how long since its last good fetch says nothing: it counts as failing once a fetch
 * ON_DEMAND_GRACE_S after its first failure failed too, and ops.js tells it once per outage.
 * @param {string} source
 */
export const isOnDemand = (source) => staleAfterS(source) === null;

/**
 * NEA's forecast API drops the odd fetch from the platform (19 Oct 2026: down at 10:28, back at
 * 10:38), and a one-off isn't worth a DM.
 */
export const ON_DEMAND_GRACE_S = 30 * 60;

/** @param {SourceStatus} s */
const lastFetchFailed = (s) => (s.lastErrorAt ?? 0) > (s.lastOkAt ?? 0);

/**
 * Each on-demand feed whose latest fetch failed → its first failure since its last good fetch (unix s),
 * as far as the ticks saw: kept in state('ops_failing_since') from one tick to the next.
 * @param {SourceStatus[]} statuses @param {Record<string, number>} prev the last tick's
 * @returns {Record<string, number>}
 */
export function onDemandFailingSince(statuses, prev) {
  return Object.fromEntries(
    statuses
      .filter((s) => isOnDemand(s.source) && lastFetchFailed(s))
      .map((s) => {
        const since = prev[s.source];
        // A good fetch since then (between two ticks) starts a new outage.
        return [s.source, since && since > (s.lastOkAt ?? 0) ? since : /** @type {number} */ (s.lastErrorAt)];
      }),
  );
}

/**
 * The sources whose latest fetch failed, and that have gone too long without a good one or, if on
 * demand, failed again ON_DEMAND_GRACE_S after they started failing.
 * @param {SourceStatus[]} statuses @param {number} now unix seconds
 * @param {Record<string, number>} since onDemandFailingSince() @returns {SourceStatus[]}
 */
export function failingSources(statuses, now, since) {
  return statuses.filter((s) => {
    if (!lastFetchFailed(s)) return false;
    const staleS = staleAfterS(s.source);
    if (staleS !== null) return now - (s.lastOkAt ?? 0) > staleS;
    return s.source in since && (s.lastErrorAt ?? 0) - since[s.source] >= ON_DEMAND_GRACE_S;
  });
}

/**
 * Of the sources the operator was told about, the ones whose latest fetch worked (ops.js drops
 * those with no status row any more).
 * @param {SourceStatus[]} statuses @param {string[]} notified @returns {string[]}
 */
export function recoveredSources(statuses, notified) {
  return notified.filter((source) => {
    const s = statuses.find((x) => x.source === source);
    return s && !lastFetchFailed(s);
  });
}

/**
 * The DM: newly failing sources first, then the recovered ones. Plain text (no parse_mode).
 * @param {SourceStatus[]} failing @param {string[]} recovered @returns {string}
 */
export function opsMessage(failing, recovered) {
  const lines = failing.map(
    (s) =>
      `⚠️ ${s.source} failing: ${(s.lastError ?? 'unknown error').slice(0, 200)} (last good fetch ${s.lastOkAt ? toSgtIso(s.lastOkAt) : 'never'})`,
  );
  if (recovered.length) lines.push(`✅ Working again: ${recovered.join(', ')}`);
  return lines.join('\n\n');
}

/** The tick uploads the summary card to the ops chat only this early in its run, so it fits the budget. */
export const CARD_UPLOAD_BY_MS = 15_000;

/**
 * Whether the tick should upload this snapshot's summary card to the ops chat (ops.js uploadCard),
 * so inline mode has a file id every hour, or why not.
 * @param {{ chatId: unknown, cached: boolean, elapsedMs: number }} p
 * @returns {'upload' | 'no ops_chat_id' | 'cached' | 'no time'}
 */
export function cardUploadDue({ chatId, cached, elapsedMs }) {
  if (!chatId) return 'no ops_chat_id';
  if (cached) return 'cached';
  return elapsedMs < CARD_UPLOAD_BY_MS ? 'upload' : 'no time';
}
