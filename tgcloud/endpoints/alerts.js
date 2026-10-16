// @ts-check
// endpoints/alerts.js — the Mini App's alert settings for the calling user.
//   { action: 'get' }                                → settings or null
//   { action: 'save', bandAlerts, dailyHour }         → settings or null (both off = unsubscribe)
// Alerts go to the user's private chat with the bot, whose id is the user id.

import { api, BotApiError, EndpointError } from 'sdk';
import { parseAlertInput } from '../lib/alert-settings.js';
import { getState } from '../lib/store.js';
import { deleteSubscriber, getSubscriber, saveSubscriber } from '../lib/subscriptions.js';

/** @param {{ bandAlerts: boolean, dailyHour: number | null } | null | undefined} sub */
const view = (sub) => (sub ? { bandAlerts: Boolean(sub.bandAlerts), dailyHour: sub.dailyHour ?? null } : null);

export default async function (input, ctx) {
  const chatId = ctx.initData?.user?.id;
  if (!chatId) throw new EndpointError('Open this from Telegram', { code: 'NO_USER' });

  if (input.action === 'get') return view(await getSubscriber(chatId));
  if (input.action !== 'save') throw new EndpointError("action must be 'get' or 'save'");

  let next;
  try {
    next = parseAlertInput(input);
  } catch (e) {
    throw new EndpointError(e instanceof Error ? e.message : 'Invalid settings');
  }

  if (!next) {
    await deleteSubscriber(chatId);
    return null;
  }

  const existing = await getSubscriber(chatId);
  if (!existing) {
    // First subscribe: confirm in the chat, which also proves the bot may message this user.
    try {
      await api.sendMessage({
        chat_id: chatId,
        text: '🔔 Haze alerts are on. Send /alerts to change them, or /unsubscribe to stop.',
      });
    } catch (e) {
      if (e instanceof BotApiError && (e.code === 403 || /chat not found/i.test(e.description))) {
        throw new EndpointError('The bot can’t message you yet', { code: 'NO_WRITE_ACCESS' });
      }
      throw e;
    }
  }
  const band = (await getState('alert_band'))?.value?.id ?? null;
  return view(await saveSubscriber(chatId, next, band));
}
