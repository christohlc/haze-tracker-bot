import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CARD_UPLOAD_BY_MS, cardUploadDue, failingSources, isOnDemand, opsMessage, recoveredSources } from '../tgcloud/lib/ops-rules.js';

const NOW = 1_792_000_000;
const H = 3600;
const row = (source, lastOkAgoH, lastErrorAgoH, lastError = 'HTTP 500') => ({
  source,
  lastOkAt: lastOkAgoH === null ? null : NOW - lastOkAgoH * H,
  lastErrorAt: lastErrorAgoH === null ? null : NOW - lastErrorAgoH * H,
  lastError: lastErrorAgoH === null ? null : lastError,
});
const names = (rows) => failingSources(rows, NOW).map((s) => s.source);

test('NEA fails only after 2 hours without a good fetch', () => {
  assert.deepEqual(names([row('nea_psi', 1.5, 0.1), row('nea_pm25', 2.5, 0.1)]), ['nea_pm25']);
  assert.deepEqual(names([row('nea_psi', 3, 3.5)]), []); // the latest fetch worked
  assert.deepEqual(names([row('nea_psi', null, 0.1)]), ['nea_psi']); // never worked
});

test('news fails after 6 hours, on-demand feeds as soon as the latest fetch failed', () => {
  assert.deepEqual(names([row('news_st', 5, 0.1), row('news_cna', 7, 0.1)]), ['news_cna']);
  assert.deepEqual(names([row('nea_weather', 0.2, 0.1), row('lta_cameras', 0.1, 0.2)]), ['nea_weather']);
  assert.deepEqual(names([row('nea_hazemap', 0.1, null)]), []);
  assert.deepEqual(['nea_psi', 'news_st', 'nea_outlook', 'lta_cameras'].map(isOnDemand), [false, false, true, true]);
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
