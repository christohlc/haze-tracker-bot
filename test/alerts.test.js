import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEESCALATE_HOLD_MS, dailyDue, dailyForecastDue, nextAlertBand, runBatched, sgtHourOf } from '../tgcloud/lib/alert-rules.js';
import { applyAlertAction, isActive, parseAlertInput, renderAlertSettings } from '../tgcloud/lib/alert-settings.js';
import { formatBandAlert, formatHaze } from '../tgcloud/lib/format.js';

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
  assert.deepEqual(applyAlertAction(null, 'a:band'), { bandAlerts: true, dailyHour: null, breakingAlerts: true, region: null }, 'turning on includes breaking news');
  const sub = { bandAlerts: true, dailyHour: null, breakingAlerts: true, region: null };
  assert.deepEqual(applyAlertAction(sub, 'a:band'), { ...sub, bandAlerts: false });
  assert.deepEqual(applyAlertAction(sub, 'a:breaking'), { ...sub, breakingAlerts: false });
  assert.deepEqual(applyAlertAction(sub, 'a:daily:8'), { ...sub, dailyHour: 8 });
  assert.deepEqual(applyAlertAction({ ...sub, dailyHour: 8 }, 'a:daily:off'), sub);
  assert.deepEqual(applyAlertAction(sub, 'a:daily:3'), sub, 'only offered hours are accepted');
  assert.equal(applyAlertAction(sub, 'a:stop'), null);
  assert.deepEqual(applyAlertAction(sub, 'a:region:west'), { ...sub, region: 'west' });
  assert.deepEqual(applyAlertAction({ ...sub, region: 'west' }, 'a:region:all'), sub);
  assert.deepEqual(applyAlertAction(sub, 'a:region:mars'), sub, 'unknown regions mean island-wide');
});

test('breaking news alone keeps a chat subscribed', () => {
  assert.equal(isActive({ bandAlerts: false, dailyHour: null, breakingAlerts: true }), true);
  assert.equal(isActive({ bandAlerts: false, dailyHour: null, breakingAlerts: false }), false);
});

test('settings view marks the chosen hour and fits callback_data limits', () => {
  const view = renderAlertSettings({ bandAlerts: true, dailyHour: 18, breakingAlerts: true, region: 'central' });
  const buttons = view.reply_markup.inline_keyboard.flat();
  assert.ok(buttons.some((b) => b.text === '● 6 pm'));
  for (const b of buttons) assert.ok(Buffer.byteLength(b.callback_data) <= 64);
  assert.match(renderAlertSettings(null).text, /off/);
  assert.ok(buttons.some((b) => b.text === '✅ Breaking news'));
  assert.ok(buttons.some((b) => b.text === '● Central'));
  assert.match(view.text, /3-hour PSI in <b>Central<\/b>/);
  const off = renderAlertSettings({ bandAlerts: true, dailyHour: null, breakingAlerts: false, region: null });
  assert.match(off.text, /in <b>the highest region<\/b>/);
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
  assert.match(up, /worst region \(Central\)/);
});

test('a chat following a region hears about that region, and where the highest is', () => {
  const snap = {
    asOf: '2026-10-16T13:00:00+08:00',
    regions: [
      { id: 'north', name: 'North', psi3h: 184, psi24h: 155, pm25: 135 },
      { id: 'central', name: 'Central', psi3h: 221, psi24h: 226, pm25: 169 },
    ],
    worst: { psi3h: { region: 'central', name: 'Central', value: 221 }, psi24h: { value: 226 }, pm25: { value: 169 } },
    cigs: { past24h: 1 },
  };
  const north = formatBandAlert(snap, 'moderate', 'unhealthy', 'north');
  assert.match(north, /3-hour PSI <b>184<\/b>, North; highest Central 221/);
  assert.match(north, /Outside now:<\/b> Go easy/, 'advice from North’s readings, not the highest');
  assert.match(formatBandAlert(snap, 'unhealthy', 'very_unhealthy', 'central'), /, Central ·/, 'no “highest” when it is the highest');
  assert.match(formatHaze(snap, null, { region: 'north' }), /<b>PSI 184<\/b> · Unhealthy/);
  assert.match(formatHaze(snap, null, { region: 'mars' }), /<b>PSI 221<\/b>/, 'unknown region falls back to the highest');
});

