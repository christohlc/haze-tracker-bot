// Write the summary card for the dev fixture and the worst-case data, to check it by eye:
//   node scripts/card/preview.mjs [out dir, default: the OS temp dir]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { summaryCardPng } from '../../tgcloud/lib/card/summary.js';
import { worstCase } from '../../src/dev/worst.ts';

const out = process.argv[2] ?? tmpdir();
mkdirSync(out, { recursive: true });
const fixture = JSON.parse(readFileSync(new URL('../../src/dev/fixture.json', import.meta.url), 'utf8'));
for (const [name, snap] of [['fixture', fixture.snapshot], ['worst', worstCase().snapshot]]) {
  const t = performance.now();
  const png = summaryCardPng(snap);
  writeFileSync(`${out}/haze-${name}.png`, png);
  console.log(`${out}/haze-${name}.png`, `${Math.round(png.length / 1024)} KB`, `${Math.round(performance.now() - t)} ms`);
}
