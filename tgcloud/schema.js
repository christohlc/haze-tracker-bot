import { integer, json, table, text } from 'sdk/db';

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
