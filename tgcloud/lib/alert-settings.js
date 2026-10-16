// @ts-check
// The /alerts settings message: text + inline keyboard. Pure.

export const DAILY_HOURS = [7, 8, 12, 18];

/** @param {number} h */
export const hourLabel = (h) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'am' : 'pm'}`;

/** Breaking news is on unless turned off (rows and Mini App builds from before it count as on). @param {{ breakingAlerts?: boolean } | null} sub */
export const breakingOn = (sub) => Boolean(sub && (sub.breakingAlerts ?? true));

/** @param {{ bandAlerts: boolean, dailyHour: number | null, breakingAlerts?: boolean } | null} sub */
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
    `Breaking news: <b>${breakingOn(sub) ? 'on' : 'off'}</b>. School closures, halted outdoor activities, and the official 24-hour PSI turning Very unhealthy or Hazardous.`,
    `Daily update: <b>${sub.dailyHour == null ? 'off' : `${hourLabel(sub.dailyHour)} SGT`}</b>`,
  ].join('\n');
  /** @param {boolean} on @param {string} label */
  const mark = (on, label) => `${on ? '● ' : ''}${label}`;
  return {
    text,
    reply_markup: {
      inline_keyboard: [
        [{ text: `${sub.bandAlerts ? '✅' : '⬜️'} Band change alerts`, callback_data: 'a:band' }],
        [{ text: `${breakingOn(sub) ? '✅' : '⬜️'} Breaking news`, callback_data: 'a:breaking' }],
        DAILY_HOURS.map((h) => ({ text: mark(sub.dailyHour === h, hourLabel(h)), callback_data: `a:daily:${h}` })),
        [{ text: mark(sub.dailyHour == null, 'No daily update'), callback_data: 'a:daily:off' }],
        [{ text: '🔕 Stop all alerts', callback_data: 'a:stop' }],
      ],
    },
  };
}

/**
 * Apply a button press to the settings. Returns the new settings, or null to unsubscribe.
 * @param {{ bandAlerts: boolean, dailyHour: number | null, breakingAlerts?: boolean } | null} sub
 * @param {string} data callback_data
 */
export function applyAlertAction(sub, data) {
  if (data === 'a:stop') return null;
  // From "off" entirely, "Turn on alerts" (a:band) turns on band alerts and breaking news.
  if (!sub && data === 'a:band') return { bandAlerts: true, dailyHour: null, breakingAlerts: true };
  const cur = { bandAlerts: Boolean(sub?.bandAlerts), dailyHour: sub?.dailyHour ?? null, breakingAlerts: sub ? breakingOn(sub) : false };
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
 * (unsubscribe). Throws an Error with a user-facing message on bad input. `breakingAlerts` is
 * optional (builds from before it) and then on, unless band and daily are both off.
 * @param {unknown} input
 * @returns {{ bandAlerts: boolean, dailyHour: number | null, breakingAlerts: boolean } | null}
 */
export function parseAlertInput(input) {
  const o = /** @type {Record<string, unknown>} */ (input ?? {});
  if (typeof o.bandAlerts !== 'boolean') throw new Error('bandAlerts must be true or false');
  const dailyHour = o.dailyHour ?? null;
  if (dailyHour !== null && !DAILY_HOURS.includes(/** @type {number} */ (dailyHour))) {
    throw new Error(`dailyHour must be one of ${DAILY_HOURS.join(', ')} or null`);
  }
  if (o.breakingAlerts !== undefined && typeof o.breakingAlerts !== 'boolean') throw new Error('breakingAlerts must be true or false');
  // An older build's "Stop all alerts" sends both off and no breakingAlerts: that still stops everything.
  const breakingAlerts = o.breakingAlerts ?? (o.bandAlerts || dailyHour !== null);
  const settings = { bandAlerts: o.bandAlerts, dailyHour: /** @type {number | null} */ (dailyHour), breakingAlerts };
  return isActive(settings) ? settings : null;
}

/** Any alert on? All off means unsubscribed. @param {{ bandAlerts: boolean, dailyHour: number | null, breakingAlerts?: boolean } | null} sub */
export function isActive(sub) {
  return Boolean(sub && (sub.bandAlerts || sub.dailyHour != null || breakingOn(sub)));
}
