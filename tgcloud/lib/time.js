// @ts-check
// Hour arithmetic shared by the bot and the Mini App. Pure.

/** ISO timestamp (any offset) → unix hour (hours since epoch, UTC). @param {string} iso */
export const unixHour = (iso) => Math.floor(Date.parse(iso) / 3_600_000);

/** unix seconds → "2026-10-16T13:00:00+08:00" (SGT). @param {number} sec */
export const toSgtIso = (sec) => `${new Date(sec * 1000 + 8 * 3600_000).toISOString().slice(0, 19)}+08:00`;
