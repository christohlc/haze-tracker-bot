// @ts-check
import { groupDashboardUrl, isGroupChat } from './chat-rules.js';
import { MINI_APP_URL } from './config.js';
import { botInfo } from './groups.js';

/**
 * "Open dashboard" button. web_app buttons only work in private chats, so a group gets a t.me
 * link instead (chat-rules.js groupDashboardUrl), or no button if getMe fails.
 * @param {number} chatId
 */
export async function dashboardButton(chatId) {
  const text = '📊 Open dashboard';
  if (!isGroupChat(chatId)) return { inline_keyboard: [[{ text, web_app: { url: MINI_APP_URL } }]] };
  const bot = await botInfo().catch(() => null);
  return bot?.username ? { inline_keyboard: [[{ text, url: groupDashboardUrl(bot) }]] } : undefined;
}
