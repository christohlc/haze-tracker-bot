import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sgtDatesBack, sgtDayStart, toSgtIso } from '../tgcloud/lib/time.js';

test('lists SGT dates back from today, newest first', () => {
  // 16 Oct, 7:30 am SGT is still 15 Oct in UTC.
  const now = Date.parse('2026-10-16T07:30:00+08:00');
  assert.deepEqual(sgtDatesBack(3, now), ['2026-10-16', '2026-10-15', '2026-10-14']);
  assert.deepEqual(sgtDatesBack(2, Date.parse('2026-03-01T00:10:00+08:00')), ['2026-03-01', '2026-02-28']);
  assert.equal(sgtDatesBack(15, now).length, 15);
});

test('starts an SGT day at midnight SGT', () => {
  assert.equal(toSgtIso(sgtDayStart('2026-10-16')), '2026-10-16T00:00:00+08:00');
  assert.equal(sgtDayStart('2026-10-17') - sgtDayStart('2026-10-16'), 86_400);
});
