// @ts-check
// The /alerts settings message: text + inline keyboard. Pure.

import { REGIONS, REGION_NAMES } from './config.js';
import { bandById } from './psi.js';

export const DAILY_HOURS = [7, 8, 12, 18];

/** @param {number} h */
export const hourLabel = (h) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'am' : 'pm'}`;

/** Quiet nights: alerts sent from 11 pm to 7 am SGT arrive without sound. */
export const QUIET_FROM = 23;
export const QUIET_UNTIL = 7;
/** "11 pm–7 am SGT" */
export const QUIET_HOURS = `${hourLabel(QUIET_FROM)}–${hourLabel(QUIET_UNTIL)} SGT`;

/** The lowest band a chat can ask band alerts to start from; null is every band. */
export const ALERT_LEVELS = /** @type {const} */ (['unhealthy', 'very_unhealthy']);

/** A band we offer as an alert level, or null for every band. @param {unknown} v */
export const levelOrNull = (v) => ALERT_LEVELS.find((l) => l === v) ?? null;

/** `region`: band alerts follow this region's 3-hour PSI; null follows the highest region.
    `minBand`: band alerts only from this band up (and the drop back below it); null is every band.
    `quietNights`: alerts from 11 pm to 7 am SGT arrive without sound.
    @typedef {{ bandAlerts: boolean, dailyHour: number | null, breakingAlerts: boolean, region: string | null, minBand: typeof ALERT_LEVELS[number] | null, quietNights: boolean }} AlertSettings */

/** Settings as the code sees them, from a stored row or older settings without the newer fields.
    @param {Partial<AlertSettings> | null | undefined} sub @returns {AlertSettings} */
export const settingsOf = (sub) => ({
  bandAlerts: Boolean(sub?.bandAlerts),
  dailyHour: sub?.dailyHour ?? null,
  breakingAlerts: Boolean(sub?.breakingAlerts),
  region: sub?.region ?? null,
  minBand: levelOrNull(sub?.minBand),
  quietNights: Boolean(sub?.quietNights),
});

/** "Any band", "Unhealthy", "Very unhealthy". @param {string | null | undefined} level */
export const levelLabel = (level) => bandById(levelOrNull(level))?.label ?? 'Any band';

/** The levels offered, every band first. */
export const LEVEL_CHOICES = [null, ...ALERT_LEVELS];

/** Turning alerts on: band changes and breaking news, every band, no daily update. */
export const TURNED_ON = { ...settingsOf(null), bandAlerts: true, breakingAlerts: true };

/** "Central", or "the highest region" for island-wide. @param {string | null | undefined} region */
export const areaLabel = (region) => (regionOrNull(region) ? REGION_NAMES[/** @type {string} */ (region)] : 'the highest region');

/** A region id we know, or null for island-wide. @param {unknown} v */
export const regionOrNull = (v) => (REGIONS.some((r) => r.id === v) ? /** @type {string} */ (v) : null);

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
    `Band changes: <b>${sub.bandAlerts ? 'on' : 'off'}</b>. A message when the 3-hour PSI in <b>${areaLabel(sub.region)}</b> moves into another band (rises straight away, drops after 3 hours).`,
    ...(sub.bandAlerts ? [`Alert me from: <b>${levelLabel(sub.minBand)}</b>${levelOrNull(sub.minBand) ? ', and when it drops back below' : ''}`] : []),
    `Breaking news: <b>${sub.breakingAlerts ? 'on' : 'off'}</b>. School closures, halted outdoor activities, and the official 24-hour PSI turning Very unhealthy or Hazardous.`,
    `Daily update: <b>${sub.dailyHour == null ? 'off' : `${hourLabel(sub.dailyHour)} SGT`}</b>`,
    `Quiet at night: <b>${sub.quietNights ? 'on' : 'off'}</b>. Alerts ${QUIET_HOURS} arrive without sound.`,
  ].join('\n');
  /** @param {boolean} on @param {string} label */
  const mark = (on, label) => `${on ? '● ' : ''}${label}`;
  /** @param {{ id: string, name: string }} r */
  const areaButton = (r) => ({ text: mark(sub.region === r.id, r.name), callback_data: `a:region:${r.id}` });
  return {
    text,
    reply_markup: {
      inline_keyboard: [
        [{ text: `${sub.bandAlerts ? '✅' : '⬜️'} Band change alerts`, callback_data: 'a:band' }],
        // The level only shapes band alerts, so it's offered while they're on.
        ...(sub.bandAlerts ? [LEVEL_CHOICES.map((l) => ({ text: mark(levelOrNull(sub.minBand) === l, levelLabel(l)), callback_data: `a:level:${l ?? 'any'}` }))] : []),
        [{ text: mark(sub.region == null, 'Highest region'), callback_data: 'a:region:all' }, ...REGIONS.slice(0, 2).map(areaButton)],
        REGIONS.slice(2).map(areaButton),
        [{ text: `${sub.breakingAlerts ? '✅' : '⬜️'} Breaking news`, callback_data: 'a:breaking' }],
        DAILY_HOURS.map((h) => ({ text: mark(sub.dailyHour === h, hourLabel(h)), callback_data: `a:daily:${h}` })),
        [{ text: mark(sub.dailyHour == null, 'No daily update'), callback_data: 'a:daily:off' }],
        [{ text: `${sub.quietNights ? '✅' : '⬜️'} 🌙 Quiet at night`, callback_data: 'a:quiet' }],
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
  if (!sub && data === 'a:band') return TURNED_ON;
  const cur = settingsOf(sub);
  if (data.startsWith('a:region:')) return { ...cur, region: regionOrNull(data.slice(9)) };
  if (data.startsWith('a:level:')) return { ...cur, minBand: levelOrNull(data.slice(8)) };
  if (data === 'a:quiet') return { ...cur, quietNights: !cur.quietNights };
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
 * Builds from before regions don't send `region`, and builds from before alert levels don't send
 * `minBand` or `quietNights`: they stay as `current` has them.
 * @param {unknown} input
 * @param {Partial<AlertSettings> | null} [current] the saved settings
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
  const region = o.region === undefined ? (current?.region ?? null) : regionOrNull(o.region);
  if (o.region != null && !region) throw new Error(`region must be one of ${REGIONS.map((r) => r.id).join(', ')} or null`);
  const minBand = levelOrNull(o.minBand === undefined ? current?.minBand : o.minBand);
  if (o.minBand != null && !minBand) throw new Error(`minBand must be one of ${ALERT_LEVELS.join(', ')} or null`);
  if (o.quietNights !== undefined && typeof o.quietNights !== 'boolean') throw new Error('quietNights must be true or false');
  const quietNights = /** @type {boolean | undefined} */ (o.quietNights) ?? Boolean(current?.quietNights);
  const others = o.bandAlerts || dailyHour !== null;
  const breakingAlerts = /** @type {boolean | undefined} */ (o.breakingAlerts) ?? (others && (current ? Boolean(current.breakingAlerts) : true));
  const settings = { bandAlerts: o.bandAlerts, dailyHour: /** @type {number | null} */ (dailyHour), breakingAlerts, region, minBand, quietNights };
  return isActive(settings) ? settings : null;
}

/** Any alert on? All off means unsubscribed. @param {AlertSettings | null} sub */
export function isActive(sub) {
  return Boolean(sub && (sub.bandAlerts || sub.dailyHour != null || sub.breakingAlerts));
}
