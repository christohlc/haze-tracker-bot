// @ts-check
import { MINI_APP_URL } from './config.js';

/** "Open dashboard" button. web_app buttons only work in private chats (positive ids). @param {number} chatId */
export function dashboardButton(chatId) {
  if (chatId <= 0) return undefined;
  return { inline_keyboard: [[{ text: '📊 Open dashboard', web_app: { url: MINI_APP_URL } }]] };
}
