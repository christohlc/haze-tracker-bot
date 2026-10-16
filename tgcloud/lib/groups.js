// @ts-check
// What group chats need from the Bot API: the bot's own username and main Mini App (getMe,
// once per isolate) and whether someone is an admin of the chat.

import { api } from 'sdk';
import { isAnonymousAdmin, isGroupChat } from './chat-rules.js';

/** After getMe fails, don't ask again for this long (a tick sends to many groups). */
const RETRY_MS = 60_000;
/** @type {Promise<{ username?: string, has_main_web_app?: boolean } | null> | null} */
let me = null;
let failedAt = 0;

/** The bot's getMe, or null if it failed recently. Cached for the isolate's life. */
export function botInfo() {
  if (!me && Date.now() - failedAt < RETRY_MS) return Promise.resolve(null);
  me ??= api.getMe().catch((e) => {
    console.error('getMe failed', String(e));
    failedAt = Date.now();
    me = null;
    return null;
  });
  return me;
}

/**
 * Whether the sender of `message` (a Message, or a callback query's { chat, from }) may change
 * this chat's alerts: anyone in a private chat, admins in a group. False if Telegram can't say.
 * @param {{ chat: { id: number }, from?: { id: number }, sender_chat?: { id: number } }} message
 */
export async function canManageAlerts(message) {
  if (!isGroupChat(message.chat.id) || isAnonymousAdmin(message)) return true;
  if (!message.from) return false;
  try {
    const { status } = await api.getChatMember({ chat_id: message.chat.id, user_id: message.from.id });
    return status === 'creator' || status === 'administrator';
  } catch (e) {
    console.error('getChatMember failed', String(e));
    return false;
  }
}
