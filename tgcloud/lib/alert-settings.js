// @ts-check
// The /alerts settings message: text + inline keyboard. Pure.

const DAILY_HOURS = [7, 8, 12, 18];

/** @param {number} h */
const hourLabel = (h) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'am' : 'pm'}`;

/** @param {{ bandAlerts: boolean, dailyHour: number | null } | null} sub */
export function renderAlertSettings(sub) {
  if (!sub) {
    return {
      text: '<b>Haze alerts are off.</b>\nTap below to get a message when the haze band changes.',
      reply_markup: { inline_keyboard: [[{ text: '🔔 Turn on alerts', callback_data: 'a:band' }]] },
    };
  }
  const text = [
    '<b>Haze alerts</b>',
    `Band changes: <b>${sub.bandAlerts ? 'on' : 'off'}</b>. A message when the 3-hour PSI moves into another band (rises straight away, drops after 3 hours).`,
    `Daily update: <b>${sub.dailyHour == null ? 'off' : `${hourLabel(sub.dailyHour)} SGT`}</b>`,
  ].join('\n');
  const mark = (on, label) => `${on ? '● ' : ''}${label}`;
  return {
    text,
    reply_markup: {
      inline_keyboard: [
        [{ text: `${sub.bandAlerts ? '✅' : '⬜️'} Band change alerts`, callback_data: 'a:band' }],
        DAILY_HOURS.map((h) => ({ text: mark(sub.dailyHour === h, hourLabel(h)), callback_data: `a:daily:${h}` })),
        [{ text: mark(sub.dailyHour == null, 'No daily update'), callback_data: 'a:daily:off' }],
        [{ text: '🔕 Stop all alerts', callback_data: 'a:stop' }],
      ],
    },
  };
}

/**
 * Apply a button press to the settings. Returns the new settings, or null to unsubscribe.
 * @param {{ bandAlerts: boolean, dailyHour: number | null } | null} sub
 * @param {string} data callback_data
 */
export function applyAlertAction(sub, data) {
  const cur = sub ?? { bandAlerts: false, dailyHour: null };
  if (data === 'a:stop') return null;
  if (data === 'a:band') {
    // From "off" entirely, the button turns band alerts on.
    return { bandAlerts: sub ? !cur.bandAlerts : true, dailyHour: cur.dailyHour };
  }
  const m = /^a:daily:(off|\d{1,2})$/.exec(data);
  if (m) {
    const dailyHour = m[1] === 'off' ? null : Number(m[1]);
    if (dailyHour != null && !DAILY_HOURS.includes(dailyHour)) return cur;
    return { bandAlerts: cur.bandAlerts, dailyHour };
  }
  return cur;
}
