// @ts-check
// Chat commands. Payload is the Message; the platform routes `message` updates here.

import { getAhead } from '../lib/ahead.js';
import { cigarettes } from '../lib/cigs.js';
import { renderAlertSettings } from '../lib/alert-settings.js';
import { dashboardButton } from '../lib/buttons.js';
import { REGIONS } from '../lib/config.js';
import { sendCardOrText } from '../lib/card/send.js';
import { sendHtml } from '../lib/messages.js';
import { formatCigs, formatForecast, formatHaze, formatHazeCaption } from '../lib/format.js';
import { getSnapshot } from '../lib/refresh.js';
import { deleteSubscriber, getSubscriber, saveSubscriber } from '../lib/subscriptions.js';

const HELP = [
  '<b>I’m going hazelnuts!</b>',
  '/haze: current PSI with a regional picture, plus advice',
  '/cigs [region] [% outdoors]: cigarette equivalent, e.g. <code>/cigs east 30</code>',
  '/forecast: NEA’s 24-hr PSI forecast during haze episodes, and the next few hours',
  '/subscribe: alerts when the haze band changes, and breaking haze news',
  '/alerts: change alerts, breaking news or a daily update',
  '/unsubscribe: stop all alerts',
  '',
  '<i>Privacy: if you subscribe, the bot keeps your chat ID and alert settings, nothing else. /stop deletes them.</i>',
].join('\n');

export default async function (message) {
  const text = message.text ?? '';
  if (!text.startsWith('/')) {
    if (message.chat.type === 'private') await reply(message, HELP);
    return;
  }
  const [rawCmd, ...args] = text.trim().split(/\s+/);
  const cmd = rawCmd.slice(1).split('@')[0].toLowerCase();

  switch (cmd) {
    case 'start':
    case 'help':
      return reply(message, HELP, dashboardButton(message.chat.id));
    case 'haze': {
      const refreshed = getSnapshot();
      const [snap, ahead] = await Promise.all([refreshed, getAhead(refreshed)]);
      return sendCardOrText(message.chat.id, snap, {
        caption: formatHazeCaption(snap, ahead),
        text: formatHaze(snap, ahead),
        reply_markup: dashboardButton(message.chat.id),
      });
    }
    case 'forecast': {
      const ahead = await getAhead(getSnapshot());
      if (!ahead.outlook && !ahead.range) return reply(message, 'Nothing to show yet. NEA issues a 24-hr PSI forecast only during haze episodes, and our range for the next few hours needs three days of recent readings.');
      return reply(message, formatForecast(ahead), dashboardButton(message.chat.id));
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
      const existing = await getSubscriber(message.chat.id);
      const { sub } = await saveSubscriber(message.chat.id, { bandAlerts: true, dailyHour: existing?.dailyHour ?? null });
      const view = renderAlertSettings(sub);
      return reply(message, `✅ You’ll get a message when the haze band changes${sub.breakingAlerts ? ', and breaking haze news' : ''}.\n\n${view.text}`, view.reply_markup);
    }
    case 'alerts': {
      const view = renderAlertSettings((await getSubscriber(message.chat.id)) ?? null);
      return reply(message, view.text, view.reply_markup);
    }
    case 'unsubscribe':
    case 'stop':
      await deleteSubscriber(message.chat.id);
      return reply(message, '🔕 Alerts are off, and your chat ID and alert settings are deleted. Send /subscribe to turn them back on.');
    default:
      if (message.chat.type === 'private') return reply(message, HELP);
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

function reply(message, text, reply_markup) {
  return sendHtml(message.chat.id, text, reply_markup);
}
