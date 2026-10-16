// @ts-check
// Sending bot text the one way the bot formats it.

import { api } from 'sdk';
import { targetParams } from './chat-rules.js';

/** HTML text with link previews off, plus optional buttons. @param {import('./chat-rules.js').Target} to @param {string} text @param {any} [reply_markup] */
export function sendHtml(to, text, reply_markup) {
  return api.sendMessage({
    ...targetParams(to),
    text,
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    ...(reply_markup && { reply_markup }),
  });
}
