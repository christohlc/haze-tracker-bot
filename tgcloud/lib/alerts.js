// @ts-check
// Send band-change and daily alerts. Called by the hourly tick.
// No timers in this runtime, so a rate-limited send isn't retried in-process: the claim is
// released and the subscriber's lastBand stays behind, and the next tick catches them up.

import { api, BotApiError } from 'sdk';
import { dailyDue, nextAlertBand, sgtHourOf } from './alert-rules.js';
import { dashboardButton } from './buttons.js';
import { formatBandAlert, formatHaze } from './format.js';
import { sgtDate } from './nea.js';
import { psiBand } from './psi.js';
import { getState, setState } from './store.js';
import {
  bandSubscribers,
  claimAlert,
  dailySubscribers,
  deleteSubscriber,
  pruneAlerts,
  releaseAlert,
  setLastBand,
} from './subscriptions.js';

/** @param {any} snap @param {number} [now] */
export async function runAlerts(snap, now = Date.now()) {
  const out = { band: null, sent: 0, daily: 0, removed: 0, deferred: false };

  const raw = psiBand(snap.worst.psi3h?.value)?.id ?? null;
  const prev = (await getState('alert_band'))?.value ?? null;
  const band = nextAlertBand(prev, raw, now);
  if (band && band !== prev) await setState('alert_band', band);
  out.band = band?.id ?? null;

  if (band) {
    for (const sub of await bandSubscribers()) {
      if (sub.lastBand === band.id) continue;
      if (!sub.lastBand) {
        await setLastBand(sub.chatId, band.id);
        continue;
      }
      const r = await send(sub.chatId, `band:${sub.chatId}:${band.id}:${band.at}`, formatBandAlert(snap, sub.lastBand, band.id));
      if (r === 'sent') out.sent++;
      if (r === 'sent' || r === 'duplicate') await setLastBand(sub.chatId, band.id);
      if (r === 'removed') out.removed++;
      if (r === 'limited') return { ...out, deferred: true };
    }
  }

  const hour = sgtHourOf(now);
  const date = sgtDate(0, now);
  for (const sub of await dailySubscribers()) {
    if (!dailyDue(sub.dailyHour, hour)) continue;
    const r = await send(sub.chatId, `daily:${sub.chatId}:${date}`, `☀️ <b>Daily haze update</b>\n\n${formatHaze(snap)}`);
    if (r === 'sent') out.daily++;
    if (r === 'removed') out.removed++;
    if (r === 'limited') return { ...out, deferred: true };
  }

  await pruneAlerts();
  return out;
}

/**
 * Claim, then send. 'duplicate' means another run already sent it.
 * @param {number} chatId @param {string} key @param {string} text
 * @returns {Promise<'sent' | 'duplicate' | 'removed' | 'limited' | 'failed'>}
 */
async function send(chatId, key, text) {
  if (!(await claimAlert(key, chatId))) return 'duplicate';
  try {
    const reply_markup = dashboardButton(chatId);
    await api.sendMessage({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      ...(reply_markup && { reply_markup }),
    });
    return 'sent';
  } catch (e) {
    if (e instanceof BotApiError && (e.code === 403 || /chat not found/i.test(e.description))) {
      // Blocked the bot, left the group, or deleted the account.
      await deleteSubscriber(chatId);
      return 'removed';
    }
    await releaseAlert(key);
    if (e instanceof BotApiError && e.code === 429) return 'limited';
    console.error('alert send failed', chatId, e);
    return 'failed';
  }
}
