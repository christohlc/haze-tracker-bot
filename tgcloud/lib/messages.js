// @ts-check
// Sending bot text the one way the bot formats it.

import { api } from 'sdk';

/** HTML text with link previews off, plus optional buttons. @param {number} chatId @param {string} text @param {any} [reply_markup] */
export function sendHtml(chatId, text, reply_markup) {
  return api.sendMessage({
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    ...(reply_markup && { reply_markup }),
  });
}
