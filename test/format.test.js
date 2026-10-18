import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatHaze, formatHazeCaption, formatShareCaption } from '../tgcloud/lib/format.js';
import { sgtHour } from '../tgcloud/lib/time.js';
import { AWAITED_EVERY_S, buildSnapshot, neaRefetchEveryS, REVISED_EVERY_S } from '../tgcloud/lib/snapshot.js';

test('sgtHour', () => {
  assert.equal(sgtHour('2026-10-16T13:00:00+08:00'), '1 pm');
  assert.equal(sgtHour('2026-10-16T13:30:00+08:00'), '1:30 pm');
  assert.equal(sgtHour('2026-10-16T00:00:00+08:00'), '12 am');
  assert.equal(sgtHour('2026-10-16T12:00:00+08:00'), '12 pm');
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
  assert.match(html, /11 pm SGT/);
});

test('the 24-hour PM2.5 average is NEA’s when its PSI item is for the latest hour, ours otherwise', () => {
  const history = Array.from({ length: 24 }, (_, i) => ({
    timestamp: `2026-10-16T${String(i).padStart(2, '0')}:00:00+08:00`,
    readings: { north: 100, west: 100, central: 100, east: 100, south: 100 },
  }));
  const readings = { psi_twenty_four_hourly: { north: 150 }, pm25_twenty_four_hourly: { north: 86 } };
  const north = (/** @type {string} */ timestamp) => buildSnapshot(history, { timestamp, readings }).regions.find((r) => r.id === 'north');
  assert.equal(north(history.at(-1).timestamp).pm25Mean24h, 86, 'NEA’s');
  assert.equal(north(history.at(-2).timestamp).pm25Mean24h, 100, 'PSI an hour behind: ours');
});

test('NEA is refetched often while the current hour is awaited, then for revisions', () => {
  const at = (/** @type {string} */ s) => Date.parse(s);
  const snap = { asOf: '2026-10-17T15:00:00+08:00', psiAsOf: '2026-10-17T15:00:00+08:00' };
  assert.equal(neaRefetchEveryS(snap, at('2026-10-17T15:40:00+08:00')), REVISED_EVERY_S, 'the hour is in');
  assert.equal(neaRefetchEveryS(snap, at('2026-10-17T15:40:00+08:00'), 1200), 1200, 'a user waits longer for revisions');
  assert.equal(neaRefetchEveryS(snap, at('2026-10-17T16:03:00+08:00')), REVISED_EVERY_S, 'too early for NEA to have 16:00');
  assert.equal(neaRefetchEveryS(snap, at('2026-10-17T16:05:00+08:00')), AWAITED_EVERY_S, '16:00 is due');
  assert.equal(neaRefetchEveryS(snap, at('2026-10-17T18:30:00+08:00')), AWAITED_EVERY_S, 'NEA missed hours');
  const psiBehind = { asOf: '2026-10-17T16:00:00+08:00', psiAsOf: '2026-10-17T15:00:00+08:00' };
  assert.equal(neaRefetchEveryS(psiBehind, at('2026-10-17T16:20:00+08:00')), AWAITED_EVERY_S, 'PM2.5 in, PSI not yet');
  assert.ok(REVISED_EVERY_S < 15 * 60, 'every 15-minute tick refetches');
});

