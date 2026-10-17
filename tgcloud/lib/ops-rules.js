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
 * A feed fetched only when the Mini App asks (cachedFeed), which may not be asked for again for hours:
 * its latest fetch failing is enough to count, and ops.js tells it once per outage.
 * @param {string} source
 */
export const isOnDemand = (source) => staleAfterS(source) === null;

/** @param {SourceStatus} s */
const lastFetchFailed = (s) => (s.lastErrorAt ?? 0) > (s.lastOkAt ?? 0);

/**
 * The sources whose latest fetch failed, and, unless on demand, that have gone too long without a good one.
 * @param {SourceStatus[]} statuses @param {number} now unix seconds @returns {SourceStatus[]}
 */
export function failingSources(statuses, now) {
  return statuses.filter((s) => {
    if (!lastFetchFailed(s)) return false;
    const staleS = staleAfterS(s.source);
    return staleS === null || now - (s.lastOkAt ?? 0) > staleS;
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
