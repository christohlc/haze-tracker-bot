// @ts-check
// Send the summary card (summary.js) and the forecast card (forecast.js) as photos. Each is
// drawn and uploaded once per key (the data drawn on it); after that every send reuses
// Telegram's file id (state `card` / `forecast_card`, cached in memory too), so a batch of
// alerts costs one render and one upload per card. If a picture can't be sent, the text goes
// out instead.

import { api, BotApiError, InputFile } from 'sdk';
import { isRateLimited, isTopicGone, isUnreachable, movedTo } from '../bot-errors.js';
import { sendHtml } from '../messages.js';
import { getState, setState } from '../store.js';
import { forecastCardPng } from './forecast.js';
import { summaryCardPng } from './summary.js';

/** @typedef {import('../ahead.js').Ahead} Ahead */
/** @typedef {import('../chat-rules.js').Target} Target */
/** @typedef {{ caption: string, text: string, reply_markup?: any }} CardMessage */

/** The file id of the largest size in a sent photo. @param {any} msg @returns {string | null} */
export const photoFileId = (msg) => msg?.photo?.at(-1)?.file_id ?? null;

/**
 * One kind of card, uploaded once per key. This isolate keeps the current key's file id once
 * uploaded, the PNG while sends race to upload it, or `failed` if it couldn't be drawn (then
 * everyone gets the text).
 * @param {string} stateKey @param {string} filename
 */
function cardKind(stateKey, filename) {
  /** @type {{ key: string, fileId?: string, png?: Uint8Array, failed?: boolean } | null} */
  let card = null;

  /** Memory first; the DB once per key per isolate. @param {string} key */
  async function load(key) {
    if (card?.key !== key) {
      const saved = (await getState(stateKey))?.value;
      card = { key, ...(saved?.key === key && { fileId: saved.fileId }) };
    }
    return card;
  }

  /**
   * Send the card with an HTML caption. Throws like api.sendPhoto, or if it can't be drawn.
   * @param {Target} to @param {string} key @param {() => Uint8Array} draw @param {string} caption @param {any} [reply_markup]
   * @returns {Promise<any>} the sent Message
   */
  async function send(to, key, draw, caption, reply_markup) {
    const c = await load(key);
    if (!c.fileId && !c.png) {
      try {
        c.png = draw();
      } catch (e) {
        c.failed = true;
        throw e;
      }
    }
    const msg = await api.sendPhoto({
      ...to,
      photo: c.fileId ?? new InputFile(/** @type {Uint8Array} */ (c.png), filename, { type: 'image/png' }),
      caption,
      parse_mode: 'HTML',
      ...(reply_markup && { reply_markup }),
    });
    const uploaded = photoFileId(msg);
    if (!c.fileId && uploaded) {
      c.fileId = uploaded;
      delete c.png;
      await setState(stateKey, { key: c.key, fileId: uploaded });
    }
    return msg;
  }

  /** @param {Target} to @param {string} key @param {() => Uint8Array} draw @param {CardMessage} message */
  async function sendOrText(to, key, draw, { caption, text, reply_markup }) {
    if ((await load(key)).failed) return sendHtml(to, text, reply_markup);
    return orText(() => send(to, key, draw, caption, reply_markup), to, text, reply_markup);
  }

  return { cachedId: async (/** @type {string} */ key) => (await load(key)).fileId ?? null, send, sendOrText };
}

const summary = cardKind('card', 'haze.png');
const forecast = cardKind('forecast_card', 'forecast.png');

/** One card per NEA hour, PSI hour and staleness (the stale banner is drawn in). @param {any} snap */
const cardKey = (snap) => `${snap.asOf}|${snap.psiAsOf}|${snap.stale ? 'stale' : ''}`;
/** Everything the forecast card draws: the sky and tick come from the snapshot. @param {any} snap @param {Ahead} ahead */
const forecastKey = (snap, ahead) => JSON.stringify([cardKey(snap), snap.worst?.psi24h?.value ?? null, ahead.outlook, ahead.range]);

/** The uploaded summary card for this snapshot, or null. @param {any} snap @returns {Promise<string | null>} */
export const cachedCardId = (snap) => summary.cachedId(cardKey(snap));

/** The uploaded forecast card for this snapshot and forecast, or null. @param {any} snap @param {Ahead} ahead */
export const cachedForecastCardId = (snap, ahead) => forecast.cachedId(forecastKey(snap, ahead));

/**
 * Send the summary card with an HTML caption. Throws like api.sendPhoto, or if it can't be drawn.
 * @param {Target} to @param {any} snap @param {string} caption @param {any} [reply_markup]
 */
export const sendCard = (to, snap, caption, reply_markup) => summary.send(to, cardKey(snap), () => summaryCardPng(snap), caption, reply_markup);

/**
 * The summary card with `caption`, or `text` as a plain message if the card fails for any reason
 * other than the chat (blocked, gone, moved, topic deleted) or a rate limit, which are rethrown
 * for the caller.
 * @param {Target} to @param {any} snap @param {CardMessage} message
 */
export const sendCardOrText = (to, snap, message) => summary.sendOrText(to, cardKey(snap), () => summaryCardPng(snap), message);

/**
 * The forecast card with `caption`, or `text`, as sendCardOrText.
 * @param {Target} to @param {any} snap @param {Ahead} ahead @param {CardMessage} message
 */
export const sendForecastCardOrText = (to, snap, ahead, message) =>
  forecast.sendOrText(to, forecastKey(snap, ahead), () => forecastCardPng(snap, ahead), message);

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
