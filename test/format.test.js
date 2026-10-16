import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatHaze, sgtTime } from '../tgcloud/lib/format.js';
import { buildSnapshot } from '../tgcloud/lib/snapshot.js';

test('sgtTime', () => {
  assert.equal(sgtTime('2026-10-16T13:00:00+08:00'), '1:00 pm');
  assert.equal(sgtTime('2026-10-16T00:00:00+08:00'), '12:00 am');
  assert.equal(sgtTime('2026-10-16T12:00:00+08:00'), '12:00 pm');
});

test('buildSnapshot + formatHaze on the site example', () => {
  const now = { north: 152, west: 157, central: 177, east: 168, south: 194 };
  const history = Array.from({ length: 24 }, (_, i) => ({
    timestamp: `2026-10-16T${String(i).padStart(2, '0')}:00:00+08:00`,
    readings: i === 23 ? now : { north: 100, west: 100, central: 100, east: 100, south: 100 },
  }));
  const psi = {
    timestamp: history.at(-1).timestamp,
    readings: { psi_twenty_four_hourly: { north: 153, west: 202, central: 226, east: 205, south: 184 } },
  };
  const snap = buildSnapshot(history, psi);
  assert.equal(snap.worst.psi1h.value, 244);
  assert.equal(snap.worst.psi1h.name, 'South');
  assert.equal(snap.worst.psi24h.value, 226);
  const html = formatHaze(snap);
  assert.match(html, /<pre>Region/);
  assert.match(html, /11:00 pm SGT/);
});
