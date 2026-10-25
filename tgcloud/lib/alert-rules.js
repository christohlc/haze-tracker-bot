// @ts-check
// When to alert. Pure, so it can be unit-tested.

import { levelOrNull, QUIET_FROM, QUIET_UNTIL } from './alert-settings.js';
import { subscriberTarget } from './chat-rules.js';
import { REGIONS } from './config.js';
import { PSI_BANDS, bandRank, psiBand } from './psi.js';

/** A drop to a lower band waits this long after the last change, so a PSI hovering on a
 *  boundary doesn't ping people every hour. A rise is always announced straight away. */
export const DEESCALATE_HOLD_MS = 3 * 3600_000;

export { bandRank };

/**
 * The band people get alerted about, given the previous one and the band right now.
 * @param {{ id: string, at: number } | null} prev
 * @param {string | null} rawId
 * @param {number} now ms
 * @returns {{ id: string, at: number } | null}
 */
export function nextAlertBand(prev, rawId, now) {
  if (!rawId) return prev;
  if (!prev) return { id: rawId, at: now };
  if (rawId === prev.id) return prev;
  if (bandRank(rawId) > bandRank(prev.id)) return { id: rawId, at: now };
  if (now - prev.at >= DEESCALATE_HOLD_MS) return { id: rawId, at: now };
  return prev;
}

/**
 * Is a daily update due? Allows a 3-hour catch-up window in case the cron runs late or skips.
 * @param {number | null} dailyHour SGT hour 0–23
 * @param {number} sgtHourNow
 */
export function dailyDue(dailyHour, sgtHourNow) {
  return dailyHour != null && sgtHourNow >= dailyHour && sgtHourNow < dailyHour + 3;
}

/** Current hour in Singapore. @param {number} now ms */
export const sgtHourOf = (now) => new Date(now + 8 * 3600_000).getUTCHours();

/** @param {number} now ms */
export const isQuietHour = (now) => {
  const h = sgtHourOf(now);
  return h >= QUIET_FROM || h < QUIET_UNTIL;
};

/**
 * Where a subscriber's alerts go, silent at night for a chat with quiet nights on: still sent,
 * so a sharp rise is never held back, but without sound.
 * @param {{ chatId: number, threadId?: number | null, quietNights?: boolean | null }} sub @param {number} now ms
 */
export const alertTarget = (sub, now) => ({ ...subscriberTarget(sub), ...(sub.quietNights && isQuietHour(now) && { disable_notification: true }) });

/**
 * Is a move from band `from` to `to` worth an alert for a chat whose level is `minBand`? Below
 * the level it isn't, except the drop back below it (the all clear).
 * @param {string} from @param {string} to @param {string | null | undefined} minBand
 */
export function wantsBandAlert(from, to, minBand) {
  const level = levelOrNull(minBand);
  return !level || Math.max(bandRank(from), bandRank(to)) >= bandRank(level);
}

/**
 * Whether the daily update brings the forecast picture: while there's haze to talk about, i.e.
 * NEA's forecast, or a next-hours range reaching past Moderate. Not on clear days.
 * @param {import('./ahead.js').Ahead | null} ahead
 */
export const dailyForecastDue = (ahead) => Boolean(ahead && (ahead.outlook || ahead.range?.steps.some((s) => s.hi > 100)));

/** Telegram allows about 30 messages/s across chats; stay under it. */
export const SEND_BATCH = 25;
export const SEND_INTERVAL_MS = 1000;

/**
 * Run `task` over `items` in parallel batches of `size`, starting at most one batch per
 * `intervalMs`. Stops when a task returns 'limited' (rate limited: the rest wait for the next
 * run), or before a batch that might not finish by `deadline` (the slowest batch so far, or one
 * interval, is the estimate). Without `sleep` (no timers), batches run back to back.
 * `firstAlone` runs the first item as a batch of its own, e.g. so it can upload a photo that the
 * rest then send by file id.
 * @template T
 * @param {T[]} items
 * @param {(item: T) => Promise<string>} task
 * @param {{ deadline: number, size?: number, intervalMs?: number, now?: () => number, sleep?: ((ms: number) => Promise<void>) | null, firstAlone?: boolean }} opts
 * @returns {Promise<{ results: string[], stopped: null | 'limited' | 'budget' }>}
 */
export async function runBatched(items, task, { deadline, size = SEND_BATCH, intervalMs = SEND_INTERVAL_MS, now = Date.now, sleep = null, firstAlone = false }) {
  /** @type {string[]} */
  const results = [];
  let slowest = intervalMs;
  for (let i = 0; i < items.length; ) {
    const n = i === 0 && firstAlone ? 1 : size;
    const start = now();
    if (start + slowest > deadline) return { results, stopped: 'budget' };
    const batch = await Promise.all(items.slice(i, i + n).map(task));
    results.push(...batch);
    if (batch.includes('limited')) return { results, stopped: 'limited' };
    const took = now() - start;
    slowest = Math.max(slowest, took);
    i += n;
    if (sleep && took < intervalMs && i < items.length) await sleep(intervalMs - took);
  }
  return { results, stopped: null };
}

// Band alerts per area. A chat follows one NEA region, or 'highest' (the highest region's 3-hour
// PSI, as before regions). Each scope keeps its own alert band, moved by nextAlertBand.

/** @typedef {{ id: string, at: number }} AlertBand */

export const ALERT_SCOPES = ['highest', ...REGIONS.map((r) => r.id)];

/** The scope a subscriber's band alerts follow; an unknown region falls back to 'highest'. @param {string | null | undefined} region */
export const scopeOf = (region) => (REGIONS.some((r) => r.id === region) ? /** @type {string} */ (region) : 'highest');

/**
 * Every scope's alert band after this reading.
 * @param {Record<string, AlertBand>} prev @param {any} snap @param {number} now ms
 * @returns {Record<string, AlertBand>}
 */
export function advanceBands(prev, snap, now) {
  /** @type {Record<string, AlertBand>} */
  const next = {};
  for (const scope of ALERT_SCOPES) {
    const value = scope === 'highest' ? snap.worst.psi3h?.value : snap.regions.find((/** @type {any} */ r) => r.id === scope)?.psi3h;
    const band = nextAlertBand(prev[scope] ?? null, psiBand(value)?.id ?? null, now);
    if (band) next[scope] = band;
  }
  return next;
}

/**
 * Band subscribers with their scope's band: `due` were told another band and get an alert;
 * `silent` just move to it, without an alert, so a later alert says where it came from: they
 * were never told one (rare: subscribing seeds it), or moved below their alert level.
 * @template {{ region?: string | null, lastBand?: string | null, minBand?: string | null }} S
 * @param {S[]} subs @param {Record<string, AlertBand>} bands
 */
export function bandAlertsFor(subs, bands) {
  /** @type {Array<{ sub: S, band: AlertBand, scope: string }>} */
  const due = [];
  /** @type {Array<{ sub: S, band: AlertBand, scope: string }>} */
  const silent = [];
  for (const sub of subs) {
    const scope = scopeOf(sub.region);
    const band = bands[scope];
    if (!band) continue;
    if (sub.lastBand === band.id) continue;
    if (sub.lastBand && wantsBandAlert(sub.lastBand, band.id, sub.minBand)) due.push({ sub, band, scope });
    else silent.push({ sub, band, scope });
  }
  return { due, silent };
}
