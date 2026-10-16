// @ts-check
// Chat commands. Payload is the Message; the platform routes `message` updates here.

import { api } from 'sdk';
import { cigarettes } from '../lib/cigs.js';
import { renderAlertSettings } from '../lib/alert-settings.js';
import { dashboardButton } from '../lib/buttons.js';
import { REGIONS } from '../lib/config.js';
import { getForecast } from '../lib/forecast/run.js';
import { formatCigs, formatForecast, formatHaze } from '../lib/format.js';
import { getSnapshot } from '../lib/refresh.js';
import { getState } from '../lib/store.js';
import { deleteSubscriber, getSubscriber, saveSubscriber } from '../lib/subscriptions.js';

const HELP = [
  '<b>Haze Tracker SG</b>',
  '/haze: current PSI, regions and advice',
  '/cigs [region] [% outdoors]: cigarette equivalent, e.g. <code>/cigs east 30</code>',
  '/forecast: PSI for the next 24 hours (model, not official)',
  '/subscribe: alerts when the haze band changes',
  '/alerts: change alerts or add a daily update',
  '/unsubscribe: stop all alerts',
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
      const snap = await getSnapshot();
      const fc = await getForecast();
      return reply(message, formatHaze(snap, fc?.issuedAt === snap.asOf ? fc : null), dashboardButton(message.chat.id));
    }
    case 'forecast': {
      const fc = await getForecast();
      if (!fc) return reply(message, 'The forecast isn’t ready yet. It updates every hour.');
      return reply(message, formatForecast(fc), dashboardButton(message.chat.id));
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
      const band = (await getState('alert_band'))?.value?.id ?? null;
      const sub = await saveSubscriber(message.chat.id, { bandAlerts: true, dailyHour: existing?.dailyHour ?? null }, band);
      const view = renderAlertSettings(sub ?? null);
      return reply(message, `✅ You’ll get a message when the haze band changes.\n\n${view.text}`, view.reply_markup);
    }
    case 'alerts': {
      const view = renderAlertSettings((await getSubscriber(message.chat.id)) ?? null);
      return reply(message, view.text, view.reply_markup);
    }
    case 'unsubscribe':
    case 'stop':
      await deleteSubscriber(message.chat.id);
      return reply(message, '🔕 Alerts are off. Send /subscribe to turn them back on.');
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
  return api.sendMessage({
    chat_id: message.chat.id,
    text,
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    ...(reply_markup && { reply_markup }),
  });
}
