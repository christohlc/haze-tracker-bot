// @ts-check
// Button presses on the /alerts settings message.

import { api, BotApiError } from 'sdk';
import { applyAlertAction, isActive, renderAlertSettings } from '../lib/alert-settings.js';
import { topicOf } from '../lib/chat-rules.js';
import { canManageAlerts } from '../lib/groups.js';
import { deleteSubscriber, getSubscriber, saveSubscriber } from '../lib/subscriptions.js';

export default async function (query) {
  const msg = query.message;
  if (!msg || !query.data?.startsWith('a:')) {
    await api.answerCallbackQuery({ callback_query_id: query.id });
    return;
  }
  const chatId = msg.chat.id;
  if (!(await canManageAlerts({ chat: msg.chat, from: query.from }))) {
    await api.answerCallbackQuery({ callback_query_id: query.id, text: 'Only this group’s admins can change its alerts.', show_alert: true });
    return;
  }
  const current = await getSubscriber(chatId);
  const next = applyAlertAction(current ?? null, query.data);

  let saved = null;
  if (isActive(next)) {
    // A new subscription's alerts go to the topic these buttons are in.
    saved = (await saveSubscriber(chatId, current ? next : { ...next, threadId: topicOf(msg) })).sub;
  } else {
    await deleteSubscriber(chatId);
  }

  const view = renderAlertSettings(saved ?? null);
  try {
    // Buttons on an ephemeral reply (a private /alerts in a group) are edited the ephemeral way.
    if (msg.ephemeral_message_id) {
      await api.editEphemeralMessageText({ chat_id: chatId, receiver_user_id: query.from.id, ephemeral_message_id: msg.ephemeral_message_id, parse_mode: 'HTML', ...view });
    } else {
      await api.editMessageText({ chat_id: chatId, message_id: msg.message_id, parse_mode: 'HTML', ...view });
    }
  } catch (e) {
    // "message is not modified" when the same button is tapped twice
    if (!(e instanceof BotApiError && e.code === 400)) throw e;
  }
  await api.answerCallbackQuery({
    callback_query_id: query.id,
    text: saved ? 'Saved' : 'Alerts off',
  });
}
