// @ts-check
// Subscriber storage.

import { db } from 'sdk';
import { and, eq, isNotNull, isNull, like, lt } from 'sdk/db';
import { alertsSent, subscribers } from '../schema.js';
import { getState } from './store.js';

const nowSec = () => Math.floor(Date.now() / 1000);

/** @param {number} chatId */
export async function getSubscriber(chatId) {
  return db.select().from(subscribers).where(eq(subscribers.chatId, chatId)).get();
}

/**
 * Create or update. A new subscriber starts at the current alert band, so subscribing never
 * triggers an immediate "band changed" alert.
 * @param {number} chatId
 * @param {{ bandAlerts?: boolean, dailyHour?: number | null, breakingAlerts?: boolean, threadId?: number | null }} patch
 */
export async function saveSubscriber(chatId, patch) {
  const existing = await getSubscriber(chatId);
  if (existing) {
    await db.update(subscribers).set(patch).where(eq(subscribers.chatId, chatId)).run();
    return { sub: { ...existing, ...patch }, created: false };
  }
  const lastBand = (await getState('alert_band'))?.value?.id ?? null;
  const sub = { chatId, bandAlerts: true, dailyHour: null, breakingAlerts: true, ...patch, lastBand, createdAt: nowSec() };
  await db.insert(subscribers).values(sub).run();
  return { sub, created: true };
}

/** Remove everything stored about a chat: its settings and its sent-alert records. @param {number} chatId */
export async function deleteSubscriber(chatId) {
  await Promise.all([
    db.delete(subscribers).where(eq(subscribers.chatId, chatId)).run(),
    db.delete(alertsSent).where(eq(alertsSent.chatId, chatId)).run(),
  ]);
}

/**
 * A group became a supergroup and got a new id: its subscription moves with it. Its sent-alert
 * records stay under the old id and are pruned. @param {number} from @param {number} to
 */
export async function moveSubscriber(from, to) {
  if (await getSubscriber(to)) return deleteSubscriber(from);
  await db.update(subscribers).set({ chatId: to, threadId: null }).where(eq(subscribers.chatId, from)).run();
}

/** Alerts go to the group's General topic from now on (theirs was deleted). @param {number} chatId */
export async function clearThread(chatId) {
  await db.update(subscribers).set({ threadId: null }).where(eq(subscribers.chatId, chatId)).run();
}

export async function bandSubscribers() {
  return db.select().from(subscribers).where(eq(subscribers.bandAlerts, true)).all();
}

export async function breakingSubscribers() {
  return db.select().from(subscribers).where(eq(subscribers.breakingAlerts, true)).all();
}

export async function dailySubscribers() {
  return db.select().from(subscribers).where(isNotNull(subscribers.dailyHour)).all();
}

/** @param {number} chatId @param {string} band */
export async function setLastBand(chatId, band) {
  await db.update(subscribers).set({ lastBand: band }).where(eq(subscribers.chatId, chatId)).run();
}

/** Subscribers who have never been told a band start at `band`, without an alert. @param {string} band */
export async function seedLastBand(band) {
  await db
    .update(subscribers)
    .set({ lastBand: band })
    .where(and(eq(subscribers.bandAlerts, true), isNull(subscribers.lastBand)))
    .run();
}

/** Chats with an alert claimed under a key matching `pattern` (SQL LIKE). @param {string} pattern */
async function claimedChats(pattern) {
  const rows = await db.select({ chatId: alertsSent.chatId }).from(alertsSent).where(like(alertsSent.key, pattern)).all();
  return new Set(rows.map((r) => r.chatId));
}

/** Chats whose daily update for `date` (YYYY-MM-DD) is already claimed. @param {string} date */
export const dailyClaimedChats = (date) => claimedChats(`daily:%:${date}`);

/** Chats that already have (or are being sent) breaking event `id`; keys are `breaking:<id>:<chat>`. @param {string} id */
export const breakingClaimedChats = (id) => claimedChats(`breaking:${id}:%`);

/** Testing aid: pretend every band subscriber was last told about `band`. @param {string} band */
export async function setAllLastBand(band) {
  await db.update(subscribers).set({ lastBand: band }).where(eq(subscribers.bandAlerts, true)).run();
}

export async function countSubscribers() {
  return db.$count(subscribers);
}

/** Claim an alert key. Returns false if someone already claimed it. @param {string} key @param {number} chatId */
export async function claimAlert(key, chatId) {
  const res = await db
    .insert(alertsSent)
    .values({ key, chatId, sentAt: nowSec() })
    .onConflictDoNothing({ target: alertsSent.key })
    .run();
  return res.rowsAffected > 0;
}

/** Undo a claim when the send didn't happen (rate limited), so the next tick retries. @param {string} key */
export async function releaseAlert(key) {
  await db.delete(alertsSent).where(eq(alertsSent.key, key)).run();
}

export async function pruneAlerts(olderThanDays = 14) {
  await db.delete(alertsSent).where(lt(alertsSent.sentAt, nowSec() - olderThanDays * 86_400)).run();
}
