// @ts-check
// Send breaking news, band-change and daily alerts. Called by the tick.
// Sends go out in paced parallel batches (alert-rules.js runBatched) within a time budget. A
// rate-limited or unreached send isn't retried in-process: its claim is released (or never
// made) and the subscriber's lastBand stays behind, so the next tick catches them up.

import { BotApiError } from 'sdk';
import { dailyDue, nextAlertBand, runBatched, SEND_INTERVAL_MS, sgtHourOf } from './alert-rules.js';
import { dashboardButton } from './buttons.js';
import { isRateLimited, isUnreachable } from './bot-errors.js';
import { subscriberTarget } from './chat-rules.js';
import { cachedCardId, sendCardOrText } from './card/send.js';
import { sendBreaking } from './breaking.js';
import { formatBandAlert, formatHaze, formatHazeCaption } from './format.js';
import { psiBand } from './psi.js';
import { getState, setState } from './store.js';
import { sgtDateOf } from './time.js';
import {
  bandSubscribers,
  breakingClaimedChats,
  breakingSubscribers,
  claimAlert,
  clearThread,
  dailyClaimedChats,
  dailySubscribers,
  deleteSubscriber,
  moveSubscriber,
  pruneAlerts,
  releaseAlert,
  seedLastBand,
  setLastBand,
} from './subscriptions.js';

/** Stop sending this long after the tick starts so it returns before the platform cuts it
 *  off; whoever isn't reached yet keeps their old lastBand / unclaimed key for the next run. */
const BUDGET_MS = 20_000;
/** Breaking news goes first and stops this long after alerts start (the news fetch before them
 *  doesn't eat into it), then band alerts by BAND_BUDGET_MS after the tick started, so a
 *  backlog of one doesn't starve the next. */
const BREAKING_BUDGET_MS = 6_000;
const BAND_BUDGET_MS = 12_000;

const DAILY_HEADER = '☀️ <b>Daily haze update</b>\n\n';

const sleep = typeof setTimeout === 'function' ? (/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms)) : null;

/**
 * @param {any} snap @param {number} [now] when the tick started; the budget counts from here
 * @param {import('./breaking.js').BreakingEvent[]} [breaking] events to send (updateBreaking)
 */
