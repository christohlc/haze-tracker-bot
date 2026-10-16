// @ts-check
// The /alerts settings message: text + inline keyboard. Pure.

export const DAILY_HOURS = [7, 8, 12, 18];

/** @param {number} h */
export const hourLabel = (h) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'am' : 'pm'}`;

/** @typedef {{ bandAlerts: boolean, dailyHour: number | null, breakingAlerts: boolean }} AlertSettings */

/** @param {AlertSettings | null} sub */
export function renderAlertSettings(sub) {
  if (!sub) {
    return {
      text: '<b>Haze alerts are off.</b>\nTap below to get a message when the haze band changes, and breaking haze news such as school closures.',
      reply_markup: { inline_keyboard: [[{ text: '🔔 Turn on alerts', callback_data: 'a:band' }]] },
    };
  }
  const text = [
    '<b>Haze alerts</b>',
    `Band changes: <b>${sub.bandAlerts ? 'on' : 'off'}</b>. A message when the 3-hour PSI moves into another band (rises straight away, drops after 3 hours).`,
    `Breaking news: <b>${sub.breakingAlerts ? 'on' : 'off'}</b>. School closures, halted outdoor activities, and the official 24-hour PSI turning Very unhealthy or Hazardous.`,
    `Daily update: <b>${sub.dailyHour == null ? 'off' : `${hourLabel(sub.dailyHour)} SGT`}</b>`,
  ].join('\n');
  /** @param {boolean} on @param {string} label */
  const mark = (on, label) => `${on ? '● ' : ''}${label}`;
  return {
    text,
    reply_markup: {
      inline_keyboard: [
        [{ text: `${sub.bandAlerts ? '✅' : '⬜️'} Band change alerts`, callback_data: 'a:band' }],
        [{ text: `${sub.breakingAlerts ? '✅' : '⬜️'} Breaking news`, callback_data: 'a:breaking' }],
        DAILY_HOURS.map((h) => ({ text: mark(sub.dailyHour === h, hourLabel(h)), callback_data: `a:daily:${h}` })),
        [{ text: mark(sub.dailyHour == null, 'No daily update'), callback_data: 'a:daily:off' }],
        [{ text: '🔕 Stop all alerts', callback_data: 'a:stop' }],
      ],
    },
  };
}

/**
 * Apply a button press to the settings. Returns the new settings, or null to unsubscribe.
 * @param {AlertSettings | null} sub
 * @param {string} data callback_data
 * @returns {AlertSettings | null}
 */
export function applyAlertAction(sub, data) {
  if (data === 'a:stop') return null;
  // From "off" entirely, "Turn on alerts" (a:band) turns on band alerts and breaking news.
  if (!sub && data === 'a:band') return { bandAlerts: true, dailyHour: null, breakingAlerts: true };
  const cur = { bandAlerts: Boolean(sub?.bandAlerts), dailyHour: sub?.dailyHour ?? null, breakingAlerts: Boolean(sub?.breakingAlerts) };
  if (data === 'a:band') return { ...cur, bandAlerts: !cur.bandAlerts };
  if (data === 'a:breaking') return { ...cur, breakingAlerts: !cur.breakingAlerts };
  const m = /^a:daily:(off|\d{1,2})$/.exec(data);
  if (m) {
    const dailyHour = m[1] === 'off' ? null : Number(m[1]);
    if (dailyHour != null && !DAILY_HOURS.includes(dailyHour)) return cur;
    return { ...cur, dailyHour };
  }
  return cur;
}

/**
 * Validate settings sent by the Mini App. Returns the settings, or null when all are off
 * (unsubscribe). Throws an Error with a user-facing message on bad input. Builds from before
 * breaking news don't send `breakingAlerts`: it then stays as `current` has it, or is on for a
 * new subscriber, and an older build's "Stop all alerts" (both others off) still stops it.
 * @param {unknown} input
 * @param {{ breakingAlerts: boolean } | null} [current] the saved settings
 * @returns {AlertSettings | null}
 */
export function parseAlertInput(input, current = null) {
  const o = /** @type {Record<string, unknown>} */ (input ?? {});
  if (typeof o.bandAlerts !== 'boolean') throw new Error('bandAlerts must be true or false');
  const dailyHour = o.dailyHour ?? null;
  if (dailyHour !== null && !DAILY_HOURS.includes(/** @type {number} */ (dailyHour))) {
    throw new Error(`dailyHour must be one of ${DAILY_HOURS.join(', ')} or null`);
  }
  if (o.breakingAlerts !== undefined && typeof o.breakingAlerts !== 'boolean') throw new Error('breakingAlerts must be true or false');
  const others = o.bandAlerts || dailyHour !== null;
  const breakingAlerts = /** @type {boolean | undefined} */ (o.breakingAlerts) ?? (others && (current ? Boolean(current.breakingAlerts) : true));
  const settings = { bandAlerts: o.bandAlerts, dailyHour: /** @type {number | null} */ (dailyHour), breakingAlerts };
  return isActive(settings) ? settings : null;
}

/** Any alert on? All off means unsubscribed. @param {AlertSettings | null} sub */
export function isActive(sub) {
  return Boolean(sub && (sub.bandAlerts || sub.dailyHour != null || sub.breakingAlerts));
}
