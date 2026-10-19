import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CARD_UPLOAD_BY_MS, cardUploadDue, failingSources, isOnDemand, opsMessage, recoveredSources } from '../tgcloud/lib/ops-rules.js';

const NOW = 1_792_000_000;
const H = 3600;
const ago = (h) => (h === null ? null : NOW - h * H);
// failingSince defaults to the latest error, as recordSource writes it after one failure.
const row = (source, lastOkAgoH, lastErrorAgoH, lastError = 'HTTP 500', failingSinceAgoH = lastErrorAgoH) => ({
  source,
  lastOkAt: ago(lastOkAgoH),
  lastErrorAt: ago(lastErrorAgoH),
  lastError: lastErrorAgoH === null ? null : lastError,
  failingSince: ago(failingSinceAgoH),
});
const names = (rows) => failingSources(rows, NOW).map((s) => s.source);

test('NEA fails only after 2 hours without a good fetch', () => {
  assert.deepEqual(names([row('nea_psi', 1.5, 0.1), row('nea_pm25', 2.5, 0.1)]), ['nea_pm25']);
  assert.deepEqual(names([row('nea_psi', 3, 3.5)]), []); // the latest fetch worked
  assert.deepEqual(names([row('nea_psi', null, 0.1)]), ['nea_psi']); // never worked
});

test('news fails after 6 hours', () => {
  assert.deepEqual(names([row('news_st', 5, 0.1), row('news_cna', 7, 0.1)]), ['news_cna']);
  assert.deepEqual(['nea_psi', 'news_st', 'nea_outlook', 'lta_cameras'].map(isOnDemand), [false, false, true, true]);
});

test('an on-demand feed fails once it fails again 30 min after it started failing', () => {
  // One failed fetch, however long since the last good one: not yet.
  assert.deepEqual(names([row('nea_outlook', 2.25, 0.1), row('lta_cameras', 0.1, 0.2), row('nea_hazemap', 0.1, null)]), []);
  assert.deepEqual(names([row('nea_outlook', 3, 0.1, 'x', 0.4)]), []); // 18 min on
  assert.deepEqual(names([row('nea_outlook', 3, 0.1, 'x', 0.6)]), ['nea_outlook']); // 30 min on
  assert.deepEqual(names([row('nea_outlook', 3, 0.1, 'x', null)]), []); // failing since before the column
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
