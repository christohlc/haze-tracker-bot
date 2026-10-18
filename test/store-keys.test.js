import assert from 'node:assert/strict';
import { test } from 'node:test';
import { STORE_KEYS } from '../src/lib/store-keys.ts';

// Telegram's CloudStorage refuses any other key, so the value is never saved.
test('every CloudStorage key is one Telegram accepts, and they are all different', () => {
  const keys = Object.values(STORE_KEYS);
  for (const key of keys) assert.match(key, /^[A-Za-z0-9_-]{1,128}$/, key);
  assert.equal(new Set(keys).size, keys.length);
});
