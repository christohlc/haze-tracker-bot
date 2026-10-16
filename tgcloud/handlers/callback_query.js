// @ts-check
// Button presses on the /alerts settings message.

import { api } from 'sdk';
import { applyAlertAction, isActive, renderAlertSettings } from '../lib/alert-settings.js';
import { isBadRequest } from '../lib/bot-errors.js';
import { ADMINS_ONLY, topicOf } from '../lib/chat-rules.js';
import { canManageAlerts } from '../lib/groups.js';
import { editHtml } from '../lib/messages.js';
import { deleteSubscriber, getSubscriber, saveSubscriber } from '../lib/subscriptions.js';

export default async function (query) {
  const msg = query.message;
  if (!msg || !query.data?.startsWith('a:')) {
    await api.answerCallbackQuery({ callback_query_id: query.id });
    return;
  }
  const chatId = msg.chat.id;
  const [allowed, current] = await Promise.all([canManageAlerts({ chat: msg.chat, from: query.from }), getSubscriber(chatId)]);
  if (!allowed) {
    await api.answerCallbackQuery({ callback_query_id: query.id, text: ADMINS_ONLY, show_alert: true });
    return;
  }
  const next = applyAlertAction(current ?? null, query.data);

  let saved = null;
  if (isActive(next)) {
    // A new subscription's alerts go to the topic these buttons are in.
    saved = (await saveSubscriber(chatId, current ? next : { ...next, threadId: topicOf(msg) })).sub;
  } else {
    await deleteSubscriber(chatId);
  }

  try {
    await editHtml(msg, query.from, renderAlertSettings(saved ?? null));
  } catch (e) {
    // "message is not modified" when the same button is tapped twice
    if (!isBadRequest(e)) throw e;
  }
  await api.answerCallbackQuery({
    callback_query_id: query.id,
    text: saved ? 'Saved' : 'Alerts off',
  });
}
