import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileDate, MAP_BOUNDS, parseHaze, parseHome, parseHotspots, parseUpdated, parseWind } from '../tgcloud/lib/hazemap-parse.js';

// haze.gov.sg's homepage and the three KML files it linked to, fetched on 17 Oct 2026, 1:40 pm SGT.
const read = (name) => readFileSync(new URL(`./hazemap/${name}`, import.meta.url), 'utf8');
const NOW = Date.parse('2026-10-17T13:40:00+08:00');
const home = parseHome(read('haze-gov-home.html'), NOW);

test('finds the layers and NEA’s two texts on the homepage', () => {
  assert.equal(home.hotspotsUrl, 'https://www.haze.gov.sg/docs/default-source/haze_hotspots/Haze_Hotspots_20261016_164100.kml?time=639278406142372479');
  assert.equal(home.hazeUrl, 'https://www.haze.gov.sg/docs/default-source/hazeboundaries/HazeBoundaries_20261017_105929.kml');
  assert.equal(home.windUrl, 'https://www.haze.gov.sg/docs/default-source/haze_wind/Haze_Wind_20261017_000000-kml.kml');
  assert.match(home.situation ?? '', /^Dry conditions continued over many parts of the southern ASEAN region overnight/);
  assert.match(home.outlook ?? '', /^In the coming days, dry conditions are forecast/);
  // Paragraphs kept, tags and the "Updated on" line gone.
  assert.equal(home.situation?.split('\n\n').length, 2);
  assert.doesNotMatch(`${home.situation}${home.outlook}`, /<|Updated on/);
  assert.equal(home.updatedAt, '2026-10-17T10:59:00+08:00');
});

test('reads "Updated on" in the latest year that isn’t ahead of now', () => {
  assert.equal(parseUpdated('Updated on 10:59 AM 17 October', NOW), '2026-10-17T10:59:00+08:00');
  assert.equal(parseUpdated('Updated on 12:05 PM 1 Oct', NOW), '2026-10-01T12:05:00+08:00');
  assert.equal(parseUpdated('Updated on 12:30 AM 2 Jan', NOW), '2026-01-02T00:30:00+08:00');
  // A 31 Dec update read on 1 Jan belongs to the year before.
  assert.equal(parseUpdated('Updated on 11:00 PM 31 December', Date.parse('2027-01-01T09:00:00+08:00')), '2026-12-31T23:00:00+08:00');
  assert.equal(parseUpdated('Updated on 4:15 pm 3 March 2025', NOW), '2025-03-03T16:15:00+08:00');
  assert.equal(parseUpdated('Updated recently', NOW), null);
  assert.equal(parseUpdated('Updated on 10:59 AM 17 Smarch', NOW), null);
});

test('counts hotspots and bins the ones on the map to 0.25°', () => {
  const h = parseHotspots(read('hotspots.kml'), fileDate(home.hotspotsUrl ?? ''));
  assert.ok(h);
  assert.equal(h.date, '2026-10-16');
  assert.equal(h.total, 556);
  assert.equal(h.regions.Sumatra, 57);
  assert.equal(h.regions.Kalimantan, 131);
  assert.equal(h.regions['Lao PDR'], 4);
  assert.equal(h.dots.length % 3, 0);
  let fires = 0;
  for (let i = 0; i < h.dots.length; i += 3) {
    const [lon, lat, n] = h.dots.slice(i, i + 3);
    assert.ok(lon >= MAP_BOUNDS.west && lon <= MAP_BOUNDS.east && lat >= MAP_BOUNDS.south && lat <= MAP_BOUNDS.north);
    assert.equal((lon / 0.125) % 2, 1, 'cell centre');
    fires += n;
  }
  // Sulawesi, Vietnam and the rest are off the map but still counted.
  assert.ok(fires > 0 && fires < h.total);
});

test('5,000 hotspots stay a small payload', () => {
  const points = Array.from({ length: 5000 }, (_, i) => `<Placemark><Point><coordinates>${100 + (i % 100) * 0.05},${-2 + Math.floor(i / 100) * 0.05}</coordinates></Point></Placemark>`);
  const h = parseHotspots(`<kml>${points.join('')}</kml>`);
  assert.equal(h?.total, 5000);
  assert.equal(h.dots.length / 3, 200);
  assert.ok(JSON.stringify(h).length < 6000);
});

test('reads dense and moderate haze, dropping areas off the map', () => {
  const haze = parseHaze(read('boundaries.kml'), fileDate(home.hazeUrl ?? ''));
  assert.ok(haze);
  assert.equal(haze.date, '2026-10-17');
  // NEA's file has 4 of each; Papua and Sulawesi are east of 120°E.
  assert.equal(haze.dense.length, 3);
  assert.equal(haze.moderate.length, 3);
  for (const ring of [...haze.dense, ...haze.moderate].flat()) {
    assert.ok(ring.length >= 6 && ring.length % 2 === 0);
    assert.ok(ring.every((v) => Math.round(v * 100) / 100 === v), 'rounded to 2 decimals');
  }
  assert.ok(JSON.stringify(haze).length < 4000);
});

test('reads the wind picture and the box it covers', () => {
  assert.deepEqual(parseWind(read('wind.kml'), home.windUrl ?? ''), {
    image: 'https://www.haze.gov.sg/docs/default-source/haze_wind/Haze_Wind_20261017_000000.png',
    box: { west: 81.25, east: 150, south: -18.75, north: 28.75 },
    date: '2026-10-17',
  });
});

test('never throws on what haze.gov.sg might send instead', () => {
  for (const junk of [undefined, null, 42, '', 'Service Unavailable', '<html><body>Maintenance</body></html>', '<kml><Placemark><Point><coordinates>nope</coordinates></Point></Placemark></kml>']) {
    const page = parseHome(junk, NOW);
    assert.deepEqual(page, { hotspotsUrl: null, hazeUrl: null, windUrl: null, windImage: null, situation: null, outlook: null, updatedAt: null });
    parseHaze(junk);
    parseWind(junk, 'https://www.haze.gov.sg/x.kml');
    const h = parseHotspots(junk);
    assert.ok(h === null || (h.total === 0 && h.dots.length === 0));
  }
  // An empty KML is a clear day, not an error.
  assert.deepEqual(parseHotspots('<kml><Document></Document></kml>', '2026-10-17'), { date: '2026-10-17', total: 0, regions: {}, dots: [] });
  assert.deepEqual(parseHaze('<kml></kml>'), { dense: [], moderate: [], date: null });
  // A wind picture that isn't https, or a box that's inside out, is skipped.
  const wind = read('wind.kml');
  assert.equal(parseWind(wind, 'http://www.haze.gov.sg/w.kml'), null);
  assert.equal(parseWind(wind.replace('<east>150.0</east>', '<east>10</east>'), home.windUrl ?? ''), null);
});
