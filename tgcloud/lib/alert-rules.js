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