export async function runAlerts(snap, now = Date.now(), breaking = []) {
  const end = now + BUDGET_MS;
  const out = { breaking: 0, band: null, sent: 0, daily: 0, removed: 0, deferred: false, paced: Boolean(sleep) };
  let retryAfter = SEND_INTERVAL_MS;
  /** @param {{ results: string[], stopped: string | null }} res @param {'breaking' | 'sent' | 'daily'} field */
  const tally = ({ results, stopped }, field) => {
    out[field] += results.filter((r) => r === 'sent').length;
    out.removed += results.filter((r) => r === 'removed').length;
    if (stopped) out.deferred = true;
    return stopped;
  };
  /** @param {number} chatId @param {string} key @param {() => Promise<unknown>} deliver */
  const sendNoting429 = async (chatId, key, deliver) => {
    const { result, retryAfterS } = await send(chatId, key, deliver);
    if (retryAfterS) retryAfter = Math.max(retryAfter, retryAfterS * 1000);
    return result;
  };
  /** @param {{ chatId: number, threadId?: number | null }} sub @param {{ caption: string, text: string }} message */
  const card = (sub, message) => async () =>
    sendCardOrText(subscriberTarget(sub), snap, { ...message, reply_markup: await dashboardButton(sub.chatId) });
  /** After a phase hit a 429: wait Telegram's retry_after if there's time before `deadline`. @param {string | null} stopped @param {number} deadline */
  const canGoOn = async (stopped, deadline) => {
    if (stopped !== 'limited') return true;
    if (!sleep || Date.now() + retryAfter + SEND_INTERVAL_MS >= deadline) {
      out.deferred = true;
      return false;
    }
    await sleep(retryAfter);
    return true;
  };

  // Breaking news: every event still to send × breaking subscribers who haven't had it and
  // subscribed before it happened (so a new subscriber doesn't get an old story).
  /** @type {Array<{ sub: any, event: any }>} */
  const pending = [];
  if (breaking.length) {
    const [subs, ...claimed] = await Promise.all([breakingSubscribers(), ...breaking.map((e) => breakingClaimedChats(e.id))]);
    breaking.forEach((event, i) => {
      for (const s of subs) if (s.createdAt * 1000 <= event.at && !claimed[i].has(s.chatId)) pending.push({ sub: s, event });
    });
  }
  const breakingRes = await runBatched(
    pending,
    ({ sub, event }) => sendNoting429(sub.chatId, `breaking:${event.id}:${sub.chatId}`, () => sendBreaking(subscriberTarget(sub), event, snap)),
    { deadline: Math.min(Date.now() + BREAKING_BUDGET_MS, end), sleep },
  );
  const breakingStopped = tally(breakingRes, 'breaking');

  const raw = psiBand(snap.worst.psi3h?.value)?.id ?? null;
  const prev = (await getState('alert_band'))?.value ?? null;
  const band = nextAlertBand(prev, raw, now);
  // Until the summary card is uploaded, send to one chat first so the rest reuse its file id.
  const firstAlone = async () => !(await cachedCardId(snap));
  if (band && band !== prev) await setState('alert_band', band);
  out.band = band?.id ?? null;

  // Still 'limited' if breaking news hit a 429 and band alerts couldn't wait it out.
  let bandStopped = breakingStopped === 'limited' ? 'limited' : null;
  if (band && (await canGoOn(breakingStopped, now + BAND_BUDGET_MS))) {
    await seedLastBand(band.id);
    const subs = (await bandSubscribers()).filter((s) => s.lastBand && s.lastBand !== band.id);
    const res = await runBatched(
      subs,
      async (sub) => {
        const text = formatBandAlert(snap, sub.lastBand, band.id);
        const r = await sendNoting429(sub.chatId, `band:${sub.chatId}:${band.id}:${band.at}`, card(sub, { caption: text, text }));
        if (r === 'sent' || r === 'duplicate') await setLastBand(sub.chatId, band.id);
        return r;
      },
      { deadline: now + BAND_BUDGET_MS, sleep, firstAlone: await firstAlone() },
    );
    bandStopped = tally(res, 'sent');
  }

  // A band backlog doesn't hold back daily updates. After a 429, wait Telegram's retry_after
  // first if there's time; otherwise the next tick sends them.
  const deadline = end;
  if (await canGoOn(bandStopped, deadline)) {
    const date = sgtDateOf(now);
    const hour = sgtHourOf(now);
    const [subs, claimed] = await Promise.all([dailySubscribers(), dailyClaimedChats(date)]);
    const due = subs.filter((s) => dailyDue(s.dailyHour, hour) && !claimed.has(s.chatId));
    const daily = { caption: `${DAILY_HEADER}${formatHazeCaption(snap)}`, text: `${DAILY_HEADER}${formatHaze(snap)}` };
    const res = await runBatched(
      due,
      (sub) => sendNoting429(sub.chatId, `daily:${sub.chatId}:${date}`, card(sub, daily)),
      { deadline, sleep, firstAlone: await firstAlone() },
    );
    tally(res, 'daily');
  }

  await pruneAlerts();
  return out;
}

/**
 * Claim `key`, then `deliver` the message. 'duplicate' means another run already sent it.
 * @param {number} chatId @param {string} key @param {() => Promise<unknown>} deliver
 * @returns {Promise<{ result: 'sent' | 'duplicate' | 'removed' | 'limited' | 'failed', retryAfterS?: number }>}
 */
async function send(chatId, key, deliver) {
  if (!(await claimAlert(key, chatId))) return { result: 'duplicate' };
  try {
    await deliver();
    return { result: 'sent' };
  } catch (e) {
    if (isUnreachable(e)) {
      // Blocked the bot, left the group, or deleted the account.
      await deleteSubscriber(chatId);
      return { result: 'removed' };
    }
    await releaseAlert(key);
    // The group became a supergroup (new id), or the topic alerts went to was deleted: fix the
    // subscription, and the next tick sends to the right place.
    const movedTo = e instanceof BotApiError ? e.parameters?.migrate_to_chat_id : undefined;
    if (movedTo) {
      await moveSubscriber(chatId, movedTo);
      return { result: 'failed' };
    }
    if (e instanceof BotApiError && /thread not found/i.test(e.description)) {
      await clearThread(chatId);
      return { result: 'failed' };
    }
    if (isRateLimited(e)) return { result: 'limited', retryAfterS: /** @type {any} */ (e).parameters?.retry_after };
    console.error('alert send failed', e instanceof BotApiError ? `${e.code} ${e.description}` : String(e)); // no chat id: tick output lands in public Actions logs
    return { result: 'failed' };
  }
}
