// @ts-check
// Breaking-news events in state('breaking'): { events, psiBand }. The tick adds news events
// from freshly fetched stories and the official 24-hour PSI crossing; lib/alerts.js sends them.
// state('breaking_paused') (endpoints/admin) stops both.

import { api } from 'sdk';
import { hazeGateOpen, pickBreaking, pruneEvents, psiCrossing, sendableEvents } from './breaking-rules.js';
import { dashboardButton } from './buttons.js';
import { targetChat, targetParams } from './chat-rules.js';
import { formatBreaking } from './format.js';
import { getState, setState } from './store.js';

/** @typedef {import('./breaking-rules.js').BreakingEvent} BreakingEvent */

/** @returns {Promise<{ events: BreakingEvent[], psiBand: { id: string, at: number } | null }>} */
export async function getBreaking() {
  const v = (await getState('breaking'))?.value;
  return { events: v?.events ?? [], psiBand: v?.psiBand ?? null };
}

export async function isBreakingPaused() {
  return Boolean((await getState('breaking_paused'))?.value);
}

/**
 * This tick's breaking news: store new events (news only while there's haze, and the official
 * 24h PSI), then return what's still to send. The PSI band is tracked even while paused, so
 * unpausing doesn't announce an old rise.
 * @param {any} snap
 * @param {Array<{ source: string, title: string, link: string, publishedAt: string, description?: string }>} fresh
 * @param {number} now
 * @returns {Promise<{ added: string[], toSend: BreakingEvent[] }>}
 */
export async function updateBreaking(snap, fresh, now = Date.now()) {
  const [{ events, psiBand }, paused] = await Promise.all([getBreaking(), isBreakingPaused()]);
  const psi = psiCrossing(psiBand, snap.worst.psi24h?.value, now, events);
  /** @type {BreakingEvent[]} */
  const added = [];
  if (!paused) {
    if (psi.event) added.push(psi.event);
    if (hazeGateOpen(snap)) added.push(...pickBreaking(events, fresh, now));
  }
  const all = added.length ? pruneEvents([...events, ...added], now) : events;
  if (added.length || psi.band !== psiBand) await setState('breaking', { events: all, psiBand: psi.band });
  return { added: added.map((e) => e.id), toSend: paused ? [] : sendableEvents(all, now) };
}

/**
 * Send one breaking event to a chat. A story gets its large preview above the text, much like
 * a forwarded channel post. @param {import('./chat-rules.js').Target} to @param {BreakingEvent} event @param {any} snap
 */
export async function sendBreaking(to, event, snap) {
  const reply_markup = await dashboardButton(targetChat(to));
  return api.sendMessage({
    ...targetParams(to),
    text: formatBreaking(event, snap),
    parse_mode: 'HTML',
    link_preview_options: event.kind === 'news' ? { url: event.link, prefer_large_media: true, show_above_text: true } : { is_disabled: true },
    ...(reply_markup && { reply_markup }),
  });
}

/** Stop sending one event. Returns false if there's no such event. @param {string} id */
export async function cancelEvent(id) {
  const b = await getBreaking();
  const e = b.events.find((x) => x.id === id);
  if (!e) return false;
  e.cancelled = true;
  await setState('breaking', b);
  return true;
}
