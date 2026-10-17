import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verdict } from '../tgcloud/lib/advice.js';
import { formatBandAlert, formatBreaking, formatHaze } from '../tgcloud/lib/format.js';

const rank = (psi, pm, group = 'general') => verdict(psi, pm, group)?.rank;

test('the stricter of 24-hr PSI and 1-hr PM2.5 decides', () => {
  assert.equal(rank(185, 180), 3); // Unhealthy PSI (1) vs PM2.5 Band III (3)
  assert.equal(rank(320, 40), 3); // Hazardous PSI (3) vs Band I (0)
});

test('24-hr PSI band edges, PM2.5 held at Band I', () => {
  assert.deepEqual([rank(100, 0), rank(101, 0)], [0, 1]);
  assert.deepEqual([rank(200, 0), rank(201, 0)], [1, 2]);
  assert.deepEqual([rank(300, 0), rank(301, 0)], [2, 3]);
});

test('1-hr PM2.5 band edges, no PSI', () => {
  assert.deepEqual([rank(null, 55), rank(null, 56)], [0, 1]);
  assert.deepEqual([rank(null, 150), rank(null, 151)], [1, 3]);
  assert.deepEqual([rank(null, 250), rank(null, 251)], [3, 4]);
});

test('vulnerable people take NEA’s stricter 24-hr PSI rows; PM2.5 advice is the same for all', () => {
  assert.deepEqual([rank(150, 0, 'vulnerable'), rank(250, 0, 'vulnerable'), rank(350, 0, 'vulnerable')], [2, 3, 4]);
  assert.equal(rank(50, 0, 'vulnerable'), 0);
  assert.equal(rank(null, 100, 'vulnerable'), rank(null, 100));
});

test('no readings, no verdict', () => {
  assert.equal(verdict(null, null, 'general'), null);
  assert.equal(verdict(250, null, 'general')?.headline, 'Skip long or hard exercise outdoors.');
});

// Every band edge of the 24-hour PSI and 1-hour PM2.5, plus no reading.
const PSIS = [null, 0, 50, 51, 100, 101, 200, 201, 300, 301, 500];
const PM25S = [null, 0, 55, 56, 150, 151, 250, 251, 400];
const GROUPS = ['general', 'vulnerable'];

test('the mask headline is the verdict’s short form: one per rank, never contradicting it', () => {
  const titleOf = new Map();
  for (const psi of PSIS)
    for (const pm of PM25S)
      for (const group of GROUPS) {
        const v = verdict(psi, pm, group);
        if (!v) {
          assert.ok(psi == null && pm == null);
          continue;
        }
        if (titleOf.has(v.rank)) assert.deepEqual(v.mask, titleOf.get(v.rank), `rank ${v.rank} at PSI ${psi}, PM2.5 ${pm}`);
        else titleOf.set(v.rank, v.mask);
      }
  assert.deepEqual([...titleOf.keys()].sort(), [0, 1, 2, 3, 4]);
  assert.equal(new Set([...titleOf.values()].map((m) => m.title)).size, 5); // the title alone says which rank
  assert.equal(titleOf.get(3).title, 'Mask up'); // docs/design.md, "Answer first"
});

test('bot messages give the same advice in the 😷 line and Outside now, whatever the 3-hour PSI', () => {
  const mask = (text) => text.match(/😷 <b>(.+?)\.<\/b>/)?.[1];
  const outside = (text) => text.match(/Outside now:<\/b> (.+)/)?.[1];
  for (const psi of PSIS)
    for (const pm of PM25S)
      for (const psi3h of [20, 400]) {
        const snap = {
          asOf: '2026-10-17T13:00:00+08:00',
          regions: [],
          cigs: { past24h: 1 },
          worst: { psi3h: { name: 'West', value: psi3h }, psi24h: psi == null ? null : { name: 'West', value: psi }, pm25: pm == null ? null : { name: 'West', value: pm } },
        };
        const v = verdict(psi, pm, 'general');
        const texts = [formatHaze(snap), formatBandAlert(snap, 'good', 'hazardous')];
        if (psi != null) texts.push(formatBreaking({ kind: 'psi24', band: 'hazardous', value: psi }, snap));
        for (const text of texts) {
          assert.equal(mask(text), v?.mask.title, `PSI ${psi}, PM2.5 ${pm}, 3h ${psi3h}`);
          assert.equal(outside(text), v?.headline);
        }
      }
});

test('PM2.5 trend compares the latest hour with three hours earlier, by time', async () => {
  const { pm25Trend } = await import('../tgcloud/lib/snapshot.js');
  const at = (h) => `2026-10-17T${String(h).padStart(2, '0')}:00:00+08:00`;
  const rows = (vals) => vals.map(([h, v]) => ({ t: at(h), west: v }));
  assert.equal(pm25Trend(rows([[9, 100], [10, 110], [11, 120], [12, 140]]), 'west'), 'rising');
  assert.equal(pm25Trend(rows([[9, 140], [12, 100]]), 'west'), 'easing'); // gap in between is fine
  assert.equal(pm25Trend(rows([[9, 100], [12, 108]]), 'west'), 'steady');
  assert.equal(pm25Trend(rows([[10, 100], [11, 100], [12, 200]]), 'west'), null); // 9 am missing
});
