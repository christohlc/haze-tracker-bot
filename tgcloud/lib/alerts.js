// @ts-check
// Send breaking news, band-change and daily alerts. Called by the tick.
// Sends go out in paced parallel batches (alert-rules.js runBatched) within a time budget. A
// rate-limited or unreached send isn't retried in-process: its claim is released (or never
// made) and the subscriber's lastBand stays behind, so the next tick catches them up.

import { getAhead } from './ahead.js';
import { ALERT_SCOPES, advanceBands, alertTarget, bandAlertsFor, dailyDue, dailyForecastDue, runBatched, SEND_INTERVAL_MS, sgtHourOf } from './alert-rules.js';
import { dashboardButton } from './buttons.js';
import { describeError, isRateLimited, isTopicGone, isUnreachable, movedTo } from './bot-errors.js';
import { cachedCardId, cachedForecastCardId, sendCardOrText, sendForecastCardOrText } from './card/send.js';
import { sendBreaking } from './breaking.js';
import { forecastMessage, formatBandAlert, formatHaze, formatHazeCaption } from './format.js';
import { getAlertBands, setAlertBands } from './store.js';
import { sgtDateOf } from './time.js';
import {
  bandSubscribers,
  breakingClaimedChats,
  breakingKey,
  breakingSubscribers,
  claimAlert,
  clearThread,
  dailyClaimedChats,
  dailyForecastClaimedChats,
  dailySubscribers,
  deleteSubscriber,
  moveSubscriber,
  pruneAlerts,
  releaseAlert,
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

/** Budget for fetching NEA's forecast for the daily forecast: one try (the platform gives up on a
 *  fetch after ~5 s), no retry past it. */
const AHEAD_WAIT_MS = 4_000;

const DAILY_HEADER = '☀️ <b>Daily haze update</b>\n\n';

const sleep = typeof setTimeout === 'function' ? (/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms)) : null;

/**
 * @param {any} snap @param {number} [now] when the tick started; the budget counts from here
 * @param {import('./breaking.js').BreakingEvent[]} [breaking] events to send (updateBreaking)
 */
