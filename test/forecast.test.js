import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  combineForecast,
  forecastLine,
  forecastName,
  forecastSmokeLine,
  next24hLabel,
  parse24h,
  parse4day,
} from '../tgcloud/lib/forecast-parse.js';
import { sgtWeekday } from '../tgcloud/lib/time.js';

// Copies of NEA's real feeds from data.gov.sg (17 Oct 2026, about 11.40 am).
const load = (name) => JSON.parse(readFileSync(new URL(`./forecast-${name}.json`, import.meta.url), 'utf8'));
const NEXT24H = parse24h(load('24h'));
const OUTLOOK = parse4day(load('4day'));
const NOON = Date.parse('2026-10-17T12:00:00+08:00');

const feed24 = (direction, period = {}) => ({
  data: {
    records: [
      {
        updatedTimestamp: '2026-10-17T11:40:47+08:00',
        general: {
          wind: { direction, speed: { low: 5, high: 15 } },
          validPeriod: { start: '2026-10-17T12:00:00+08:00', end: '2026-10-18T12:00:00+08:00', ...period },
        },
      },
    ],
  },
});
const feed4 = (codes) => ({
  data: {
    records: [
      {
        updatedTimestamp: '2026-10-17T05:41:08+08:00',
        forecasts: codes.map((direction, i) => ({ timestamp: `2026-10-${18 + i}T00:00:00+08:00`, wind: { direction } })),
      },
    ],
  },
});
/** A forecast with today's wind (or null) and the next days', by NEA code, as at NOON. */
const make = (today, ...next) => combineForecast(today && parse24h(feed24(today)), next.length ? parse4day(feed4(next)) : null, NOON);

test('reads the real 24-hour forecast', () => {
  assert.deepEqual(NEXT24H, {
    issuedAt: '2026-10-17T11:40:47+08:00',
    start: '2026-10-17T12:00:00+08:00',
    until: '2026-10-18T12:00:00+08:00',
    wind: { code: 'SSE', from: 157.5 },
  });
  assert.equal(next24hLabel(NEXT24H), 'Today');
  assert.equal(next24hLabel({ ...NEXT24H, start: '2026-10-17T18:00:00+08:00' }), 'Tonight');
});

test('reads the real 4-day outlook, one wind per SGT day', () => {
  assert.equal(OUTLOOK.issuedAt, '2026-10-17T05:41:08+08:00');
  assert.deepEqual(
    OUTLOOK.days.map((d) => [d.date, d.wind.code]),
    [
      ['2026-10-18', 'SSE'],
      ['2026-10-19', 'SE'],
      ['2026-10-20', 'SE'],
      ['2026-10-21', 'ESE'],
    ],
  );
  assert.deepEqual(OUTLOOK.days.map((d) => sgtWeekday(d.date)), ['Sunday', 'Monday', 'Tuesday', 'Wednesday']);
});

test('combines the feeds, keeping the older issue time', () => {
  const f = combineForecast(NEXT24H, OUTLOOK, NOON);
  assert.equal(f.issuedAt, OUTLOOK.issuedAt);
  assert.equal(f.days.length, 4);
  assert.equal(combineForecast(null, OUTLOOK, NOON).next24h, null);
  assert.deepEqual(combineForecast(NEXT24H, null, NOON), { issuedAt: NEXT24H.issuedAt, next24h: NEXT24H, days: [] });
  assert.equal(combineForecast(null, null, NOON), null);
});

test('drops what is past from a stored copy', () => {
  // A day later: today's forecast has run out, and Sunday is today.
  const later = combineForecast(NEXT24H, OUTLOOK, NOON + 86_400_000);
  assert.equal(later.next24h, null);
  assert.deepEqual(later.days.map((d) => d.date), ['2026-10-19', '2026-10-20', '2026-10-21']);
  assert.equal(combineForecast(NEXT24H, OUTLOOK, NOON + 5 * 86_400_000), null);
});

test('sums up the real forecast in a sentence', () => {
  // SSE, SSE, SE, SE, ESE all read as southeast.
  assert.equal(forecastLine(combineForecast(NEXT24H, OUTLOOK, NOON), NOON), 'NEA expects winds from the southeast for today and the next 4 days.');
  assert.equal(forecastName({ code: 'SSE', from: 157.5 }), 'south-southeast');
  assert.equal(forecastLine(make('SSE'), NOON), 'NEA expects winds from the south-southeast for the next 24 hours.');
  assert.equal(forecastLine(null), null);
});

test('names a change of wind, or says it keeps changing', () => {
  assert.equal(forecastLine(make('SE', 'SW', 'NE'), NOON), 'NEA expects the wind to change direction over today and the next 2 days.');
  // S is within 45° of the SE it follows; SW isn't.
  assert.equal(forecastLine(make('SE', 'SE', 'S', 'SW'), NOON), 'NEA expects winds from the southeast, turning southwest from Tuesday.');
  assert.equal(forecastLine(make('SE', 'SE', 'SW', 'SW'), NOON), 'NEA expects winds from the southeast, turning southwest from Monday.');
  assert.equal(forecastLine(make('SE', 'SW'), NOON), 'NEA expects winds from the southeast, turning southwest from tomorrow.');
  assert.equal(forecastLine(make('VAR', 'VAR'), NOON), 'NEA expects variable winds for today and the next day.');
  assert.equal(forecastLine(make('NNW', 'N', 'NNE', 'NE'), NOON), 'NEA expects winds from the north, turning northeast from Tuesday.');
  assert.equal(forecastLine(make(null, 'N', 'VAR'), NOON), 'NEA expects winds from the north, turning variable from Monday.');
  const tonight = combineForecast(parse24h(feed24('SE', { start: '2026-10-17T18:00:00+08:00' })), null, NOON);
  assert.equal(forecastLine(make('SE', 'SE'), NOON), 'NEA expects winds from the southeast for today and the next day.');
  assert.equal(forecastLine(tonight, NOON), 'NEA expects winds from the southeast for the next 24 hours.');
});

test('warns of smoke from Sumatra only during a haze episode, as our reading', () => {
  const sw = make('SE', 'SE', 'SW');
  assert.equal(
    forecastSmokeLine(sw, 120, NOON),
    'With winds from the southwest from Monday, smoke from fires in Sumatra may blow in. That’s our reading, not NEA’s.',
  );
  assert.match(forecastSmokeLine(make('SE', 'SSW'), 120, NOON), /^With winds from the south-southwest from tomorrow,/);
  assert.match(forecastSmokeLine(make('W', 'W'), 101, NOON), /from the west today/);
  assert.equal(forecastSmokeLine(sw, 100, NOON), null); // not an episode
  assert.equal(forecastSmokeLine(sw, null, NOON), null);
  // The same Sumatra range as the measured wind's line: S and NW aren't in it.
  assert.equal(forecastSmokeLine(make('S', 'NW', 'SSE', 'VAR'), 200, NOON), null);
  assert.equal(forecastSmokeLine(null, 200, NOON), null);
});

test('malformed feeds give null, not an exception', () => {
  for (const bad of [null, {}, { data: { records: [] } }, feed24('SOUTHISH'), feed24('SE', { end: 'soon' }), feed24('SE', { start: null })]) {
    assert.equal(parse24h(bad), null);
  }
  for (const bad of [null, {}, { data: { records: [{}] } }, feed4([]), feed4(['?', 7])]) {
    assert.equal(parse4day(bad), null);
  }
  assert.equal(parse24h(feed24('ne')).wind.code, 'NE');
});
