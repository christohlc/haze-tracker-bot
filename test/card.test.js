import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { crc32 as zlibCrc32, inflateSync } from 'node:zlib';
import { runBatched } from '../tgcloud/lib/alert-rules.js';
import { CARD_H, CARD_W } from '../tgcloud/lib/card/geometry.js';
import { crc32, encodePng } from '../tgcloud/lib/card/png.js';
import { bandRanges, CARD_AT, cardDate, drawSummaryCard, summaryCardPng } from '../tgcloud/lib/card/summary.js';
import { formatBandAlert, formatHazeCaption } from '../tgcloud/lib/format.js';
import { PM25_BANDS, PSI_BANDS } from '../tgcloud/lib/psi.js';
import { worstCase } from '../src/dev/worst.ts';

const fixture = JSON.parse(readFileSync(new URL('../src/dev/fixture.json', import.meta.url), 'utf8')).snapshot;
const worst = worstCase().snapshot;

/** Decode our own PNGs (8-bit RGB, filters None/Sub/Up only) and check every chunk's CRC. */
function decodePng(png) {
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let width = 0;
  let height = 0;
  const idat = [];
  for (let at = 8; at < png.length; ) {
    const len = view.getUint32(at);
    const type = String.fromCharCode(...png.subarray(at + 4, at + 8));
    assert.equal(view.getUint32(at + 8 + len), zlibCrc32(png.subarray(at + 4, at + 8 + len)), `${type} CRC`);
    if (type === 'IHDR') {
      width = view.getUint32(at + 8);
      height = view.getUint32(at + 12);
      assert.deepEqual([...png.subarray(at + 16, at + 21)], [8, 2, 0, 0, 0]);
    }
    if (type === 'IDAT') idat.push(png.subarray(at + 8, at + 8 + len));
    at += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 3;
  const data = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const v = raw[y * (stride + 1) + 1 + x];
      const left = x >= 3 ? data[y * stride + x - 3] : 0;
      const up = y ? data[(y - 1) * stride + x] : 0;
      data[y * stride + x] = (v + (f === 1 ? left : f === 2 ? up : 0)) & 0xff;
    }
  }
  return { width, height, data };
}

test('crc32 matches zlib', () => {
  const bytes = new TextEncoder().encode('I’m going hazelnuts!');
  assert.equal(crc32(bytes), zlibCrc32(bytes));
});

test('encodePng round-trips through zlib', () => {
  const width = 37;
  const height = 23;
  const data = new Uint8Array(width * height * 3);
  // Noise, flat runs and repeats, so literals, short and long matches all appear.
  for (let i = 0; i < data.length; i++) data[i] = i % 97 < 40 ? 200 : (i * 2654435761) >>> 24;
  const back = decodePng(encodePng({ width, height, data }));
  assert.equal(back.width, width);
  assert.equal(back.height, height);
  assert.deepEqual(back.data, data);
});

test('the card decodes to the drawn pixels', () => {
  const t = performance.now();
  const png = summaryCardPng(fixture);
  assert.ok(performance.now() - t < 1000, 'renders in under a second');
  assert.ok(png.length < 1_000_000, 'well under Telegram’s 10 MB photo limit');
  const back = decodePng(png);
  assert.equal(back.width, CARD_W);
  assert.equal(back.height, CARD_H);
  assert.deepEqual(back.data, drawSummaryCard(fixture).data);
});

test('the sky follows the worst 24-hour PSI band', () => {
  const top = (snap) => [...drawSummaryCard(snap).data.subarray(0, 3)];
  assert.deepEqual(top(worst), [0x4b, 0x2f, 0x45]); // hazardous
  assert.deepEqual(top({ ...worst, worst: { ...worst.worst, psi24h: null } }), [0x8d, 0xb8, 0xea]); // no reading
});

test('each region’s card is filled with its 24-hour PSI band colour', () => {
  const fill = (c, id) => {
    const [x, y] = CARD_AT[id];
    const i = ((y + 10) * c.width + x + 130) * 3; // top edge, clear of the text
    return [...c.data.subarray(i, i + 3)];
  };
  const UNHEALTHY = [0xdc, 0xab, 0x00];
  const VERY_UNHEALTHY = [0xe0, 0x48, 0x1f];
  const c = drawSummaryCard(fixture);
  for (const r of fixture.regions) assert.deepEqual(fill(c, r.id), r.psi24h > 200 ? VERY_UNHEALTHY : UNHEALTHY, r.id);
  // A reading that rounds to 200 is coloured as 200 (Unhealthy), not 200.4 (Very unhealthy).
  const edge = drawSummaryCard({ ...fixture, regions: [{ ...fixture.regions[0], psi24h: 200.4 }] });
  assert.deepEqual(fill(edge, fixture.regions[0].id), UNHEALTHY);
  // A region with no reading is grey.
  assert.deepEqual(fill(drawSummaryCard(worst), 'north'), [0xdc, 0xdc, 0xdc]);
});

test('legend ranges come from the band tables', () => {
  assert.deepEqual(bandRanges(PSI_BANDS), ['0–50', '51–100', '101–200', '201–300', '>300']);
  assert.deepEqual(bandRanges(PM25_BANDS), ['0–55', '56–150', '151–250', '>250']);
  assert.equal(cardDate('2026-10-16T07:00:00+08:00'), '16 Oct, 7 am SGT');
  assert.equal(cardDate('2026-01-02T12:30:00+08:00'), '2 Jan, 12:30 pm SGT');
});

test('captions fit Telegram’s 1,024-character limit', () => {
  const ahead = {
    outlook: { text: 'High Very Unhealthy to Hazardous', from: 'very_unhealthy', to: 'hazardous', forDate: '2099-01-01', issuedAt: '2026-10-16T18:19:00+08:00' },
    range: null,
  };
  // The Mini App's snapshots leave out the cigarette numbers; the bot's have them.
  const cigs = { past24h: 999.9, lastHour: 99.99, perDayAtCurrent: 999.9 };
  for (const snap of [fixture, worst].map((s) => ({ ...s, cigs }))) {
    const daily = `☀️ <b>Daily haze update</b>\n\n${formatHazeCaption(snap, ahead)}`;
    assert.ok(daily.length <= 1024, `daily caption is ${daily.length}`);
    assert.ok(!daily.includes('<pre>'), 'the picture replaces the table');
    assert.ok(formatBandAlert(snap, 'good', 'hazardous').length <= 1024);
  }
});

test('runBatched can send the first item on its own', async () => {
  const sizes = [];
  let inFlight = 0;
  await runBatched(
    Array.from({ length: 6 }, (_, i) => i),
    async () => {
      inFlight++;
      await null;
      sizes.push(inFlight);
      inFlight--;
      return 'sent';
    },
    { deadline: Infinity, size: 4, firstAlone: true },
  );
  assert.deepEqual(sizes, [1, 4, 3, 2, 1, 1]);
});