export async function runAlerts(snap, now = Date.now(), breaking = []) {
  const end = now + BUDGET_MS;
  const out = { breaking: 0, band: null, sent: 0, daily: 0, dailyForecast: 0, removed: 0, deferred: false, paced: Boolean(sleep) };
  let retryAfter = SEND_INTERVAL_MS;
  /** @param {{ results: string[], stopped: string | null }} res @param {'breaking' | 'sent' | 'daily' | 'dailyForecast'} field */
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
  /** @param {{ chatId: number, threadId?: number | null, quietNights?: boolean | null }} sub @param {{ caption: string, text: string }} message */
  const card = (sub, message) => async () =>
    sendCardOrText(alertTarget(sub, now), snap, { ...message, reply_markup: await dashboardButton(sub.chatId) });
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

  // Each area's alert band moves with its own 3-hour PSI (rises at once, drops after a hold);
  // subscribers without a region follow the highest region's.
  // Read band and breaking state together: band alerts decide which crossings are folded.
  const [prev, bandSubs, breakingSubs, ...claimed] = await Promise.all([
    getAlertBands(),
    bandSubscribers(),
    breaking.length ? breakingSubscribers() : [],
    ...breaking.map((e) => breakingClaimedChats(e.id)),
  ]);
  const bands = advanceBands(prev, snap, now);
  const savingBands = ALERT_SCOPES.some((s) => bands[s] !== prev[s]) ? setAlertBands(bands) : null;
  out.band = bands.highest?.id ?? null;
  const { due: bandDue, unseeded, skipped } = bandAlertsFor(bandSubs, bands);
  const bandDueChats = new Set(bandDue.map(({ sub }) => sub.chatId));

  // Breaking news: every event still to send × breaking subscribers who haven't had it and
  // subscribed before it happened (so a new subscriber doesn't get an old story). An official
  // 24-hour PSI crossing for a chat that's also due a band alert leads that alert instead of
  // going on its own (`folded`), so the chat gets one message, under the picture it describes.
  /** @type {Array<{ sub: any, event: any }>} */
  const pending = [];
  /** @type {Map<number, any[]>} oldest first; the latest leads, all are claimed */
  const folded = new Map();
  breaking.forEach((event, i) => {
    for (const s of breakingSubs) {
      if (s.createdAt * 1000 > event.at || claimed[i].has(s.chatId)) continue;
      if (event.kind !== 'psi24' || !bandDueChats.has(s.chatId)) pending.push({ sub: s, event });
      else if (folded.has(s.chatId)) folded.get(s.chatId)?.push(event);
      else folded.set(s.chatId, [event]);
    }
  });
  const breakingRes = await runBatched(
    pending,
    ({ sub, event }) => sendNoting429(sub.chatId, breakingKey(event.id, sub.chatId), () => sendBreaking(alertTarget(sub, now), event, snap)),
    { deadline: Math.min(Date.now() + BREAKING_BUDGET_MS, end), sleep },
  );
  const breakingStopped = tally(breakingRes, 'breaking');
  await savingBands;

  // Until the summary card is uploaded, send to one chat first so the rest reuse its file id.
  const firstAlone = async () => !(await cachedCardId(snap));

  // Still 'limited' if breaking news hit a 429 and band alerts couldn't wait it out. A folded
  // event left unsent stays unclaimed, so the next tick sends it (with the band alert, or alone).
  let bandStopped = breakingStopped === 'limited' ? 'limited' : null;
  if (Object.keys(bands).length && (await canGoOn(breakingStopped, now + BAND_BUDGET_MS))) {
    // Never told a band (rare: subscribing seeds it), or a move below the chat's alert level:
    // move them to it, without an alert.
    await Promise.all([...unseeded, ...skipped].map(({ sub, band }) => setLastBand(sub.chatId, band.id)));
    const res = await runBatched(
      bandDue,
      async ({ sub, band, scope }) => {
        const official = folded.get(sub.chatId) ?? [];
        const text = formatBandAlert(snap, /** @type {string} */ (sub.lastBand), band.id, sub.region, official.at(-1));
        const r = await sendNoting429(sub.chatId, `band:${sub.chatId}:${scope}:${band.id}:${band.at}`, card(sub, { caption: text, text }));
        if (r !== 'sent' && r !== 'duplicate') return r;
        // A duplicate was sent by another run, folded events with it.
        const [, ...claims] = await Promise.all([setLastBand(sub.chatId, band.id), ...official.map((e) => claimAlert(breakingKey(e.id, sub.chatId), sub.chatId))]);
        if (r === 'sent' && claims.some(Boolean)) out.breaking++;
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
    /** @type {Map<string | null, { caption: string, text: string }>} */
    const daily = new Map();
    /** @param {string | null} region */
    const dailyFor = (region) => {
      if (!daily.has(region)) daily.set(region, { caption: `${DAILY_HEADER}${formatHazeCaption(snap, null, region)}`, text: `${DAILY_HEADER}${formatHaze(snap, null, { region })}` });
      return /** @type {{ caption: string, text: string }} */ (daily.get(region));
    };
    const res = await runBatched(
      due,
      (sub) => sendNoting429(sub.chatId, `daily:${sub.chatId}:${date}`, card(sub, dailyFor(sub.region ?? null))),
      { deadline, sleep, firstAlone: await firstAlone() },
    );
    const dailyStopped = tally(res, 'daily');

    // What's ahead follows each daily as a picture of its own (claim `forecast:<chat>:<date>`),
    // while there's haze to talk about (dailyForecastDue), so a 429 or a cut-off run resumes it
    // like any alert, without sending the haze card twice.
    if (await canGoOn(dailyStopped, deadline)) {
      const [sent, had] = await Promise.all([dailyClaimedChats(date), dailyForecastClaimedChats(date)]);
      const owed = subs.filter((s) => dailyDue(s.dailyHour, hour) && sent.has(s.chatId) && !had.has(s.chatId));
      const ahead = owed.length ? await getAhead(Promise.resolve(snap), Date.now() + AHEAD_WAIT_MS).catch(() => null) : null;
      if (ahead && dailyForecastDue(ahead)) {
        const message = forecastMessage(ahead);
        const forecastRes = await runBatched(
          owed,
          (sub) => sendNoting429(sub.chatId, `forecast:${sub.chatId}:${date}`, () => sendForecastCardOrText(alertTarget(sub, now), snap, ahead, message)),
          { deadline, sleep, firstAlone: !(await cachedForecastCardId(snap, ahead)) },
        );
        tally(forecastRes, 'dailyForecast');
      }
    }
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
    const to = movedTo(e);
    const fix = to ? moveSubscriber(chatId, to) : isTopicGone(e) ? clearThread(chatId) : null;
    if (fix) {
      await fix;
      return { result: 'failed' };
    }
    if (isRateLimited(e)) return { result: 'limited', retryAfterS: /** @type {any} */ (e).parameters?.retry_after };
    console.error('alert send failed', describeError(e)); // no chat id: tick output lands in public Actions logs
    return { result: 'failed' };
  }
}
