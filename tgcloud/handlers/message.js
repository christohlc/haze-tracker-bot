// @ts-check
// Chat commands. Payload is the Message; the platform routes `message` updates here.

import { api } from 'sdk';
import { cigarettes } from '../lib/cigs.js';
import { MINI_APP_URL, REGIONS } from '../lib/config.js';
import { formatCigs, formatHaze } from '../lib/format.js';
import { loadSnapshot } from '../lib/live.js';

const HELP = [
  '<b>Haze Tracker SG</b>',
  '/haze: current PSI, regions and advice',
  '/cigs [region] [% outdoors]: cigarette equivalent, e.g. <code>/cigs east 30</code>',
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
      return reply(message, HELP, dashboardButton(message));
    case 'haze': {
      const snap = await loadSnapshot();
      return reply(message, formatHaze(snap), dashboardButton(message));
    }
    case 'cigs': {
      const { regionId, outdoorPct } = parseCigsArgs(args);
      const snap = await loadSnapshot();
      const region = snap.regions.find((r) => r.id === regionId);
      const pm = region ? { now: region.pm25, mean24h: region.pm25Mean24h } : snap.island;
      const c = cigarettes(pm, outdoorPct / 100);
      return reply(message, formatCigs(c, { place: region?.name ?? 'Island-wide average', outdoorPct }));
    }
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

// web_app buttons only work in private chats.
function dashboardButton(message) {
  if (message.chat.type !== 'private') return undefined;
  return { inline_keyboard: [[{ text: '📊 Open dashboard', web_app: { url: MINI_APP_URL } }]] };
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
