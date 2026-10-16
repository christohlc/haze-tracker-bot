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
  return sgtHour(new Date(sec * 1000 + 8 * 3600_000).toISOString(), true);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-10-16" (an SGT date) → "16 Oct" */
export function sgtDayMonth(ymd: string): string {
  return `${Number(ymd.slice(8, 10))} ${MONTHS[Number(ymd.slice(5, 7)) - 1]}`;
}

export const fmt = (v: number | null | undefined, digits = 0) => (v == null ? '–' : v.toFixed(digits));
