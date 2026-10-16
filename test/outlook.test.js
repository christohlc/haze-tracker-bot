import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parseOutlook } from '../tgcloud/lib/outlook-parse.js';
import { nextHours } from '../tgcloud/lib/range.js';
import { pm25ToPsi } from '../tgcloud/lib/psi.js';
import { sgtDayName } from '../tgcloud/lib/time.js';

// NEA's haze situation update as fetched on 16 Oct 2026, 6:31 pm SGT.
const sample = JSON.parse(readFileSync(new URL('./nea-outlook.json', import.meta.url), 'utf8'));
const at = (iso) => Date.parse(iso);
const DAY_OF = at('2026-10-16T09:00:00+08:00');

test('reads NEA’s forecast', () => {
  assert.deepEqual(parseOutlook(sample, DAY_OF), {
    text: 'Unhealthy to Low Very Unhealthy',
    from: 'unhealthy',
    to: 'very_unhealthy',
    forDate: '2026-10-16',
    issuedAt: '2026-10-15T18:19:00+08:00',
    expires: null,
  });
  // Times come back in SGT whatever offset NEA uses.
  assert.equal(parseOutlook({ ...sample, DateOfArticle: '2026-10-15T10:19:00Z' }, DAY_OF)?.issuedAt, '2026-10-15T18:19:00+08:00');
});

test('handles NEA’s other wordings', () => {
  const blurb = (text) => ({ ...sample, AirQualityBlurb: `24-hr PSI Forecast: ${text}` });
  assert.deepEqual(
    [blurb('High Moderate to Mid Unhealthy'), blurb('Moderate &ndash; Low Unhealthy'), blurb('Good')].map((j) => {
      const o = parseOutlook(j, DAY_OF);
      return o && [o.from, o.to];
    }),
    [
      ['moderate', 'unhealthy'],
      ['moderate', 'unhealthy'],
      ['good', 'good'],
    ],
  );
  // No short line: the underlined sentence in the body.
  assert.equal(parseOutlook({ ...sample, AirQualityBlurb: '' }, DAY_OF)?.text, 'Unhealthy to Low Very Unhealthy');
  assert.equal(parseOutlook(blurb('Moderate&#x2013;Low&nbsp;Unhealthy &amp; worse'), DAY_OF), null, 'three parts');
  assert.deepEqual(parseOutlook(blurb('Moderate &#8211; Low&nbsp;Unhealthy'), DAY_OF)?.text, 'Moderate – Low Unhealthy');
});

test('no forecast when it’s for a past day, expired, or unreadable', () => {
  assert.equal(parseOutlook(sample, at('2026-10-17T00:05:00+08:00')), null);
  assert.equal(parseOutlook({ ...sample, ExpiryDateHazeDisplayDt: '2026-10-16T08:00:00+08:00' }, DAY_OF), null);
  assert.equal(parseOutlook({ ...sample, ExpiryDateHazeDisplay: '2026-10-16T08:00:00+08:00' }, DAY_OF), null);
  // Days ahead of tomorrow mean a misread date, not a forecast.
  assert.equal(parseOutlook(sample, at('2026-10-10T09:00:00+08:00')), null);
  assert.equal(parseOutlook({ ...sample, AirQualityBlurb: '24-hr PSI Forecast: Smoky', BodyText: '' }, DAY_OF), null);
  for (const junk of [null, {}, 'oops', { BodyText: 42 }]) assert.equal(parseOutlook(junk, DAY_OF), null);
});

test('today, tomorrow or a date', () => {
  assert.deepEqual(
    ['2026-10-16', '2026-10-17', '2026-10-19'].map((d) => sgtDayName(d, at('2026-10-16T23:30:00+08:00'))),
    ['today', 'tomorrow', 'on 19 Oct'],
  );
});

/** `days` of hourly rows, every region at pm(i). */
const END = at('2026-10-01T00:00:00+08:00');
const rows = (days, pm) =>
  Array.from({ length: days * 24 }, (_, i) => {
    const v = pm(i);
    return { timestamp: new Date(END - (days * 24 - 1 - i) * 3600_000).toISOString(), readings: { north: v, south: v, east: v, west: v, central: v } };
  });
const NOW = END + 30 * 60_000;

test('the range brackets the reading and widens with the hours', () => {
  const r = nextHours(rows(14, (i) => 40 + 20 * Math.sin(i / 5) + (i % 7)), NOW);
  assert.ok(r);
  assert.deepEqual(r.steps.map((s) => s.h), [1, 3, 6]);
  for (const s of r.steps) assert.ok(s.lo <= r.now && r.now <= s.hi, `+${s.h}h ${s.lo}–${s.hi} around ${r.now}`);
  assert.ok(r.steps[0].hi - r.steps[0].lo < r.steps[2].hi - r.steps[2].lo);
});

test('a steady reading stays put; too little or old history gives no range', () => {
  const flat = nextHours(rows(3, () => 30), NOW);
  assert.ok(flat, 'three days is enough');
  for (const s of flat.steps) assert.deepEqual([s.lo, s.hi], [pm25ToPsi(30), pm25ToPsi(30)]);
  assert.equal(nextHours(rows(2, () => 30), NOW), null);
  assert.equal(nextHours(rows(14, () => 30), END + 4 * 3600_000), null, 'NEA stopped updating');
  assert.equal(nextHours([], NOW), null);
});
