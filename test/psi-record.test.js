import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PEAKS, THROUGH } from '../tgcloud/lib/psi-history.js';
import { hazePsi, highestSince, notePeak, recordText } from '../tgcloud/lib/psi-record.js';

const after = (days) => new Date(Date.parse(THROUGH) + days * 86_400_000).toISOString().slice(0, 10);
const top = Math.max(...PEAKS.map(([, v]) => v));

test('psi-history.js lists only days above 100, oldest first', () => {
  assert.ok(PEAKS.every(([, v]) => v > 100));
  assert.deepEqual(PEAKS.map(([d]) => d), PEAKS.map(([d]) => d).sort());
  assert.ok(PEAKS.every(([d]) => d >= '2016-02-01' && d <= THROUGH));
});

test('nothing to say at 100 or under', () => {
  assert.equal(highestSince(100, after(1)), null);
  assert.equal(highestSince(null, after(1)), null);
});

test('above every day since 2016 but under 2015’s peak: since 2015', () => {
  if (top >= 321) return; // the history already holds a day as high
  assert.deepEqual(highestSince(top + 1, after(1)), { since: '2015' });
  assert.equal(recordText({ since: '2015' }), 'Singapore’s worst haze since 2015');
  assert.equal(recordText({ since: '2019-09-19' }), 'Singapore’s worst haze since Sep 2019');
});

test('above 2015’s peak too', () => {
  assert.deepEqual(highestSince(400, after(1)), { since: null });
  assert.equal(recordText({ since: null }), 'Singapore’s worst haze since at least 2015');
});

test('a day as high within the last year says nothing', () => {
  const kept = notePeak([], after(1), 300);
  assert.equal(highestSince(290, after(2), kept), null);
  assert.deepEqual(highestSince(290, after(400), kept), { since: after(1) });
});

test('today’s own earlier peak doesn’t count', () => {
  const kept = notePeak([], after(1), 300);
  assert.notEqual(highestSince(250, after(1), kept), null);
});

test('notePeak keeps each day’s highest, after the history only', () => {
  let kept = notePeak([], after(2), 150);
  kept = notePeak(kept, after(1), 120);
  assert.equal(notePeak(kept, after(2), 140), kept);
  kept = notePeak(kept, after(2), 160);
  assert.deepEqual(kept, [[after(1), 120], [after(2), 160]]);
  assert.equal(notePeak(kept, after(3), 90), kept);
  assert.equal(notePeak(kept, THROUGH, 500), kept);
});

test('hazePsi caps each region at its PM2.5 sub-index, so ozone isn’t haze', () => {
  // North's 124 is ozone: its 24-hour PM2.5 of 15 µg/m³ is a sub-index of 53; West’s 60 caps at 57.
  assert.equal(hazePsi([{ psi24h: 124, pm25Mean24h: 15 }, { psi24h: 60, pm25Mean24h: 18 }]), 57);
  assert.equal(hazePsi([{ psi24h: 212, pm25Mean24h: 160 }]), 210);
  assert.equal(hazePsi([{ psi24h: 150, pm25Mean24h: null }]), 150);
  assert.equal(hazePsi([{ psi24h: null, pm25Mean24h: 80 }]), null);
});
