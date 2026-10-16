// @ts-check
// Subscriber storage.

import { db } from 'sdk';
import { eq, isNotNull, lt } from 'sdk/db';
import { alertsSent, subscribers } from '../schema.js';

const nowSec = () => Math.floor(Date.now() / 1000);

/** @param {number} chatId */
export async function getSubscriber(chatId) {
  return db.select().from(subscribers).where(eq(subscribers.chatId, chatId)).get();
}

/**
 * Create or update. A new subscriber starts at the current band, so subscribing never
 * triggers an immediate "band changed" alert.
 * @param {number} chatId
 * @param {{ bandAlerts?: boolean, dailyHour?: number | null }} patch
 * @param {string | null} currentBand
 */
export async function saveSubscriber(chatId, patch, currentBand) {
  const existing = await getSubscriber(chatId);
  if (existing) {
    await db.update(subscribers).set(patch).where(eq(subscribers.chatId, chatId)).run();
  } else {
    await db
      .insert(subscribers)
      .values({ chatId, bandAlerts: true, dailyHour: null, ...patch, lastBand: currentBand, createdAt: nowSec() })
      .run();
  }
  return getSubscriber(chatId);
}

/** @param {number} chatId */
export async function deleteSubscriber(chatId) {
  await db.delete(subscribers).where(eq(subscribers.chatId, chatId)).run();
}

export async function bandSubscribers() {
  return db.select().from(subscribers).where(eq(subscribers.bandAlerts, true)).all();
}

export async function dailySubscribers() {
  return db.select().from(subscribers).where(isNotNull(subscribers.dailyHour)).all();
}

/** @param {number} chatId @param {string} band */
export async function setLastBand(chatId, band) {
  await db.update(subscribers).set({ lastBand: band }).where(eq(subscribers.chatId, chatId)).run();
}

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
