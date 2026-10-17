// @ts-check
// Chat commands. Payload is the Message; the platform routes `message` updates here.

import { getAhead } from '../lib/ahead.js';
import { cigarettes } from '../lib/cigs.js';
import { renderAlertSettings } from '../lib/alert-settings.js';
import { dashboardButton } from '../lib/buttons.js';
import { ADMINS_ONLY, COMMANDS, isGroupChat, parseCommand, topicOf } from '../lib/chat-rules.js';
import { REGIONS } from '../lib/config.js';
import { sendCardOrText, sendForecastCardOrText } from '../lib/card/send.js';
import { botInfo, canManageAlerts } from '../lib/groups.js';
import { answer, sendHtml } from '../lib/messages.js';
import { formatCigs, formatForecast, formatHaze, formatHazeCaption } from '../lib/format.js';
import { getSnapshot } from '../lib/refresh.js';
import { deleteSubscriber, getSubscriber, moveSubscriber, saveSubscriber } from '../lib/subscriptions.js';

/** Copy that depends on whether the chat is a group. */
const PRIVATE = { will: 'You’ll', whose: 'your', note: 'if you subscribe, the bot keeps your chat ID and alert settings, nothing else.' };
const GROUP = {
  will: 'This group will',
  whose: 'this group’s',
  note: 'only admins can change a group’s alerts, which go to the topic /subscribe was sent in. The bot keeps the group’s chat ID and alert settings, nothing else.',
};

/** @param {typeof PRIVATE} copy */
const help = (copy) =>
  [
    '<b>I’m going hazelnuts!</b>',
    ...COMMANDS.filter((c) => c.help).map((c) => `/${c.command}${c.usage ? ` ${c.usage}` : ''}: ${c.help}`),
    '',
    `<i>Privacy: ${copy.note} /stop deletes them.</i>`,
  ].join('\n');

export default async function (message) {
  // The group became a supergroup; this service message arrives in the old one.
  if (message.migrate_to_chat_id) return moveSubscriber(message.chat.id, message.migrate_to_chat_id);

  const text = message.text ?? '';
  const group = isGroupChat(message.chat.id);
  const copy = group ? GROUP : PRIVATE;
  // Only a command addressed to a bot by name needs to know the bot's name.
  const bot = /^\/\S*@/.test(text) ? await botInfo() : null;
  const command = parseCommand(text, bot?.username ?? null);
  if (!command) {
    if (!group && !text.startsWith('/')) await reply(message, help(copy));
    return;
  }
  const { cmd, args } = command;

  switch (cmd) {
    case 'start':
    case 'help':
      return reply(message, help(copy), await dashboardButton(message.chat.id));
    case 'haze': {
      const refreshed = getSnapshot();
      const [snap, ahead, reply_markup, sub] = await Promise.all([refreshed, getAhead(refreshed), dashboardButton(message.chat.id), getSubscriber(message.chat.id)]);
      // Leads with the region this chat's alerts follow, if it picked one.
      const region = sub?.region ?? null;
      const caption = formatHazeCaption(snap, ahead, region);
      return answer(message, (to) => sendCardOrText(to, snap, { caption, text: formatHaze(snap, ahead, { region }), reply_markup }));
    }
    case 'forecast': {
      const refreshed = getSnapshot();
      const [snap, ahead, reply_markup] = await Promise.all([refreshed, getAhead(refreshed), dashboardButton(message.chat.id)]);
      if (!ahead.outlook && !ahead.range) return reply(message, 'Nothing to show yet. NEA issues a 24-hr PSI forecast only during haze episodes, and our range for the next few hours needs three days of recent readings.');
      const caption = formatForecast(ahead, { table: false });
      return answer(message, (to) => sendForecastCardOrText(to, snap, ahead, { caption, text: formatForecast(ahead), reply_markup }));
    }
    case 'cigs': {
      const { regionId, outdoorPct } = parseCigsArgs(args);
      const snap = await getSnapshot();
      const region = snap.regions.find((r) => r.id === regionId);
      const pm = region ? { now: region.pm25, mean24h: region.pm25Mean24h } : snap.island;
      const c = cigarettes(pm, outdoorPct / 100);
      return reply(message, formatCigs(c, { place: region?.name ?? 'Island-wide average', outdoorPct }));
    }
    case 'alerts': {
      const [allowed, sub] = await Promise.all([canManageAlerts(message), getSubscriber(message.chat.id)]);
      const view = renderAlertSettings(sub ?? null);
      return allowed ? reply(message, view.text, view.reply_markup) : reply(message, `${view.text}\n\n<i>${ADMINS_ONLY}</i>`);
    }
    case 'subscribe':
    case 'unsubscribe':
    case 'stop': {
      if (!(await canManageAlerts(message))) return answer(message, (to) => sendHtml(to, ADMINS_ONLY), true);
      if (cmd !== 'subscribe') {
        await deleteSubscriber(message.chat.id);
        return reply(message, `🔕 Alerts are off, and ${copy.whose} chat ID and alert settings are deleted. Send /subscribe to turn them back on.`);
      }
      const existing = await getSubscriber(message.chat.id);
      const { sub } = await saveSubscriber(message.chat.id, { bandAlerts: true, dailyHour: existing?.dailyHour ?? null, threadId: topicOf(message) });
      const view = renderAlertSettings(sub);
      return reply(message, `✅ ${copy.will} get a message when the haze band changes${sub.breakingAlerts ? ', and breaking haze news' : ''}.\n\n${view.text}`, view.reply_markup);
    }
    default:
      if (!group) return reply(message, help(copy));
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

/** Answer where the message came from: its topic, and privately if the command was ephemeral. */
function reply(message, text, reply_markup) {
  return answer(message, (to) => sendHtml(to, text, reply_markup));
}
