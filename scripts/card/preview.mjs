// Write the summary card for the dev fixture and the worst-case data, to check it by eye:
//   node scripts/card/preview.mjs [out dir, default: the OS temp dir]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { summaryCardPng } from '../../tgcloud/lib/card/summary.js';
import { emptyCase, worstCase } from '../../src/dev/worst.ts';

const out = process.argv[2] ?? tmpdir();
mkdirSync(out, { recursive: true });
const fixture = JSON.parse(readFileSync(new URL('../../src/dev/fixture.json', import.meta.url), 'utf8'));
// Clear day: single digits, a 0, a band edge (55 is still Normal, 56 Elevated), the PSI an hour
// behind at half past, and regions out of order with one missing.
const clear = {
  ...fixture.snapshot,
  asOf: '2026-10-16T12:00:00+08:00',
  psiAsOf: '2026-10-16T11:30:00+08:00',
  regions: [
    { id: 'south', name: 'South', pm25: 0, psi24h: 0 },
    { id: 'north', name: 'North', pm25: 55, psi24h: 50 },
    { id: 'east', name: 'East', pm25: 56, psi24h: 51 },
    { id: 'west', name: 'West', pm25: 7, psi24h: 9 },
  ],
  worst: { ...fixture.snapshot.worst, psi24h: { region: 'east', name: 'East', value: 51 } },
};
const cases = [
  ['fixture', fixture.snapshot],
  ['worst', worstCase().snapshot],
  ['empty', emptyCase().snapshot],
  ['clear', clear],
];
for (const [name, snap] of cases) {
  const t = performance.now();
  const png = summaryCardPng(snap);
  writeFileSync(`${out}/haze-${name}.png`, png);
  console.log(`${out}/haze-${name}.png`, `${Math.round(png.length / 1024)} KB`, `${Math.round(performance.now() - t)} ms`);
}
