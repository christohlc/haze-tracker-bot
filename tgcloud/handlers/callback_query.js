// @ts-check
// Button presses on the /alerts settings message.

import { api, BotApiError } from 'sdk';
import { applyAlertAction, isActive, renderAlertSettings } from '../lib/alert-settings.js';
import { deleteSubscriber, getSubscriber, saveSubscriber } from '../lib/subscriptions.js';

export default async function (query) {
  const msg = query.message;
  if (!msg || !query.data?.startsWith('a:')) {
    await api.answerCallbackQuery({ callback_query_id: query.id });
    return;
  }
  const chatId = msg.chat.id;
  const current = await getSubscriber(chatId);
  const next = applyAlertAction(current ?? null, query.data);

  let saved = null;
  if (isActive(next)) {
    saved = (await saveSubscriber(chatId, next)).sub;
  } else {
    await deleteSubscriber(chatId);
  }

  const view = renderAlertSettings(saved ?? null);
  try {
    await api.editMessageText({ chat_id: chatId, message_id: msg.message_id, parse_mode: 'HTML', ...view });
  } catch (e) {
    // "message is not modified" when the same button is tapped twice
    if (!(e instanceof BotApiError && e.code === 400)) throw e;
  }
  await api.answerCallbackQuery({
    callback_query_id: query.id,
    text: saved ? 'Saved' : 'Alerts off',
  });
}
