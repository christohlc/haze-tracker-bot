// @ts-check
// When to alert. Pure, so it can be unit-tested.

import { PSI_BANDS } from './psi.js';

/** A drop to a lower band waits this long after the last change, so a PSI hovering on a
 *  boundary doesn't ping people every hour. A rise is always announced straight away. */
export const DEESCALATE_HOLD_MS = 3 * 3600_000;

/** @param {string} id */
export const bandRank = (id) => PSI_BANDS.findIndex((b) => b.id === id);

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
