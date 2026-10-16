// @ts-check
// Send band-change and daily alerts. Called by the tick.
// Sends go out in paced parallel batches (alert-rules.js runBatched) within a time budget. A
// rate-limited or unreached send isn't retried in-process: its claim is released (or never
// made) and the subscriber's lastBand stays behind, so the next tick catches them up.

import { api, BotApiError } from 'sdk';
import { dailyDue, nextAlertBand, runBatched, SEND_INTERVAL_MS, sgtHourOf } from './alert-rules.js';
import { dashboardButton } from './buttons.js';
import { formatBandAlert, formatHaze } from './format.js';
import { sgtDate } from './nea.js';
import { psiBand } from './psi.js';
import { getState, setState } from './store.js';
import {
  bandSubscribers,
  claimAlert,
  dailyClaimedChats,
  dailySubscribers,
  deleteSubscriber,
  pruneAlerts,
  releaseAlert,
  seedLastBand,
  setLastBand,
} from './subscriptions.js';

/** Stop sending this long after the tick starts so it returns before the platform cuts it
 *  off; whoever isn't reached yet keeps their old lastBand / unclaimed key for the next run. */
const BUDGET_MS = 20_000;
/** Band alerts stop by here, so daily updates still get time in a backlog. */
const BAND_BUDGET_MS = 12_000;

const sleep = typeof setTimeout === 'function' ? (/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms)) : null;

/** @param {any} snap @param {number} [now] when the tick started; the budget counts from here */
export async function runAlerts(snap, now = Date.now()) {
  const out = { band: null, sent: 0, daily: 0, removed: 0, deferred: false, paced: Boolean(sleep) };
  let retryAfter = SEND_INTERVAL_MS;
  /** @param {{ results: string[], stopped: string | null }} res @param {'sent' | 'daily'} field */
  const tally = ({ results, stopped }, field) => {
    out[field] += results.filter((r) => r === 'sent').length;
    out.removed += results.filter((r) => r === 'removed').length;
    if (stopped) out.deferred = true;
    return stopped;
  };
  /** @param {number} chatId @param {string} key @param {string} text */
  const sendNoting429 = async (chatId, key, text) => {
    const { result, retryAfterS } = await send(chatId, key, text);
    if (retryAfterS) retryAfter = Math.max(retryAfter, retryAfterS * 1000);
    return result;
  };

  const raw = psiBand(snap.worst.psi3h?.value)?.id ?? null;
  const prev = (await getState('alert_band'))?.value ?? null;
  const band = nextAlertBand(prev, raw, now);
  if (band && band !== prev) await setState('alert_band', band);
  out.band = band?.id ?? null;

  let bandStopped = null;
  if (band) {
    await seedLastBand(band.id);
    const subs = (await bandSubscribers()).filter((s) => s.lastBand && s.lastBand !== band.id);
    const res = await runBatched(
      subs,
      async (sub) => {
        const r = await sendNoting429(sub.chatId, `band:${sub.chatId}:${band.id}:${band.at}`, formatBandAlert(snap, sub.lastBand, band.id));
        if (r === 'sent' || r === 'duplicate') await setLastBand(sub.chatId, band.id);
        return r;
      },
      { deadline: now + BAND_BUDGET_MS, sleep },
    );
    bandStopped = tally(res, 'sent');
  }

  // A band backlog doesn't hold back daily updates. After a 429, wait Telegram's retry_after
  // first if there's time; otherwise the next tick sends them.
  const deadline = now + BUDGET_MS;
  const canWait = bandStopped !== 'limited' || (sleep && Date.now() + retryAfter + SEND_INTERVAL_MS < deadline);
  if (canWait) {
    if (bandStopped === 'limited' && sleep) await sleep(retryAfter);
    const date = sgtDate(0, now);
    const hour = sgtHourOf(now);
    const [subs, claimed] = await Promise.all([dailySubscribers(), dailyClaimedChats(date)]);
    const due = subs.filter((s) => dailyDue(s.dailyHour, hour) && !claimed.has(s.chatId));
    const res = await runBatched(
      due,
      (sub) => sendNoting429(sub.chatId, `daily:${sub.chatId}:${date}`, `☀️ <b>Daily haze update</b>\n\n${formatHaze(snap)}`),
      { deadline, sleep },
    );
    tally(res, 'daily');
  } else {
    out.deferred = true;
  }

  await pruneAlerts();
  return out;
}

/**
 * Claim, then send. 'duplicate' means another run already sent it.
 * @param {number} chatId @param {string} key @param {string} text
 * @returns {Promise<{ result: 'sent' | 'duplicate' | 'removed' | 'limited' | 'failed', retryAfterS?: number }>}
 */
async function send(chatId, key, text) {
  if (!(await claimAlert(key, chatId))) return { result: 'duplicate' };
  try {
    const reply_markup = dashboardButton(chatId);
    await api.sendMessage({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      ...(reply_markup && { reply_markup }),
    });
    return { result: 'sent' };
  } catch (e) {
    if (isUnreachable(e)) {
      // Blocked the bot, left the group, or deleted the account.
      await deleteSubscriber(chatId);
      return { result: 'removed' };
    }
    await releaseAlert(key);
    if (e instanceof BotApiError && e.code === 429) return { result: 'limited', retryAfterS: e.parameters?.retry_after };
    console.error('alert send failed', e instanceof BotApiError ? `${e.code} ${e.description}` : String(e)); // no chat id: tick output lands in public Actions logs
    return { result: 'failed' };
  }
}

/** The bot can't message this chat (blocked, never started, left, deleted). @param {unknown} e */
export function isUnreachable(e) {
  return e instanceof BotApiError && (e.code === 403 || /chat not found/i.test(e.description));
}
