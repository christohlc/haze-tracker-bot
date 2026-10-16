// @ts-check
// Send band-change and daily alerts. Called by the tick.
// Sends go out in paced parallel batches (alert-rules.js runBatched) within a time budget. A
// rate-limited or unreached send isn't retried in-process: its claim is released (or never
// made) and the subscriber's lastBand stays behind, so the next tick catches them up.

import { api, BotApiError } from 'sdk';
import { dailyDue, nextAlertBand, runBatched, sgtHourOf } from './alert-rules.js';
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

/** Stop sending this long after the run starts so the tick returns before the platform cuts it
 *  off; whoever isn't reached yet keeps their old lastBand / unclaimed key for the next run. */
const BUDGET_MS = 20_000;
/** The band loop may use this share of the budget, so daily updates still go out in a backlog. */
const BAND_SHARE = 0.6;

const sleep = typeof setTimeout === 'function' ? (/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms)) : null;

/** @param {any} snap @param {number} [now] */
export async function runAlerts(snap, now = Date.now()) {
  const started = Date.now();
  const out = { band: null, sent: 0, daily: 0, removed: 0, deferred: false };

  const raw = psiBand(snap.worst.psi3h?.value)?.id ?? null;
  const prev = (await getState('alert_band'))?.value ?? null;
  const band = nextAlertBand(prev, raw, now);
  if (band && band !== prev) await setState('alert_band', band);
  out.band = band?.id ?? null;

  if (band) {
    const subs = (await bandSubscribers()).filter((s) => s.lastBand !== band.id);
    const { results, stopped } = await runBatched(
      subs,
      async (sub) => {
        if (!sub.lastBand) {
          await setLastBand(sub.chatId, band.id);
          return 'skipped';
        }
        const r = await send(sub.chatId, `band:${sub.chatId}:${band.id}:${band.at}`, formatBandAlert(snap, sub.lastBand, band.id));
        if (r === 'sent' || r === 'duplicate') await setLastBand(sub.chatId, band.id);
        return r;
      },
      { deadline: started + BUDGET_MS * BAND_SHARE, sleep },
    );
    out.sent += count(results, 'sent');
    out.removed += count(results, 'removed');
    if (stopped) out.deferred = true;
  }

  const hour = sgtHourOf(now);
  const date = sgtDate(0, now);
  const daily = (await dailySubscribers()).filter((s) => dailyDue(s.dailyHour, hour));
  const { results, stopped } = await runBatched(
    daily,
    (sub) => send(sub.chatId, `daily:${sub.chatId}:${date}`, `☀️ <b>Daily haze update</b>\n\n${formatHaze(snap)}`),
    { deadline: started + BUDGET_MS, sleep },
  );
  out.daily += count(results, 'sent');
  out.removed += count(results, 'removed');
  if (stopped) out.deferred = true;

  if (!out.deferred) await pruneAlerts();
  return out;
}

/** @param {string[]} results @param {string} r */
const count = (results, r) => results.filter((x) => x === r).length;

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
    if (isUnreachable(e)) {
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

/** The bot can't message this chat (blocked, never started, left, deleted). @param {unknown} e */
export function isUnreachable(e) {
  return e instanceof BotApiError && (e.code === 403 || /chat not found/i.test(e.description));
}
