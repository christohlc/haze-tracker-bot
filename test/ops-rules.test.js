import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CARD_UPLOAD_BY_MS,
  cardUploadDue,
  failingSources,
  isOnDemand,
  onDemandFailingSince,
  opsMessage,
  recoveredSources,
} from '../tgcloud/lib/ops-rules.js';

const NOW = 1_792_000_000;
const H = 3600;
const row = (source, lastOkAgoH, lastErrorAgoH, lastError = 'HTTP 500') => ({
  source,
  lastOkAt: lastOkAgoH === null ? null : NOW - lastOkAgoH * H,
  lastErrorAt: lastErrorAgoH === null ? null : NOW - lastErrorAgoH * H,
  lastError: lastErrorAgoH === null ? null : lastError,
});
const names = (rows, since = {}) => failingSources(rows, NOW, since).map((s) => s.source);

test('NEA fails only after 2 hours without a good fetch', () => {
  assert.deepEqual(names([row('nea_psi', 1.5, 0.1), row('nea_pm25', 2.5, 0.1)]), ['nea_pm25']);
  assert.deepEqual(names([row('nea_psi', 3, 3.5)]), []); // the latest fetch worked
  assert.deepEqual(names([row('nea_psi', null, 0.1)]), ['nea_psi']); // never worked
});

test('news fails after 6 hours', () => {
  assert.deepEqual(names([row('news_st', 5, 0.1), row('news_cna', 7, 0.1)]), ['news_cna']);
  assert.deepEqual(['nea_psi', 'news_st', 'nea_outlook', 'lta_cameras'].map(isOnDemand), [false, false, true, true]);
});

test('an on-demand feed fails once a fetch 30 min after its first failure failed too', () => {
  // One failed fetch, however long since the last good one: not yet.
  const once = [row('nea_outlook', 2.25, 0.1), row('lta_cameras', 0.1, 0.2), row('nea_hazemap', 0.1, null)];
  const since = onDemandFailingSince(once, {});
  assert.deepEqual(since, { nea_outlook: NOW - 0.1 * H });
  assert.deepEqual(names(once, since), []);
  // Still failing 20 min later: not yet; 30 min later: yes.
  assert.deepEqual(names([row('nea_outlook', 2.25, -0.2)], since), []);
  const later = [row('nea_outlook', 2.25, -0.4)];
  assert.deepEqual(onDemandFailingSince(later, since), since); // keeps the first failure
  assert.deepEqual(names(later, onDemandFailingSince(later, since)), ['nea_outlook']);
});

test('a good fetch between two ticks starts a new outage', () => {
  const since = { nea_outlook: NOW - 2 * H };
  const rows = [row('nea_outlook', 0.5, 0.1)];
  assert.deepEqual(onDemandFailingSince(rows, since), { nea_outlook: NOW - 0.1 * H });
  assert.deepEqual(names(rows, onDemandFailingSince(rows, since)), []);
  // Working again: dropped.
  assert.deepEqual(onDemandFailingSince([row('nea_outlook', 0.1, 0.5)], since), {});
});

test('a source DM’d as failing recovers once its latest fetch works', () => {
  const rows = [row('nea_psi', 0.1, 1), row('news_st', 7, 0.1), row('nea_weather', 0.1, 0.1)];
  assert.deepEqual(recoveredSources(rows, ['nea_psi', 'news_st', 'gone']), ['nea_psi']);
  // A tie (same second) counts as working: recordSource writes one or the other per fetch.
  assert.deepEqual(recoveredSources(rows, ['nea_weather']), ['nea_weather']);
});

test('the DM lists failures with their last good fetch, then recoveries', () => {
  const text = opsMessage([row('nea_psi', null, 0.1, 'x'.repeat(300))], ['news_st']);
  assert.match(text, /^⚠️ nea_psi failing: x{200} \(last good fetch never\)\n\n✅ Working again: news_st$/);
  assert.match(opsMessage([row('nea_pm25', 3, 0.1)], []), /last good fetch 2026-\d\d-\d\dT\d\d:\d\d:\d\d\+08:00\)$/);
});

test('the tick uploads the card only with an ops chat, no cached file id and time left', () => {
  const due = (o) => cardUploadDue({ chatId: '123', cached: false, elapsedMs: 3_000, ...o });
  assert.equal(due({}), 'upload');
  assert.equal(due({ chatId: null }), 'no ops_chat_id');
  assert.equal(due({ chatId: null, cached: true }), 'no ops_chat_id');
  assert.equal(due({ cached: true }), 'cached');
  assert.equal(due({ elapsedMs: CARD_UPLOAD_BY_MS - 1 }), 'upload');
  assert.equal(due({ elapsedMs: CARD_UPLOAD_BY_MS }), 'no time');
});
