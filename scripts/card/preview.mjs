// Write the summary and forecast cards for the dev fixture and the worst-case data, to check them by eye:
//   node scripts/card/preview.mjs [out dir, default: the OS temp dir]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { forecastCardPng } from '../../tgcloud/lib/card/forecast.js';
import { summaryCardPng } from '../../tgcloud/lib/card/summary.js';
import { demoAhead, worstAhead } from '../../src/dev/ahead.ts';
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

const demo = { ...fixture, ahead: null };
const forecasts = [
  ['fixture', fixture.snapshot, demoAhead(demo, null)],
  ['range', fixture.snapshot, demoAhead(demo, 'range')],
  ['outlook', fixture.snapshot, demoAhead(demo, 'outlook')],
  ['worst', worstCase().snapshot, worstAhead()],
  ['one-number', fixture.snapshot, { outlook: { ...demoAhead(demo, 'outlook').outlook, psi: { lo: 200, hi: 200 } }, range: null }],
  ['clear', clear, { outlook: { ...demoAhead(demo, 'outlook').outlook, text: 'Good', from: 'good', to: 'good', psi: null }, range: null }],
];
for (const [name, snap, ahead] of forecasts) {
  const t = performance.now();
  const png = forecastCardPng(snap, ahead);
  writeFileSync(`${out}/forecast-${name}.png`, png);
  console.log(`${out}/forecast-${name}.png`, `${Math.round(png.length / 1024)} KB`, `${Math.round(performance.now() - t)} ms`);
}
