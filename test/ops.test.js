import assert from 'node:assert/strict';
import { test } from 'node:test';
import { failingSources, opsMessage, recoveredSources } from '../tgcloud/lib/ops-rules.js';

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
