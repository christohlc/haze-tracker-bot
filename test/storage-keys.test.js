import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

// Telegram's CloudStorage only takes keys of 1–128 A–Z, a–z, 0–9, _ and -. Anything else is
// refused, so the value is never saved (and a read may never be answered).
test('every CloudStorage key the Mini App uses is one Telegram accepts', () => {
  const files = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(ts|svelte)$/.test(e.name)) files.push(p);
    }
  };
  walk('src');
  const keys = [];
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    if (!/\b(getStored|setStored)\(/.test(src)) continue;
    for (const [, key] of src.matchAll(/\b[A-Z_]*KEY\s*=\s*'([^']*)'/g)) keys.push([f, key]);
    for (const [, key] of src.matchAll(/\b(?:getStored|setStored)\(\s*'([^']*)'/g)) keys.push([f, key]);
  }
  assert.ok(keys.length >= 5, 'found the keys');
  for (const [f, key] of keys) assert.match(key, /^[A-Za-z0-9_-]{1,128}$/, `${f}: ${key}`);
});
