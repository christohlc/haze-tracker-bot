import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { NEA_HAZE_URL, RETIRED, RETIRED_TEXT, retiredInlineResults } from '../tgcloud/lib/retired.js';

test('the tick workflow has no schedule exactly while the bot is retired', () => {
  const workflow = readFileSync(new URL('../.github/workflows/tick.yml', import.meta.url), 'utf8');
  assert.equal(/^\s{2}schedule:/m.test(workflow), !RETIRED);
});

test('the retired note points to NEA and keeps /stop', () => {
  assert.ok(RETIRED_TEXT.includes(`href="${NEA_HAZE_URL}"`));
  assert.ok(RETIRED_TEXT.includes('/stop'));
  const [result] = retiredInlineResults();
  assert.ok(result.input_message_content.message_text.includes(NEA_HAZE_URL));
});
