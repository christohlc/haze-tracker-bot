import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEESCALATE_HOLD_MS, dailyDue, nextAlertBand, sgtHourOf } from '../tgcloud/lib/alert-rules.js';
import { applyAlertAction, parseAlertInput, renderAlertSettings } from '../tgcloud/lib/alert-settings.js';
import { formatBandAlert } from '../tgcloud/lib/format.js';

const H = 3600_000;

test('first reading sets the band without an alert-worthy change', () => {
  assert.deepEqual(nextAlertBand(null, 'unhealthy', 0), { id: 'unhealthy', at: 0 });
  assert.equal(nextAlertBand(null, null, 0), null);
});

test('rises are announced immediately', () => {
  const prev = { id: 'unhealthy', at: 0 };
  assert.deepEqual(nextAlertBand(prev, 'very_unhealthy', 10 * 60_000), { id: 'very_unhealthy', at: 10 * 60_000 });
});

test('drops wait for the hold so a boundary wobble does not spam', () => {
  const prev = { id: 'very_unhealthy', at: 0 };
  assert.equal(nextAlertBand(prev, 'unhealthy', 2 * H), prev);
  assert.deepEqual(nextAlertBand(prev, 'unhealthy', DEESCALATE_HOLD_MS), { id: 'unhealthy', at: DEESCALATE_HOLD_MS });
});

test('same band and missing data keep the previous band', () => {
  const prev = { id: 'good', at: 5 };
  assert.equal(nextAlertBand(prev, 'good', 99 * H), prev);
  assert.equal(nextAlertBand(prev, null, 99 * H), prev);
});

test('daily update window catches a late cron but not the next day', () => {
  assert.equal(dailyDue(8, 7), false);
  assert.equal(dailyDue(8, 8), true);
  assert.equal(dailyDue(8, 10), true);
  assert.equal(dailyDue(8, 11), false);
  assert.equal(dailyDue(null, 8), false);
});

test('sgtHourOf converts to Singapore time', () => {
  assert.equal(sgtHourOf(Date.parse('2026-10-16T00:30:00Z')), 8);
  assert.equal(sgtHourOf(Date.parse('2026-10-16T16:00:00Z')), 0);
});

test('settings actions', () => {
  assert.deepEqual(applyAlertAction(null, 'a:band'), { bandAlerts: true, dailyHour: null });
  const sub = { bandAlerts: true, dailyHour: null };
  assert.deepEqual(applyAlertAction(sub, 'a:band'), { bandAlerts: false, dailyHour: null });
  assert.deepEqual(applyAlertAction(sub, 'a:daily:8'), { bandAlerts: true, dailyHour: 8 });
  assert.deepEqual(applyAlertAction({ ...sub, dailyHour: 8 }, 'a:daily:off'), { bandAlerts: true, dailyHour: null });
  assert.deepEqual(applyAlertAction(sub, 'a:daily:3'), sub, 'only offered hours are accepted');
  assert.equal(applyAlertAction(sub, 'a:stop'), null);
});

test('settings view marks the chosen hour and fits callback_data limits', () => {
  const view = renderAlertSettings({ bandAlerts: true, dailyHour: 18 });
  const buttons = view.reply_markup.inline_keyboard.flat();
  assert.ok(buttons.some((b) => b.text === '● 6 pm'));
  for (const b of buttons) assert.ok(Buffer.byteLength(b.callback_data) <= 64);
  assert.match(renderAlertSettings(null).text, /off/);
});

test('band alert says up/down and from what', () => {
  const snap = {
    asOf: '2026-10-16T13:00:00+08:00',
    worst: {
      psi3h: { name: 'Central', value: 221 },
      psi24h: { value: 226 },
      pm25: { value: 169 },
    },
  };
  const up = formatBandAlert(snap, 'unhealthy', 'very_unhealthy');
  assert.match(up, /Haze up to Very unhealthy<\/b> \(was Unhealthy\)/);
  assert.match(up, /1:00 pm SGT/);
  assert.match(formatBandAlert(snap, 'hazardous', 'very_unhealthy'), /Haze down to/);
});

test('Mini App alert settings are validated, and all-off means unsubscribe', () => {
  assert.deepEqual(parseAlertInput({ bandAlerts: true }), { bandAlerts: true, dailyHour: null });
  assert.deepEqual(parseAlertInput({ bandAlerts: false, dailyHour: 8 }), { bandAlerts: false, dailyHour: 8 });
  assert.equal(parseAlertInput({ bandAlerts: false, dailyHour: null }), null);
  assert.throws(() => parseAlertInput({ bandAlerts: 'yes' }));
  assert.throws(() => parseAlertInput({ bandAlerts: true, dailyHour: 9 }));
  assert.throws(() => parseAlertInput(null));
});
