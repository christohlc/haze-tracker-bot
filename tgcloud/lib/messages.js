// @ts-check
// Sending bot text the one way the bot formats it.

import { api } from 'sdk';

/**
 * HTML text with link previews off (unless `preview` is given), plus optional buttons.
 * @param {number} chatId @param {string} text @param {any} [reply_markup] @param {any} [preview] link_preview_options
 */
export function sendHtml(chatId, text, reply_markup, preview) {
  return api.sendMessage({
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    link_preview_options: preview ?? { is_disabled: true },
    ...(reply_markup && { reply_markup }),
  });
}
