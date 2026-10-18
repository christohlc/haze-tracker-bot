import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { inlineResults, regionFromQuery } from '../tgcloud/lib/inline-rules.js';

const { snapshot: snap } = JSON.parse(readFileSync(new URL('../src/dev/fixture.json', import.meta.url), 'utf8'));

test('an inline query picks a region by id or name, else the highest', () => {
  assert.equal(regionFromQuery('west'), 'west');
  assert.equal(regionFromQuery('  West '), 'west');
  assert.equal(regionFromQuery(''), null);
  assert.equal(regionFromQuery('toString'), null);
  assert.equal(regionFromQuery(undefined), null);
});

test('inline results: the picture when Telegram has it, and always the text', () => {
  const both = inlineResults(snap, { fileId: 'F1', region: null });
  assert.deepEqual(both.map((r) => r.type), ['photo', 'article']);
  assert.equal(both[0].photo_file_id, 'F1');
  assert.match(both[0].caption, /24-hr PSI/);
  assert.equal(both[0].title, 'Picture: Singapore haze update', 'a photo without a title shows as “Untitled”');
  assert.equal(both[0].description, both[1].description, 'the same bands as the text');
  assert.match(both[1].thumbnail_url, /^https:\/\/.+\/logo-640\.png$/);
  assert.equal(both[1].title, 'Singapore haze update');
  assert.match(both[1].description, /^(Good|Moderate|Unhealthy|Very unhealthy|Hazardous) (in|island-wide)/, 'each band and where, no island-wide 3-hr band');
  assert.match(both[1].input_message_content.message_text, /PSI/);

  assert.deepEqual(inlineResults(snap, { fileId: null, region: null }).map((r) => r.type), ['article'], 'a cold hour: text only');

  const west = inlineResults(snap, { fileId: 'F1', region: 'west' });
  assert.deepEqual(west.map((r) => r.type), ['article'], 'the picture is island-wide, so a region gets the text');
  assert.match(west[0].title, /^West: 24-hr PSI \d+ · /);
  assert.equal(west[0].thumbnail_url, both[1].thumbnail_url, 'a region’s text gets the logo too');
  for (const r of [...both, ...west]) assert.ok(Buffer.byteLength(r.id) <= 64, 'result ids fit Telegram’s 64 bytes');

  const button = { inline_keyboard: [[{ text: 'x', url: 'https://t.me/x' }]] };
  assert.ok(inlineResults(snap, { fileId: 'F1', region: null, reply_markup: button }).every((r) => r.reply_markup === button));
});
