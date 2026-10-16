import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEESCALATE_HOLD_MS, dailyDue, nextAlertBand, runBatched, sgtHourOf } from '../tgcloud/lib/alert-rules.js';
import { applyAlertAction, isActive, parseAlertInput, renderAlertSettings } from '../tgcloud/lib/alert-settings.js';
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
  assert.deepEqual(applyAlertAction(null, 'a:band'), { bandAlerts: true, dailyHour: null, breakingAlerts: true }, 'turning on includes breaking news');
  const sub = { bandAlerts: true, dailyHour: null, breakingAlerts: true };
  assert.deepEqual(applyAlertAction(sub, 'a:band'), { ...sub, bandAlerts: false });
  assert.deepEqual(applyAlertAction(sub, 'a:breaking'), { ...sub, breakingAlerts: false });
  assert.deepEqual(applyAlertAction(sub, 'a:daily:8'), { ...sub, dailyHour: 8 });
  assert.deepEqual(applyAlertAction({ ...sub, dailyHour: 8 }, 'a:daily:off'), sub);
  assert.deepEqual(applyAlertAction(sub, 'a:daily:3'), sub, 'only offered hours are accepted');
  assert.equal(applyAlertAction(sub, 'a:stop'), null);
  // A row from before breaking news counts as on.
  assert.deepEqual(applyAlertAction({ bandAlerts: true, dailyHour: null }, 'a:breaking'), { ...sub, breakingAlerts: false });
});

test('breaking news alone keeps a chat subscribed', () => {
  assert.equal(isActive({ bandAlerts: false, dailyHour: null, breakingAlerts: true }), true);
  assert.equal(isActive({ bandAlerts: false, dailyHour: null, breakingAlerts: false }), false);
  assert.equal(isActive({ bandAlerts: false, dailyHour: null }), true, 'missing means on');
});

test('settings view marks the chosen hour and fits callback_data limits', () => {
  const view = renderAlertSettings({ bandAlerts: true, dailyHour: 18 });
  const buttons = view.reply_markup.inline_keyboard.flat();
  assert.ok(buttons.some((b) => b.text === '● 6 pm'));
  for (const b of buttons) assert.ok(Buffer.byteLength(b.callback_data) <= 64);
  assert.match(renderAlertSettings(null).text, /off/);
  assert.ok(buttons.some((b) => b.text === '✅ Breaking news'));
  const off = renderAlertSettings({ bandAlerts: true, dailyHour: null, breakingAlerts: false });
  assert.match(off.text, /Breaking news: <b>off<\/b>/);
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
  assert.deepEqual(parseAlertInput({ bandAlerts: true }), { bandAlerts: true, dailyHour: null, breakingAlerts: true });
  assert.deepEqual(parseAlertInput({ bandAlerts: false, dailyHour: 8 }), { bandAlerts: false, dailyHour: 8, breakingAlerts: true });
  assert.deepEqual(parseAlertInput({ bandAlerts: true, dailyHour: null, breakingAlerts: false }), { bandAlerts: true, dailyHour: null, breakingAlerts: false });
  assert.deepEqual(parseAlertInput({ bandAlerts: false, dailyHour: null, breakingAlerts: true }), { bandAlerts: false, dailyHour: null, breakingAlerts: true });
  assert.equal(parseAlertInput({ bandAlerts: false, dailyHour: null, breakingAlerts: false }), null);
  assert.equal(parseAlertInput({ bandAlerts: false, dailyHour: null }), null, 'an older build’s Stop all alerts still stops everything');
  assert.throws(() => parseAlertInput({ bandAlerts: true, breakingAlerts: 'yes' }));
  assert.throws(() => parseAlertInput({ bandAlerts: 'yes' }));
  assert.throws(() => parseAlertInput({ bandAlerts: true, dailyHour: 9 }));
  assert.throws(() => parseAlertInput(null));
});

/** A fake clock: each task takes `costMs`, sleep advances time. */
function fakeClock(costMs) {
  let t = 0;
  const batches = [];
  return {
    now: () => t,
    sleep: async (ms) => {
      t += ms;
    },
    task: (outcome = () => 'sent') => async (item) => {
      if (!batches.length || batches.at(-1).at !== t) batches.push({ at: t, items: [] });
      batches.at(-1).items.push(item);
      await Promise.resolve();
      t = Math.max(t, batches.at(-1).at + costMs);
      return outcome(item);
    },
    batches,
  };
}

const range = (n) => Array.from({ length: n }, (_, i) => i);

test('batches are parallel, sized, and paced to one per second', async () => {
  const c = fakeClock(200);
  const { results, stopped } = await runBatched(range(60), c.task(), { deadline: 60_000, now: c.now, sleep: c.sleep });
  assert.equal(stopped, null);
  assert.equal(results.length, 60);
  assert.deepEqual(c.batches.map((b) => b.items.length), [25, 25, 10]);
  assert.deepEqual(c.batches.map((b) => b.at), [0, 1000, 2000]);
});

test('stops before a batch that would overrun the budget, leaving the rest for the next run', async () => {
  const c = fakeClock(200);
  const { results, stopped } = await runBatched(range(200), c.task(), { deadline: 2500, now: c.now, sleep: c.sleep });
  assert.equal(stopped, 'budget');
  assert.equal(results.length, 50); // batches at 0 and 1000; one starting at 2000 is estimated to end at 3000
  assert.ok(c.now() <= 2500);
});

test('a slow batch raises the estimate for the next one', async () => {
  const c = fakeClock(1800);
  const { results, stopped } = await runBatched(range(100), c.task(), { deadline: 3000, now: c.now, sleep: c.sleep });
  assert.equal(stopped, 'budget');
  assert.equal(results.length, 25); // first ends at 1800; 1800 + 1800 > 3000
});

test('a rate-limited send stops the run after its batch', async () => {
  const c = fakeClock(100);
  const { results, stopped } = await runBatched(range(100), c.task((i) => (i === 30 ? 'limited' : 'sent')), {
    deadline: 60_000,
    now: c.now,
    sleep: c.sleep,
  });
  assert.equal(stopped, 'limited');
  assert.equal(results.length, 50);
});

test('without timers, batches run back to back', async () => {
  const c = fakeClock(100);
  await runBatched(range(60), c.task(), { deadline: 60_000, now: c.now });
  assert.deepEqual(c.batches.map((b) => b.at), [0, 100, 200]);
});
