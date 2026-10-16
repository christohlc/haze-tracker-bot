// @ts-check
// Sending bot text the one way the bot formats it, and answering a message where it came from.

import { api } from 'sdk';
import { isBadRequest } from './bot-errors.js';
import { answerTargets } from './chat-rules.js';

/** HTML text with link previews off, plus optional buttons. @param {import('./chat-rules.js').Target} to @param {string} text @param {any} [reply_markup] */
export function sendHtml(to, text, reply_markup) {
  return api.sendMessage({
    ...to,
    text,
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    ...(reply_markup && { reply_markup }),
  });
}

/**
 * Answer `message` with `send(to)`: in its topic, privately if the command was ephemeral or
 * `senderOnly`, falling back down chat-rules.js answerTargets when Telegram refuses one.
 * @param {any} message @param {(to: import('./chat-rules.js').Target) => Promise<any>} send @param {boolean} [senderOnly]
 */
export async function answer(message, send, senderOnly = false) {
  const targets = answerTargets(message, senderOnly);
  for (const [i, to] of targets.entries()) {
    try {
      return await send(to);
    } catch (e) {
      if (i === targets.length - 1 || !isBadRequest(e)) throw e;
    }
  }
}

/**
 * Replace the text and buttons of the bot's message `msg`, which `user` tapped a button on;
 * an ephemeral one is edited the ephemeral way. @param {any} msg @param {{ id: number }} user @param {{ text: string, reply_markup?: any }} view
 */
export function editHtml(msg, user, view) {
  const params = { chat_id: msg.chat.id, parse_mode: 'HTML', ...view };
  return msg.ephemeral_message_id
    ? api.editEphemeralMessageText({ ...params, receiver_user_id: user.id, ephemeral_message_id: msg.ephemeral_message_id })
    : api.editMessageText({ ...params, message_id: msg.message_id });
}