test('the card caption: answer first, each advice line with its own emoji, no table', () => {
  const east = { id: 'east', name: 'East', pm25: 111, psi1h: 175, psi3h: 170, psi24h: 182 };
  const west = { id: 'west', name: 'West', pm25: 199, psi1h: 250, psi3h: 244, psi24h: 215 };
  const snap = {
    asOf: '2026-10-18T00:00:00+08:00',
    regions: [east, west],
    cigs: { past24h: 5.8 },
    worst: { psi3h: { region: 'west', name: 'West', value: 244 }, psi24h: { region: 'west', name: 'West', value: 215 }, pm25: { region: 'west', name: 'West', value: 199 } },
  };
  const lines = formatHazeCaption(snap, null, 'east').split('\n');
  assert.equal(lines[0], '🟡 <b>Unhealthy in East</b> · 24-hr PSI 182');
  assert.equal(lines[1], '🟠 Very unhealthy in West · 215');
  assert.equal(lines[2], '💨 Last hour’s PM2.5: High in West; Elevated in East · 12 am SGT');
  assert.ok(lines.filter((l) => l).every((l) => /^(\p{Extended_Pictographic}|<i>)/u.test(l)), 'every line starts with an emoji or is a note');
  assert.ok(lines.some((l) => l.startsWith('🧓 <b>Vulnerable people:</b>')));
  assert.doesNotMatch(lines.join('\n'), /<pre>|3-hr/, 'no table, and only NEA’s numbers');
  assert.match(formatHazeCaption(snap, null, null), /^🟠 <b>Very unhealthy in West<\/b> · 24-hr PSI 215\n🟡 Unhealthy in East · 182\n/);
});

test('the lead says where each 24-hr PSI band applies, never one band for the island', () => {
  const r = (/** @type {string} */ name, /** @type {number | null} */ psi24h, pm25 = 100) => ({ id: name.toLowerCase(), name, psi24h, pm25 });
  const at = (/** @type {any[]} */ regions) => {
    const snap = { asOf: '2026-10-18T08:00:00+08:00', regions, cigs: { past24h: 1 }, worst: { psi3h: null, psi24h: null, pm25: null } };
    return { lead: formatHazeCaption(snap, null, null).split('\n\n')[0], share: formatShareCaption(snap) };
  };
  const all = [r('North', 129), r('West', 228, 170), r('Central', 186), r('East', 179), r('South', 174)];
  const oct18 = at(all);
  assert.equal(oct18.lead, '🟠 <b>Very unhealthy in West</b> · 24-hr PSI 228\n🟡 Unhealthy elsewhere · 129–186\n💨 Last hour’s PM2.5: High in West; Elevated elsewhere · 8 am SGT');
  assert.equal(oct18.share, '<b>Singapore haze</b> · 8 am SGT\n🟠 <b>Very unhealthy in West</b> · 24-hr PSI 228\n🟡 Unhealthy elsewhere · 129–186\n<i>NEA’s readings.</i>');
  const one = at(all.map((x) => ({ ...x, psi24h: 150, pm25: 80 })));
  assert.match(one.lead, /^🟡 <b>Unhealthy island-wide<\/b> · 24-hr PSI 150\n💨 Last hour’s PM2.5: Elevated island-wide/);
  const three = at([r('North', 90), ...all.slice(1)]);
  assert.match(three.lead, /\n🟡 Unhealthy in Central, East, South · 174–186\n🔵 Moderate elsewhere · 90\n/);
  const gap = at([r('North', null), r('West', 228), r('Central', 150)]);
  assert.match(gap.lead, /\n🟡 Unhealthy in Central · 150\n⚪️ No reading in North\n/, 'not “elsewhere”: North has no reading, and it says so');
  const snap = { asOf: '2026-10-18T08:00:00+08:00', regions: all, cigs: { past24h: 1 }, worst: { psi3h: null, psi24h: null, pm25: null } };
  const east = formatHazeCaption({ ...snap, regions: [r('North', 129), r('West', 228), r('Central', 205), r('East', 210), r('South', 174)] }, null, 'east');
  assert.match(east, /^🟠 <b>Very unhealthy in East<\/b> · 24-hr PSI 210\n🟠 Very unhealthy in West, Central too · 205–228\n🟡 Unhealthy elsewhere · 129–174\n/, 'the area’s band again says “too”');
  assert.equal(at([r('North', null, null)]).lead, '⚪️ <b>No 24-hr PSI yet</b>\n💨 Last hour’s PM2.5: no reading · 8 am SGT');
});
