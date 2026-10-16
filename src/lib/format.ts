/** "2026-10-16T13:00:00+08:00" → "1 pm" / "1:30 pm" (timestamps are already SGT). */
export function sgtHour(iso: string, withMinutes = false): string {
  const h = Number(iso.slice(11, 13));
  const m = iso.slice(14, 16);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const suffix = h < 12 ? 'am' : 'pm';
  return withMinutes ? `${h12}:${m} ${suffix}` : `${h12}${m === '00' ? '' : `:${m}`} ${suffix}`;
}

/** unix seconds → "1:05 pm" in SGT */
export function sgtClock(sec: number): string {
  return sgtHour(sgtIso(sec * 1000), true);
}

/** ms → an ISO string whose digits read as SGT wall-clock time. */
const sgtIso = (ms: number) => new Date(ms + 8 * 3600_000).toISOString();

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-10-16" (an SGT date) → "16 Oct" */
export function sgtDayMonth(ymd: string): string {
  return `${Number(ymd.slice(8, 10))} ${MONTHS[Number(ymd.slice(5, 7)) - 1]}`;
}

/** How long ago `iso` was, from `nowMs`: "just now", "25 min ago", "3 h ago", then "14 Oct" (SGT). */
export function timeAgo(iso: string, nowMs: number): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const min = Math.floor((nowMs - t) / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  if (min < 24 * 60) return `${Math.floor(min / 60)} h ago`;
  return sgtDayMonth(sgtIso(t).slice(0, 10));
}

export const fmt = (v: number | null | undefined, digits = 0) => (v == null ? '–' : v.toFixed(digits));
