// @ts-check
// What group chats need from the Bot API: the bot's own username and main Mini App (getMe,
// once per isolate) and whether someone is an admin of the chat.

import { api } from 'sdk';
import { isAdminStatus, isAnonymousAdmin, isGroupChat } from './chat-rules.js';

/** @type {Promise<{ username?: string, has_main_web_app?: boolean }> | null} */
let me = null;

export function botInfo() {
  me ??= api.getMe().catch((e) => {
    me = null;
    throw e;
  });
  return me;
}

/**
 * Whether the sender of `message` (a Message, or a callback query's { chat, from }) may change
 * this chat's alerts: anyone in a private chat, admins in a group.
 * @param {{ chat: { id: number }, from?: { id: number }, sender_chat?: { id: number } }} message
 */
export async function canManageAlerts(message) {
  if (!isGroupChat(message.chat.id) || isAnonymousAdmin(message)) return true;
  if (!message.from) return false;
  const member = await api.getChatMember({ chat_id: message.chat.id, user_id: message.from.id });
  return isAdminStatus(member?.status);
}
