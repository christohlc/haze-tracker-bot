// @ts-check
// Hour arithmetic shared by the bot and the Mini App. Pure.

/** YYYY-MM-DD in Singapore at `ms`. @param {number} ms */
export const sgtDateOf = (ms) => new Date(ms + 8 * 3_600_000).toISOString().slice(0, 10);

/** The last `days` SGT dates up to and including today's, newest first. @param {number} days @param {number} [now] ms */
export const sgtDatesBack = (days, now = Date.now()) => Array.from({ length: days }, (_, i) => sgtDateOf(now - i * 86_400_000));

/** Unix seconds at midnight SGT starting the SGT date "2026-10-16". @param {string} ymd */
export const sgtDayStart = (ymd) => Date.parse(`${ymd}T00:00:00+08:00`) / 1000;

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

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-10-16" (an SGT date, or an SGT timestamp) → "16 Oct". @param {string} ymd */
export function sgtDayMonth(ymd) {
  return `${Number(ymd.slice(8, 10))} ${MONTHS[Number(ymd.slice(5, 7)) - 1]}`;
}


/** "today" or "tomorrow" for an SGT date, else "on 18 Oct". @param {string} ymd @param {number} [now] ms */
export function sgtDayName(ymd, now = Date.now()) {
  if (ymd === sgtDateOf(now)) return 'today';
  if (ymd === sgtDateOf(now + 86_400_000)) return 'tomorrow';
  return `on ${sgtDayMonth(ymd)}`;
}
