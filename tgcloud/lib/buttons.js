// @ts-check
import { groupDashboardUrl, isGroupChat } from './chat-rules.js';
import { MINI_APP_URL } from './config.js';
import { botInfo } from './groups.js';

const DASHBOARD = '📊 Open dashboard';

/**
 * "Open dashboard" button. web_app buttons only work in private chats, so a group gets a t.me
 * link instead (chat-rules.js groupDashboardUrl), or no button if getMe fails.
 * @param {number} chatId
 */
export async function dashboardButton(chatId) {
  if (!isGroupChat(chatId)) return { inline_keyboard: [[{ text: DASHBOARD, web_app: { url: MINI_APP_URL } }]] };
  return linkDashboardButton();
}

/** The t.me "Open dashboard" link, for anywhere a web_app button isn't allowed (groups, inline results). */
export async function linkDashboardButton() {
  const bot = await botInfo();
  return bot?.username ? { inline_keyboard: [[{ text: DASHBOARD, url: groupDashboardUrl(bot) }]] } : undefined;
}
