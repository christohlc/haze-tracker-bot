// @ts-check
// Groups, topics and ephemeral replies: where a message goes and who may change a chat's alerts.
// Pure (no sdk), so tests can load it.

/**
 * Where a message goes: sendMessage-style params, `chat_id` plus any of `message_thread_id`,
 * `reply_parameters`, `ephemeral_message_parameters`.
 * @typedef {{ chat_id: number, [key: string]: any }} Target
 */

/** Private chats have positive ids; groups and supergroups negative. @param {number} chatId */
export const isGroupChat = (chatId) => chatId < 0;

/**
 * The bot's commands: `description` for Telegram's menu (setMyCommands, plain text), `usage` and
 * `help` for /help (HTML). In groups the ephemeral ones are seen only by the person who sends them and the
 * bot, and so is the reply; subscribing and unsubscribing stay visible, because they change what
 * the whole group gets.
 */
export const COMMANDS = [
  { command: 'haze', description: 'Current PSI with a regional picture', help: 'current PSI with a regional picture, plus advice', ephemeral: true },
  {
    command: 'cigs',
    description: 'Cigarette equivalent, e.g. /cigs east 30',
    usage: '[region] [% outdoors]',
    help: 'cigarette equivalent, e.g. <code>/cigs east 30</code>',
    ephemeral: true,
  },
  { command: 'forecast', description: 'NEA’s forecast and the next few hours', help: 'NEA’s 24-hr PSI forecast during haze episodes, and the next few hours', ephemeral: true },
  { command: 'subscribe', description: 'Alerts when the haze band changes', help: 'alerts when the haze band changes, and breaking haze news', ephemeral: false },
  { command: 'alerts', description: 'Change alerts, breaking news or a daily update', help: 'change alerts, breaking news or a daily update', ephemeral: true },
  { command: 'unsubscribe', description: 'Stop all alerts', help: 'stop all alerts', ephemeral: false },
  { command: 'help', description: 'What the bot can do', help: null, ephemeral: true },
];

/** Shown to a group member who isn't an admin and tries to change the group's alerts. */
export const ADMINS_ONLY = 'Only this group’s admins can change its alerts. Ask one of them.';

/**
 * `/haze@HazeBot east` → { cmd: 'haze', args: ['east'] }. Null if it isn't a command, or it's
 * addressed to another bot (`/start@OtherBot` in a group with several bots), or to some bot while
 * the bot's own username is unknown.
 * @param {string} text @param {string | null} botUsername without the @
 * @returns {{ cmd: string, args: string[] } | null}
 */
export function parseCommand(text, botUsername) {
  if (!text.startsWith('/')) return null;
  const [raw, ...args] = text.trim().split(/\s+/);
  const [cmd, to] = raw.slice(1).split('@');
  if (to && to.toLowerCase() !== botUsername?.toLowerCase()) return null;
  return { cmd: cmd.toLowerCase(), args };
}

/** The forum topic a message is in, or null (General, a reply thread, or not a forum). @param {any} message */
export const topicOf = (message) => (message?.is_topic_message && message.message_thread_id) || null;

/** @param {number} chatId @param {number | null | undefined} topic @returns {Target} */
const inChat = (chatId, topic) => ({ chat_id: chatId, ...(topic && { message_thread_id: topic }) });

/**
 * Where to answer `message`, best first; the next is for when Telegram refuses one (400).
 * - An ephemeral command gets an ephemeral reply (it must), or, past the 15 s it can be replied
 *   to in, an ephemeral message without the reply, which only an admin bot may send.
 * - `senderOnly` makes an ordinary group command's answer ephemeral too (admin bots only), else
 *   it's visible.
 * Ephemeral messages can't go to bots, so an anonymous admin (GroupAnonymousBot) gets a visible one.
 * @param {any} message @param {boolean} [senderOnly] @returns {Target[]}
 */
export function answerTargets(message, senderOnly = false) {
  const base = inChat(message.chat.id, topicOf(message));
  const user = message.from && !message.from.is_bot ? message.from.id : null;
  if (!user || !isGroupChat(message.chat.id)) return [base];
  const ephemeral = { ...base, ephemeral_message_parameters: { receiver_user_id: user } };
  if (message.ephemeral_message_id) return [{ ...ephemeral, reply_parameters: { ephemeral_message_id: message.ephemeral_message_id } }, ephemeral];
  return senderOnly ? [ephemeral, base] : [base];
}

/** Where a subscriber's alerts go. @param {{ chatId: number, threadId?: number | null }} sub */
export const subscriberTarget = (sub) => inChat(sub.chatId, sub.threadId);

/** A group message sent as the group itself is from an anonymous admin. @param {any} message */
export const isAnonymousAdmin = (message) => Boolean(message?.sender_chat && message.sender_chat.id === message.chat?.id);

/**
 * The dashboard button for a group, where web_app buttons aren't allowed: a t.me link that opens
 * the bot's main Mini App (set in BotFather), or its private chat (whose /start has the web_app button).
 * @param {{ username?: string, has_main_web_app?: boolean }} bot
 */
export function groupDashboardUrl(bot) {
  return `https://t.me/${bot.username}?${bot.has_main_web_app ? 'startapp' : 'start=dashboard'}`;
}
