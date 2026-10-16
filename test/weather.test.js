import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { compassName, parseStations, smokeLine, summariseWeather } from '../tgcloud/lib/weather-parse.js';

// Copies of NEA's real feeds (16 Oct 2026, about 5.50 pm).
const load = (name) => JSON.parse(readFileSync(new URL(`./weather-${name}.json`, import.meta.url), 'utf8'));
const DIR = parseStations(load('wind-direction'));
const SPEED = parseStations(load('wind-speed'));
const RAIN = parseStations(load('rainfall'));

const at = '2026-10-16T17:54:00+08:00';
// Stations at NEA's North, West and South label points.
const STATIONS = [
  { id: 'N', location: { latitude: 1.418, longitude: 103.82 } },
  { id: 'W', location: { latitude: 1.357, longitude: 103.7 } },
  { id: 'S', location: { latitude: 1.296, longitude: 103.82 } },
];
const feed = (values, timestamp = at) => ({
  data: { stations: STATIONS, readings: [{ timestamp, data: Object.entries(values).map(([stationId, value]) => ({ stationId, value })) }] },
});

test('reads every station in the real feeds and puts each in a region', () => {
  assert.equal(DIR.readings.length, 18);
  assert.equal(SPEED.readings.length, 18);
  assert.equal(RAIN.readings.length, 90);
  const marina = DIR.readings.find((r) => r.id === 'S108'); // Marina Barrage
  assert.equal(marina.region, 'south');
  const amk = DIR.readings.find((r) => r.id === 'S109'); // Ang Mo Kio Avenue 5
  assert.equal(amk.region, 'central');
});

test('sums up the real feeds', () => {
  const w = summariseWeather(DIR, SPEED, RAIN);
  assert.equal(w.takenAt, '2026-10-16T17:50:00+08:00'); // the older rain reading
  assert.ok(w.wind.from > 60 && w.wind.from < 140, `from ${w.wind.from}`); // easterly that afternoon
  assert.equal(w.wind.stations, 18);
  assert.equal(w.rain.stations, 90);
});

test('averages directions across north, and converts knots to km/h', () => {
  const w = summariseWeather(parseStations(feed({ N: 350, W: 10 })), parseStations(feed({ N: 10, W: 10 })), null);
  assert.equal(w.wind.from, 0);
  assert.equal(w.wind.kmh, 19); // 10 knots
  assert.equal(w.wind.steady, true);
  assert.equal(w.rain, null);
});

test('calls opposite winds unsteady', () => {
  const w = summariseWeather(parseStations(feed({ N: 90, W: 270 })), parseStations(feed({ N: 6, W: 5 })), null);
  assert.equal(w.wind.steady, false);
});

test('counts a region as raining only above 0.2 mm', () => {
  const w = summariseWeather(null, null, parseStations(feed({ N: 0.2, W: 0.4, S: 3 })));
  assert.deepEqual(w.rain.raining, ['west', 'south']);
  assert.deepEqual(w.rain.wettest, { region: 'south', mm: 3 });
  assert.equal(w.wind, null);
});

test('malformed or empty feeds give null, not an exception', () => {
  for (const bad of [null, {}, { data: {} }, { data: { stations: [], readings: [] } }, feed({ N: 'x', Q: 4 }), feed({ N: 1 }, 'soon')]) {
    assert.equal(parseStations(bad), null);
  }
  assert.equal(summariseWeather(null, null, null), null);
});

test('names compass points', () => {
  assert.deepEqual([0, 44, 225, 300, 359, -45].map(compassName), ['north', 'northeast', 'southwest', 'northwest', 'north', 'northwest']);
});

test('says whether the wind is coming from the fire areas', () => {
  const wind = (from, kmh = 12, steady = true) => ({ from, kmh, steady, stations: 18 });
  assert.match(smokeLine(wind(225), 120), /^The wind is coming from Sumatra.*burn\.$/);
  assert.match(smokeLine(wind(225), 30), /Sumatra.*, but the air is clean right now\.$/);
  assert.match(smokeLine(wind(130), 120), /^The wind is coming from Borneo/);
  assert.match(smokeLine(wind(45), 120), /isn’t coming from the usual fire areas/);
  assert.match(smokeLine(wind(225, 3), 120), /^Winds are light, so haze/);
  assert.equal(smokeLine(wind(null, 0, false), 30), 'Winds are light.');
  assert.match(smokeLine(wind(225, 25, false), 120), /^Winds are shifting, so it’s hard to say/);
  assert.equal(smokeLine(null, 120), null);
});
