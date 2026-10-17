import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  combineForecast,
  currentForecast,
  dayShort,
  forecastLine,
  forecastName,
  forecastSmokeLine,
  parse24h,
  parse4day,
} from '../tgcloud/lib/forecast-parse.js';

// Copies of NEA's real feeds from data.gov.sg (17 Oct 2026, about 11.40 am).
const load = (name) => JSON.parse(readFileSync(new URL(`./forecast-${name}.json`, import.meta.url), 'utf8'));
const DAY = parse24h(load('24h'));
const DAYS = parse4day(load('4day'));
const NOON = Date.parse('2026-10-17T12:00:00+08:00');

/** A forecast with today's wind and the next days', by NEA code. */
const make = (today, ...next) => ({
  issuedAt: '2026-10-17T11:40:00+08:00',
  next24h: today && { wind: parse24h(feed24(today)).next24h.wind, kmh: null, until: '2026-10-18T12:00:00+08:00' },
  days: next.map((code, i) => ({ date: `2026-10-${18 + i}`, wind: parse4day(feed4([code])).days[0].wind })),
});
const feed24 = (direction, extra = {}) => ({
  data: {
    records: [
      {
        updatedTimestamp: '2026-10-17T11:40:47+08:00',
        general: { wind: { direction, speed: { low: 5, high: 15 } }, validPeriod: { end: '2026-10-18T12:00:00+08:00' }, ...extra },
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

test('reads the real 24-hour forecast', () => {
  assert.deepEqual(DAY, {
    issuedAt: '2026-10-17T11:40:47+08:00',
    next24h: { wind: { code: 'SSE', from: 157.5 }, kmh: { low: 5, high: 15 }, until: '2026-10-18T12:00:00+08:00' },
  });
});

test('reads the real 4-day outlook, one wind per SGT day', () => {
  assert.equal(DAYS.issuedAt, '2026-10-17T05:41:08+08:00');
  assert.deepEqual(
    DAYS.days.map((d) => [d.date, d.wind.code]),
    [
      ['2026-10-18', 'SSE'],
      ['2026-10-19', 'SE'],
      ['2026-10-20', 'SE'],
      ['2026-10-21', 'ESE'],
    ],
  );
  assert.deepEqual(DAYS.days.map((d) => dayShort(d.date)), ['Sun', 'Mon', 'Tue', 'Wed']);
  assert.equal(dayShort(null), 'Today');
});

test('combines the feeds, keeping the older issue time', () => {
  const f = combineForecast(DAY, DAYS);
  assert.equal(f.issuedAt, DAYS.issuedAt);
  assert.equal(f.days.length, 4);
  assert.equal(combineForecast(null, DAYS).next24h, null);
  assert.deepEqual(combineForecast(DAY, null).days, []);
  assert.equal(combineForecast(null, null), null);
});

test('sums up the real forecast in a sentence', () => {
  // SSE, SSE, SE, SE, ESE all read as southeast.
  assert.equal(forecastName({ code: 'SSE', from: 157.5 }), 'south-southeast');
  assert.equal(forecastLine(combineForecast(DAY, DAYS), NOON), 'NEA expects winds from the southeast for today and the next 4 days.');
  assert.equal(forecastLine(combineForecast(DAY, null), NOON), 'NEA expects winds from the south-southeast for the next 24 hours.');
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
});

test('warns of smoke from Sumatra only during a haze episode, as our reading', () => {
  const sw = make('SE', 'SE', 'SW');
  assert.equal(
    forecastSmokeLine(sw, 120, NOON),
    'With winds from the southwest from Monday, smoke from fires in Sumatra may blow in. That’s our reading, not NEA’s.',
  );
  assert.match(forecastSmokeLine(make('SE', 'SSW'), 120, NOON), /^With winds from the south-southwest from tomorrow,/);
  assert.match(forecastSmokeLine(make('S'), 120, NOON), /^With winds from the south today,/);
  assert.match(forecastSmokeLine(make('W', 'W'), 101, NOON), /from the west today/);
  assert.equal(forecastSmokeLine(sw, 100, NOON), null); // not an episode
  assert.equal(forecastSmokeLine(sw, null, NOON), null);
  assert.equal(forecastSmokeLine(make('WNW', 'SSE', 'VAR'), 200, NOON), null); // not from Sumatra
  assert.equal(forecastSmokeLine(null, 200, NOON), null);
});

test('drops what is past from a stored copy', () => {
  const f = combineForecast(DAY, DAYS);
  assert.equal(currentForecast(f, NOON).days.length, 4);
  // A day later: today's forecast has run out, and Sunday is today.
  const later = currentForecast(f, NOON + 86_400_000);
  assert.equal(later.next24h, null);
  assert.deepEqual(later.days.map((d) => d.date), ['2026-10-19', '2026-10-20', '2026-10-21']);
  assert.equal(currentForecast(f, NOON + 5 * 86_400_000), null);
  assert.equal(currentForecast(null), null);
});

test('malformed feeds give null, not an exception', () => {
  for (const bad of [null, {}, { data: { records: [] } }, feed24('SOUTHISH'), feed24('SE', { validPeriod: { end: 'soon' } })]) {
    assert.equal(parse24h(bad), null);
  }
  for (const bad of [null, {}, { data: { records: [{}] } }, feed4([]), feed4(['?', 7])]) {
    assert.equal(parse4day(bad), null);
  }
  // A missing speed still leaves the direction.
  assert.equal(parse24h(feed24('ne', { wind: { direction: 'ne' } })).next24h.kmh, null);
  assert.equal(parse24h(feed24('ne')).next24h.wind.code, 'NE');
});
