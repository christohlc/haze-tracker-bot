import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parseCameras } from '../tgcloud/lib/cameras-parse.js';

// A copy of the real feed (16 Oct 2026), after LTA cut it down to the checkpoint and Sentosa cameras.
const FEED = JSON.parse(readFileSync(new URL('./cameras-feed.json', import.meta.url), 'utf8'));

const camera = (id, extra = {}) => ({
  camera_id: id,
  image: `https://images.data.gov.sg/api/traffic-images/2026/10/${id}.jpg`,
  timestamp: '2026-10-16T17:30:33+08:00',
  ...extra,
});
const feed = (...cameras) => ({ items: [{ cameras }] });

test('names every camera in the real feed, North to South', () => {
  const cams = parseCameras(FEED);
  assert.equal(cams.length, 8);
  assert.ok(cams.every((c) => !c.name.startsWith('Camera ')));
  assert.deepEqual(cams.map((c) => c.region), ['north', 'north', 'north', 'west', 'west', 'west', 'south', 'south']);
  assert.equal(cams[0].name, 'Woodlands Causeway, towards Johor');
});

test('keeps a camera we have no name for, after the named ones', () => {
  const cams = parseCameras(feed(camera('9999'), camera('4799')));
  assert.deepEqual(cams.map((c) => [c.id, c.name, c.region]), [
    ['4799', 'Sentosa Gateway, towards Sentosa', 'south'],
    ['9999', 'Camera 9999', null],
  ]);
});

test('drops pictures from other hosts, and cameras missing a picture or time', () => {
  const cams = parseCameras(
    feed(
      camera('2701', { image: 'https://evil.example/x.jpg' }),
      camera('2702', { image: 'javascript:alert(1)' }),
      camera('2704', { image: null }),
      camera('4703', { timestamp: 'yesterday' }),
      camera('4712'),
    ),
  );
  assert.deepEqual(cams.map((c) => c.id), ['4712']);
});

test('malformed or empty feeds give no cameras', () => {
  for (const bad of [null, undefined, 'oops', {}, { items: [] }, { items: [{}] }, { items: [{ cameras: 'x' }] }, feed()]) {
    assert.deepEqual(parseCameras(bad), []);
  }
});
