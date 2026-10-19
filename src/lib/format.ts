import { sgtDateOf, sgtDayMonth, sgtDayName, sgtHour, sgtWeekday } from '../../tgcloud/lib/time.js';

export { sgtDayMonth, sgtDayName, sgtHour, sgtWeekday };

/** unix seconds → "1:05 pm" in SGT */
export function sgtClock(sec: number): string {
  return sgtHour(sgtIso(sec * 1000));
}

/** ms → an ISO string whose digits read as SGT wall-clock time. */
const sgtIso = (ms: number) => new Date(ms + 8 * 3600_000).toISOString();

/** Readings older than this get a “May be out of date” note. */
export const STALE_MS = 30 * 60_000;

/** How long ago `iso` was, from `nowMs`: "just now", "25 min ago", "3 h ago", then "14 Oct" (SGT).
    For live feeds (a camera picture, a station reading, a story); what NEA issues gets sgtTime. */
export function timeAgo(iso: string, nowMs: number): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const min = Math.floor((nowMs - t) / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  if (min < 24 * 60) return `${Math.floor(min / 60)} h ago`;
  return sgtDayMonth(sgtIso(t).slice(0, 10));
}

/** “3 pm SGT”, or “3 pm SGT, 16 Oct” when it's not from today. */
export const readingTime = (iso: string) =>
  `${sgtHour(iso)} SGT${iso.slice(0, 10) === sgtDateOf(Date.now()) ? '' : `, ${sgtDayMonth(iso)}`}`;

/** Any ISO time (whatever its offset) as “3 pm SGT”, or “3 pm SGT, 16 Oct” when it's not from today. */
export function sgtTime(iso: string): string {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? readingTime(sgtIso(t)) : '';
}

export const fmt = (v: number | null | undefined, digits = 0) => (v == null ? '–' : v.toFixed(digits));
