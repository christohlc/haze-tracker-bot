// @ts-check
// Groups, topics and ephemeral replies: where a message goes and who may change a chat's alerts.
// Pure (no sdk), so tests can load it.

/**
 * Where a message goes: a chat id, or sendMessage-style params with `chat_id` plus any of
 * `message_thread_id`, `reply_parameters`, `ephemeral_message_parameters`.
 * @typedef {number | { chat_id: number, [key: string]: any }} Target
 */

/** @param {Target} to */
export const targetParams = (to) => (typeof to === 'number' ? { chat_id: to } : to);

/** @param {Target} to */
export const targetChat = (to) => (typeof to === 'number' ? to : to.chat_id);

/** Private chats have positive ids; groups and supergroups negative. @param {number} chatId */
export const isGroupChat = (chatId) => chatId < 0;

/**
 * The bot's commands as setMyCommands takes them. In groups the ephemeral ones are seen only by
 * the person who sends them and the bot, and so is the bot's reply; subscribing and unsubscribing
 * stay visible, because they change what the whole group gets.
 */
export const COMMANDS = [
  { command: 'haze', description: 'Current PSI with a regional picture', ephemeral: true },
  { command: 'cigs', description: 'Cigarette equivalent, e.g. /cigs east 30', ephemeral: true },
  { command: 'forecast', description: 'NEA’s forecast and the next few hours', ephemeral: true },
  { command: 'subscribe', description: 'Alerts when the haze band changes', ephemeral: false },
  { command: 'alerts', description: 'Change alerts, breaking news or a daily update', ephemeral: true },
  { command: 'unsubscribe', description: 'Stop all alerts', ephemeral: false },
  { command: 'help', description: 'What the bot can do', ephemeral: true },
];

/**
 * `/haze@HazeBot east` → { cmd: 'haze', args: ['east'] }. Null if it isn't a command, or it's
 * addressed to another bot (`/start@OtherBot` in a group with several bots).
 * @param {string} text @param {string | null} botUsername without the @; null skips the check
 * @returns {{ cmd: string, args: string[] } | null}
 */
export function parseCommand(text, botUsername) {
  if (!text.startsWith('/')) return null;
  const [raw, ...args] = text.trim().split(/\s+/);
  const [cmd, to] = raw.slice(1).split('@');
  if (to && botUsername && to.toLowerCase() !== botUsername.toLowerCase()) return null;
  return { cmd: cmd.toLowerCase(), args };
}

/** The forum topic a message is in, or null (General, or not a forum). @param {any} message */
export const topicOf = (message) => (message?.is_topic_message && message.message_thread_id) || null;

/**
 * Reply where the message came from: its topic, and privately if the command was ephemeral
 * (a reply to an ephemeral message must be ephemeral too).
 * @param {any} message @returns {Exclude<Target, number>}
 */
export function replyTo(message) {
  const topic = topicOf(message);
  return {
    chat_id: message.chat.id,
    ...(topic && { message_thread_id: topic }),
    ...(message.ephemeral_message_id &&
      message.from && {
        reply_parameters: { ephemeral_message_id: message.ephemeral_message_id },
        ephemeral_message_parameters: { receiver_user_id: message.from.id },
      }),
  };
}

/**
 * Seen only by the sender. In a group that's an ephemeral message even for an ordinary command,
 * which Telegram allows only if the bot is an admin there, so callers fall back to replyTo.
 * @param {any} message @returns {Exclude<Target, number>}
 */
export function toSenderOnly(message) {
  const to = replyTo(message);
  if (!isGroupChat(message.chat.id) || to.ephemeral_message_parameters || !message.from) return to;
  return { ...to, ephemeral_message_parameters: { receiver_user_id: message.from.id } };
}

/** Where a subscriber's alerts go. @param {{ chatId: number, threadId?: number | null }} sub @returns {Target} */
export const subscriberTarget = (sub) => (sub.threadId ? { chat_id: sub.chatId, message_thread_id: sub.threadId } : sub.chatId);

/** getChatMember statuses that may change a group's alerts. @param {string | undefined} status */
export const isAdminStatus = (status) => status === 'creator' || status === 'administrator';

/** A group message sent as the group itself is from an anonymous admin. @param {any} message */
export const isAnonymousAdmin = (message) => Boolean(message?.sender_chat && message.sender_chat.id === message.chat?.id);

/**
 * The dashboard button for a group, where web_app buttons aren't allowed: a t.me link that opens
 * the bot's main Mini App, or its private chat (whose /start has the web_app button).
 * @param {{ username?: string, has_main_web_app?: boolean }} bot
 */
export function groupDashboardUrl(bot) {
  return `https://t.me/${bot.username}?${bot.has_main_web_app ? 'startapp' : 'start=dashboard'}`;
}
