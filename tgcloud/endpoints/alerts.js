// @ts-check
// endpoints/alerts.js — the Mini App's alert settings for the calling user.
//   { action: 'get' }                                → settings or null
//   { action: 'save', bandAlerts, dailyHour, breakingAlerts } → settings or null (all off = unsubscribe)
// Alerts go to the user's private chat with the bot, whose id is the user id.

import { api, EndpointError } from 'sdk';
import { parseAlertInput } from '../lib/alert-settings.js';
import { isUnreachable } from '../lib/bot-errors.js';
import { deleteSubscriber, getSubscriber, saveSubscriber } from '../lib/subscriptions.js';

/** @param {import('../lib/alert-settings.js').AlertSettings | null | undefined} sub */
const view = (sub) =>
  sub ? { bandAlerts: Boolean(sub.bandAlerts), dailyHour: sub.dailyHour ?? null, breakingAlerts: Boolean(sub.breakingAlerts) } : null;

export default async function (input, ctx) {
  const chatId = ctx.initData?.user?.id;
  if (!chatId) throw new EndpointError('Open this from Telegram', { code: 'NO_USER' });

  if (input.action === 'get') return view(await getSubscriber(chatId));
  if (input.action !== 'save') throw new EndpointError("action must be 'get' or 'save'");

  let next;
  try {
    next = parseAlertInput(input, (await getSubscriber(chatId)) ?? null);
  } catch (e) {
    throw new EndpointError(e instanceof Error ? e.message : 'Invalid settings');
  }

  if (!next) {
    await deleteSubscriber(chatId);
    return null;
  }

  const { sub, created } = await saveSubscriber(chatId, next);
  if (created) {
    // First subscribe: confirm in the chat, which also proves the bot may message this user.
    try {
      await api.sendMessage({
        chat_id: chatId,
        text: '🔔 Haze alerts are on. Send /alerts to change them, or /unsubscribe to stop.',
      });
    } catch (e) {
      if (isUnreachable(e)) {
        await deleteSubscriber(chatId);
        throw new EndpointError('The bot can’t message you. If you blocked it, unblock it and try again.', {
          code: 'NO_WRITE_ACCESS',
        });
      }
      throw e;
    }
  }
  return view(sub);
}
