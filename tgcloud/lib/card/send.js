// @ts-check
// Send the summary card (summary.js) as a photo. It's drawn and uploaded once per snapshot;
// after that every send reuses Telegram's file id (state `card`), so a batch of alerts costs
// one render and one upload. If the picture can't be sent, the text goes out instead.

import { api, BotApiError, InputFile } from 'sdk';
import { getState, setState } from '../store.js';
import { summaryCardPng } from './summary.js';

/** One card per NEA hour, PSI hour and staleness (the stale banner is drawn in). @param {any} snap */
const cardKey = (snap) => `${snap.asOf}|${snap.psiAsOf}|${snap.stale ? 'stale' : ''}`;

/** The uploaded card for this snapshot, or null. @param {any} snap @returns {Promise<string | null>} */
export async function cachedCardId(snap) {
  const card = (await getState('card'))?.value;
  return card?.key === cardKey(snap) ? card.fileId : null;
}

/**
 * Send the card with an HTML caption. Throws like api.sendPhoto.
 * @param {number} chatId @param {any} snap @param {string} caption @param {any} [reply_markup]
 * @returns {Promise<any>} the sent Message
 */
export async function sendCard(chatId, snap, caption, reply_markup) {
  const fileId = await cachedCardId(snap);
  const msg = await api.sendPhoto({
    chat_id: chatId,
    photo: fileId ?? new InputFile(summaryCardPng(snap), 'haze.png', { type: 'image/png' }),
    caption,
    parse_mode: 'HTML',
    ...(reply_markup && { reply_markup }),
  });
  const uploaded = msg?.photo?.at(-1)?.file_id;
  if (!fileId && uploaded) await setState('card', { key: cardKey(snap), fileId: uploaded });
  return msg;
}

/**
 * The card with `caption`, or `text` as a plain message if the card fails for any reason
 * other than the chat (blocked, gone) or a rate limit, which are rethrown for the caller.
 * @param {number} chatId @param {any} snap @param {{ caption: string, text: string, reply_markup?: any }} message
 */
export async function sendCardOrText(chatId, snap, { caption, text, reply_markup }) {
  try {
    return await sendCard(chatId, snap, caption, reply_markup);
  } catch (e) {
    if (e instanceof BotApiError && (e.code === 403 || e.code === 429 || /chat not found/i.test(e.description))) throw e;
    console.error('card failed, sending text', e instanceof BotApiError ? `${e.code} ${e.description}` : String(e)); // no chat id: logs are public
    return api.sendMessage({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      ...(reply_markup && { reply_markup }),
    });
  }
}
