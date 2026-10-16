// @ts-check
// Hour arithmetic shared by the bot and the Mini App. Pure.

/** ISO timestamp (any offset) → unix hour (hours since epoch, UTC). @param {string} iso */
export const unixHour = (iso) => Math.floor(Date.parse(iso) / 3_600_000);

/** unix seconds → "2026-10-16T13:00:00+08:00" (SGT). @param {number} sec */
export const toSgtIso = (sec) => `${new Date(sec * 1000 + 8 * 3600_000).toISOString().slice(0, 19)}+08:00`;

/** "2026-10-16T13:00:00+08:00" (already SGT) → "1 pm" / "1:30 pm"; `withMinutes` → "1:00 pm". @param {string} iso @param {boolean} [withMinutes] */
export function sgtHour(iso, withMinutes = false) {
  const h = Number(iso.slice(11, 13));
  const m = iso.slice(14, 16);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const suffix = h < 12 ? 'am' : 'pm';
  return withMinutes ? `${h12}:${m} ${suffix}` : `${h12}${m === '00' ? '' : `:${m}`} ${suffix}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-10-16" (an SGT date, or an SGT timestamp) → "16 Oct". @param {string} ymd */
export function sgtDayMonth(ymd) {
  return `${Number(ymd.slice(8, 10))} ${MONTHS[Number(ymd.slice(5, 7)) - 1]}`;
}
