import { boolean, index, integer, json, table, text } from 'sdk/db';

// One row per NEA hour. `pm25` is { north, west, central, east, south } in µg/m³.
export const readings = table('readings', {
  hour: integer('hour').primaryKey(), // unix seconds of the reading's hour
  pm25: json('pm25').notNull(),
  fetchedAt: integer('fetched_at').notNull(),
});

// Small cached blobs: the latest snapshot, NEA's latest 24h PSI, fetch bookkeeping.
export const state = table('state', {
  key: text('key').primaryKey(),
  value: json('value'),
  updatedAt: integer('updated_at').notNull(),
});

// Operator secrets (no secret store on Serverless). Set only via endpoints/admin.
export const settings = table('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

// Per data feed: last success and last error, since runtime logs aren't reachable.
export const sourceStatus = table('source_status', {
  source: text('source').primaryKey(),
  lastOkAt: integer('last_ok_at'),
  lastErrorAt: integer('last_error_at'),
  lastError: text('last_error'),
  detail: text('detail'),
});

// Chats that asked for alerts. `lastBand` is the band this chat was last told about,
// so a chat missed in one tick (rate limit, downtime) is caught up on the next.
export const subscribers = table('subscribers', {
  chatId: integer('chat_id').primaryKey(),
  bandAlerts: boolean('band_alerts').notNull().default(true),
  dailyHour: integer('daily_hour'), // SGT hour 0–23; null = no daily update
  breakingAlerts: boolean('breaking_alerts').notNull().default(true),
  lastBand: text('last_band'),
  threadId: integer('thread_id'), // forum topic in a group where alerts go; null = General / not a forum
  createdAt: integer('created_at').notNull(),
});

// Claimed before sending, so the cron and a manual tick can't both send the same alert.
export const alertsSent = table(
  'alerts_sent',
  {
    key: text('key').primaryKey(),
    chatId: integer('chat_id').notNull(),
    sentAt: integer('sent_at').notNull(),
  },
  (t) => ({ sentIdx: index('idx_alerts_sent_at').on(t.sentAt) }),
);
