// @ts-check
// Breaking-news events in state('breaking'): { events, psiBand }. The tick adds news events
// from freshly fetched stories and the official 24-hour PSI crossing; lib/alerts.js sends them.
// state('breaking_paused') (endpoints/admin) stops both.

import { hazeGateOpen, pickBreaking, pruneEvents, psiCrossing, sendableEvents } from './breaking-rules.js';
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

/** @param {boolean} on */
export async function setBreakingPaused(on) {
  await setState('breaking_paused', on);
}

/**
 * Add new events from this tick: news (only while there's haze) and the official 24h PSI.
 * The PSI band is tracked even while paused, so unpausing doesn't announce an old rise.
 * Returns the new events' ids.
 * @param {any} snap
 * @param {Array<{ source: string, title: string, link: string, publishedAt: string, description?: string }>} fresh
 * @param {number} now
 */
export async function updateBreaking(snap, fresh, now = Date.now()) {
  const [{ events, psiBand }, paused] = await Promise.all([getBreaking(), isBreakingPaused()]);
  const psi = psiCrossing(psiBand, snap.worst.psi24h?.value, now);
  /** @type {BreakingEvent[]} */
  const added = [];
  if (!paused) {
    if (psi.event) added.push(psi.event);
    if (hazeGateOpen(snap)) added.push(...pickBreaking(events, fresh, now));
  }
  if (added.length || psi.band !== psiBand) {
    await setState('breaking', { events: pruneEvents([...events, ...added], now), psiBand: psi.band });
  }
  return added.map((e) => e.id);
}

/** Events to send now, oldest first; none while paused. @param {number} now */
export async function eventsToSend(now = Date.now()) {
  if (await isBreakingPaused()) return [];
  return sendableEvents((await getBreaking()).events, now);
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
