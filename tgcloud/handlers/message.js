// @ts-check
// Chat commands. Payload is the Message; the platform routes `message` updates here.

import { BotApiError } from 'sdk';
import { getAhead } from '../lib/ahead.js';
import { cigarettes } from '../lib/cigs.js';
import { renderAlertSettings } from '../lib/alert-settings.js';
import { dashboardButton } from '../lib/buttons.js';
import { isGroupChat, parseCommand, replyTo, toSenderOnly, topicOf } from '../lib/chat-rules.js';
import { REGIONS } from '../lib/config.js';
import { sendCardOrText } from '../lib/card/send.js';
import { botInfo, canManageAlerts } from '../lib/groups.js';
import { sendHtml } from '../lib/messages.js';
import { formatCigs, formatForecast, formatHaze, formatHazeCaption } from '../lib/format.js';
import { getSnapshot } from '../lib/refresh.js';
import { deleteSubscriber, getSubscriber, moveSubscriber, saveSubscriber } from '../lib/subscriptions.js';

/** @param {boolean} group */
const help = (group) =>
  [
    '<b>I’m going hazelnuts!</b>',
    '/haze: current PSI with a regional picture, plus advice',
    '/cigs [region] [% outdoors]: cigarette equivalent, e.g. <code>/cigs east 30</code>',
    '/forecast: NEA’s 24-hr PSI forecast during haze episodes, and the next few hours',
    '/subscribe: alerts when the haze band changes, and breaking haze news',
    '/alerts: change alerts, breaking news or a daily update',
    '/unsubscribe: stop all alerts',
    '',
    group
      ? '<i>In a group, only admins can change alerts, and they go to the topic /subscribe was sent in. Privacy: the bot keeps the group’s chat ID and alert settings, nothing else. /stop deletes them.</i>'
      : '<i>Privacy: if you subscribe, the bot keeps your chat ID and alert settings, nothing else. /stop deletes them.</i>',
  ].join('\n');

const ADMINS_ONLY = 'Only this group’s admins can change its alerts.';

export default async function (message) {
  // The group became a supergroup; this service message arrives in the old one.
  if (message.migrate_to_chat_id) return moveSubscriber(message.chat.id, message.migrate_to_chat_id);

  const text = message.text ?? '';
  const group = isGroupChat(message.chat.id);
  const bot = text.startsWith('/') && group ? await botInfo().catch(() => null) : null;
  const command = parseCommand(text, bot?.username ?? null);
  if (!command) {
    if (!group && !text.startsWith('/')) await reply(message, help(false));
    return;
  }
  const { cmd, args } = command;

  switch (cmd) {
    case 'start':
    case 'help':
      return reply(message, help(group), await dashboardButton(message.chat.id));
    case 'haze': {
      const refreshed = getSnapshot();
      const [snap, ahead] = await Promise.all([refreshed, getAhead(refreshed)]);
      return sendCardOrText(replyTo(message), snap, {
        caption: formatHazeCaption(snap, ahead),
        text: formatHaze(snap, ahead),
        reply_markup: await dashboardButton(message.chat.id),
      });
    }
    case 'forecast': {
      const ahead = await getAhead(getSnapshot());
      if (!ahead.outlook && !ahead.range) return reply(message, 'Nothing to show yet. NEA issues a 24-hr PSI forecast only during haze episodes, and our range for the next few hours needs three days of recent readings.');
      return reply(message, formatForecast(ahead), await dashboardButton(message.chat.id));
    }
    case 'cigs': {
      const { regionId, outdoorPct } = parseCigsArgs(args);
      const snap = await getSnapshot();
      const region = snap.regions.find((r) => r.id === regionId);
      const pm = region ? { now: region.pm25, mean24h: region.pm25Mean24h } : snap.island;
      const c = cigarettes(pm, outdoorPct / 100);
      return reply(message, formatCigs(c, { place: region?.name ?? 'Island-wide average', outdoorPct }));
    }
    case 'subscribe': {
      if (!(await canManageAlerts(message))) return replyToSenderOnly(message, ADMINS_ONLY);
      const existing = await getSubscriber(message.chat.id);
      const { sub } = await saveSubscriber(message.chat.id, { bandAlerts: true, dailyHour: existing?.dailyHour ?? null, threadId: topicOf(message) });
      const view = renderAlertSettings(sub);
      const who = group ? 'This group will' : 'You’ll';
      return reply(message, `✅ ${who} get a message when the haze band changes${sub.breakingAlerts ? ', and breaking haze news' : ''}.\n\n${view.text}`, view.reply_markup);
    }
    case 'alerts': {
      const view = renderAlertSettings((await getSubscriber(message.chat.id)) ?? null);
      if (await canManageAlerts(message)) return reply(message, view.text, view.reply_markup);
      return reply(message, `${view.text}\n\n<i>${ADMINS_ONLY}</i>`);
    }
    case 'unsubscribe':
    case 'stop':
      if (!(await canManageAlerts(message))) return replyToSenderOnly(message, ADMINS_ONLY);
      await deleteSubscriber(message.chat.id);
      return reply(message, `🔕 Alerts are off, and ${group ? 'this group’s' : 'your'} chat ID and alert settings are deleted. Send /subscribe to turn them back on.`);
    default:
      if (!group) return reply(message, help(false));
  }
}

/** `/cigs east 30%` → { regionId: 'east', outdoorPct: 30 }. Defaults: island, 100%. */
export function parseCigsArgs(args) {
  let regionId = null;
  let outdoorPct = 100;
  for (const a of args) {
    const pct = /^(\d{1,3})%?$/.exec(a);
    if (pct) outdoorPct = Math.min(100, Number(pct[1]));
    else regionId = REGIONS.find((r) => r.id === a.toLowerCase())?.id ?? regionId;
  }
  return { regionId, outdoorPct };
}

/** Where the message came from: its topic, and privately if the command was ephemeral. */
function reply(message, text, reply_markup) {
  return sendHtml(replyTo(message), text, reply_markup);
}

/** Seen only by the sender if Telegram allows it (the bot is a group admin), else a normal reply. */
async function replyToSenderOnly(message, text) {
  try {
    return await sendHtml(toSenderOnly(message), text);
  } catch (e) {
    if (!(e instanceof BotApiError && e.code === 400)) throw e;
    return reply(message, text);
  }
}