test('Mini App alert settings are validated, and all-off means unsubscribe', () => {
  assert.deepEqual(parseAlertInput({ bandAlerts: true }), { bandAlerts: true, dailyHour: null, breakingAlerts: true, region: null });
  assert.deepEqual(parseAlertInput({ bandAlerts: false, dailyHour: 8 }), { bandAlerts: false, dailyHour: 8, breakingAlerts: true, region: null });
  assert.deepEqual(parseAlertInput({ bandAlerts: true, dailyHour: null, breakingAlerts: false }), { bandAlerts: true, dailyHour: null, breakingAlerts: false, region: null });
  assert.deepEqual(parseAlertInput({ bandAlerts: false, dailyHour: null, breakingAlerts: true }), { bandAlerts: false, dailyHour: null, breakingAlerts: true, region: null });
  assert.equal(parseAlertInput({ bandAlerts: false, dailyHour: null, breakingAlerts: false }), null);
  assert.equal(parseAlertInput({ bandAlerts: false, dailyHour: null }), null, 'an older build’s Stop all alerts still stops everything');
  // An older build saving band or daily keeps breaking news as the chat set it.
  assert.equal(parseAlertInput({ bandAlerts: true }, { breakingAlerts: false })?.breakingAlerts, false);
  assert.equal(parseAlertInput({ bandAlerts: true }, { breakingAlerts: true })?.breakingAlerts, true);
  assert.throws(() => parseAlertInput({ bandAlerts: true, breakingAlerts: 'yes' }));
  assert.throws(() => parseAlertInput({ bandAlerts: 'yes' }));
  assert.throws(() => parseAlertInput({ bandAlerts: true, dailyHour: 9 }));
  assert.throws(() => parseAlertInput(null));
  assert.equal(parseAlertInput({ bandAlerts: true, region: 'east' })?.region, 'east');
  assert.equal(parseAlertInput({ bandAlerts: true }, { breakingAlerts: true, region: 'east' })?.region, 'east', 'an older build keeps the region');
  assert.equal(parseAlertInput({ bandAlerts: true, region: null }, { breakingAlerts: true, region: 'east' })?.region, null);
  assert.throws(() => parseAlertInput({ bandAlerts: true, region: 'mars' }));
  assert.throws(() => parseAlertInput({ bandAlerts: true, region: 'toString' }), 'inherited names aren’t regions');
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

test('each area keeps its own alert band, and chats hear about theirs', async () => {
  const { advanceBands, bandAlertsFor, scopeOf, DEESCALATE_HOLD_MS: hold } = await import('../tgcloud/lib/alert-rules.js');
  const snap = (north, central) => ({
    worst: { psi3h: { value: Math.max(north, central) } },
    regions: [
      { id: 'north', psi3h: north },
      { id: 'central', psi3h: central },
    ],
  });
  const t0 = 1_000_000;
  const first = advanceBands({}, snap(90, 150), t0);
  assert.equal(first.north.id, 'moderate');
  assert.equal(first.central.id, 'unhealthy');
  assert.equal(first.highest.id, 'unhealthy');
  assert.equal(first.west, undefined, 'no reading, no band');

  // North rises at once; Central dropping waits for the hold.
  const next = advanceBands(first, snap(120, 90), t0 + 60_000);
  assert.equal(next.north.id, 'unhealthy');
  assert.equal(next.central, first.central);
  assert.equal(advanceBands(next, snap(120, 90), t0 + hold + 60_000).central.id, 'moderate');

  const subs = [
    { chatId: 1, region: 'north', lastBand: 'moderate' },
    { chatId: 2, region: 'central', lastBand: 'unhealthy' },
    { chatId: 3, region: null, lastBand: 'unhealthy' },
    { chatId: 4, region: 'north', lastBand: null },
    { chatId: 5, region: 'toString', lastBand: 'moderate' },
  ];
  const { due, unseeded } = bandAlertsFor(subs, next);
  assert.deepEqual(due.map((d) => [d.sub.chatId, d.scope, d.band.id]), [
    [1, 'north', 'unhealthy'],
    [5, 'highest', 'unhealthy'],
  ], 'an unknown region follows the highest');
  assert.deepEqual(unseeded.map((d) => d.sub.chatId), [4]);
  assert.equal(scopeOf('constructor'), 'highest');
});

test('readings for an area, or the highest for each reading', async () => {
  const { readingsFor } = await import('../tgcloud/lib/snapshot.js');
  const snap = {
    regions: [
      { id: 'north', name: 'North', psi3h: 184, psi24h: null, pm25: 135, trend: 'steady' },
      { id: 'central', name: 'Central', psi3h: 221, psi24h: 226, pm25: 169, trend: 'rising' },
    ],
    worst: { psi3h: { region: 'central', name: 'Central', value: 221 }, psi24h: { region: 'central', name: 'Central', value: 226 }, pm25: { region: 'central', name: 'Central', value: 169 } },
  };
  const north = readingsFor(snap, 'north');
  assert.equal(north.area?.id, 'north');
  assert.deepEqual(north.psi3h, { region: 'north', name: 'North', value: 184 });
  assert.equal(north.psi24h, null, 'a missing reading stays missing rather than borrowing another region’s');
  assert.equal(north.trend, 'steady');
  const top = readingsFor(snap, null);
  assert.equal(top.area, null);
  assert.equal(top.pm25?.name, 'Central');
  assert.equal(top.trend, 'rising');
});

test('the daily update brings the forecast on hazy days only', () => {
  const range = (hi) => ({ now: 60, steps: [{ h: 1, t: '2026-10-17T14:00:00+08:00', lo: 40, hi }] });
  const outlook = { text: 'Moderate', from: 'moderate', to: 'moderate', psi: null, forDate: '2026-10-18', issuedAt: '2026-10-17T18:00:00+08:00', expires: null };
  assert.equal(dailyForecastDue(null), false);
  assert.equal(dailyForecastDue({ outlook: null, range: null }), false);
  assert.equal(dailyForecastDue({ outlook: null, range: range(100) }), false, 'clear day: Moderate at most');
  assert.equal(dailyForecastDue({ outlook: null, range: range(101) }), true);
  assert.equal(dailyForecastDue({ outlook, range: null }), true, 'NEA issues it only during haze episodes');
});
