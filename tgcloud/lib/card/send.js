// @ts-check
// Send the summary card (summary.js) as a photo. It's drawn and uploaded once per snapshot;
// after that every send reuses Telegram's file id (state `card`, cached in memory too), so a
// batch of alerts costs one render and one upload. If the picture can't be sent, the text goes
// out instead.

import { api, BotApiError, InputFile } from 'sdk';
import { isRateLimited, isTopicGone, isUnreachable, movedTo } from '../bot-errors.js';
import { sendHtml } from '../messages.js';
import { getState, setState } from '../store.js';
import { forecastCardPng } from './forecast.js';
import { summaryCardPng } from './summary.js';

/** One card per NEA hour, PSI hour and staleness (the stale banner is drawn in). @param {any} snap */
const cardKey = (snap) => `${snap.asOf}|${snap.psiAsOf}|${snap.stale ? 'stale' : ''}`;

/**
 * This isolate's view of the current snapshot's card: its file id once uploaded, the PNG while
 * sends race to upload it, or `failed` if it couldn't be drawn (then everyone gets the text).
 * @type {{ key: string, fileId?: string, png?: Uint8Array, failed?: boolean } | null}
 */
let card = null;

/** Memory first; the DB once per snapshot per isolate. @param {any} snap */
async function cardFor(snap) {
  const key = cardKey(snap);
  if (card?.key !== key) {
    const saved = (await getState('card'))?.value;
    card = { key, ...(saved?.key === key && { fileId: saved.fileId }) };
  }
  return card;
}

/** The uploaded card for this snapshot, or null. @param {any} snap @returns {Promise<string | null>} */
export async function cachedCardId(snap) {
  return (await cardFor(snap)).fileId ?? null;
}

/** The file id of the largest size in a sent photo. @param {any} msg @returns {string | null} */
export const photoFileId = (msg) => msg?.photo?.at(-1)?.file_id ?? null;

/**
 * Send the card with an HTML caption. Throws like api.sendPhoto, or if the card can't be drawn.
 * @param {import('../chat-rules.js').Target} to @param {any} snap @param {string} caption @param {any} [reply_markup]
 * @returns {Promise<any>} the sent Message
 */
export async function sendCard(to, snap, caption, reply_markup) {
  const c = await cardFor(snap);
  if (!c.fileId && !c.png) {
    try {
      c.png = summaryCardPng(snap);
    } catch (e) {
      c.failed = true;
      throw e;
    }
  }
  const msg = await api.sendPhoto({
    ...to,
    photo: c.fileId ?? new InputFile(/** @type {Uint8Array} */ (c.png), 'haze.png', { type: 'image/png' }),
    caption,
    parse_mode: 'HTML',
    ...(reply_markup && { reply_markup }),
  });
  const uploaded = photoFileId(msg);
  if (!c.fileId && uploaded) {
    c.fileId = uploaded;
    delete c.png;
    await setState('card', { key: c.key, fileId: uploaded });
  }
  return msg;
}

/**
 * The card with `caption`, or `text` as a plain message if the card fails for any reason
 * other than the chat (blocked, gone, moved, topic deleted) or a rate limit, which are rethrown
 * for the caller.
 * @param {import('../chat-rules.js').Target} to @param {any} snap @param {{ caption: string, text: string, reply_markup?: any }} message
 */
export async function sendCardOrText(to, snap, { caption, text, reply_markup }) {
  if ((await cardFor(snap)).failed) return sendHtml(to, text, reply_markup);
  return orText(() => sendCard(to, snap, caption, reply_markup), to, text, reply_markup);
}

/**
 * The forecast card (forecast.js) with `caption`, or `text` if it fails, as sendCardOrText. Drawn
 * on every /forecast: it's asked for rarely, and NEA's forecast and our range change on their own
 * clocks, so there's no one key to cache it by.
 * @param {import('../chat-rules.js').Target} to @param {any} snap @param {import('../ahead.js').Ahead} ahead
 * @param {{ caption: string, text: string, reply_markup?: any }} message
 */
export function sendForecastCardOrText(to, snap, ahead, { caption, text, reply_markup }) {
  return orText(
    () =>
      api.sendPhoto({
        ...to,
        photo: new InputFile(forecastCardPng(snap, ahead), 'forecast.png', { type: 'image/png' }),
        caption,
        parse_mode: 'HTML',
        ...(reply_markup && { reply_markup }),
      }),
    to,
    text,
    reply_markup,
  );
}

/**
 * `send()`, or `text` as a plain message if it fails for any reason other than the chat or a rate
 * limit, which are rethrown for the caller.
 * @param {() => Promise<any>} send @param {import('../chat-rules.js').Target} to @param {string} text @param {any} [reply_markup]
 */
async function orText(send, to, text, reply_markup) {
  try {
    return await send();
  } catch (e) {
    if (isUnreachable(e) || isRateLimited(e) || movedTo(e) || isTopicGone(e)) throw e;
    console.error('card failed, sending text', e instanceof BotApiError ? `${e.code} ${e.description}` : String(e)); // no chat id: logs are public
    return sendHtml(to, text, reply_markup);
  }
}
