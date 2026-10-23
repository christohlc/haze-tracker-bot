// Build src/dev/fixture.json from live NEA data, shaped like endpoints/getDashboard,
// so the Mini App can be developed outside Telegram. Run: node scripts/fixture.mjs
import { writeFileSync } from 'node:fs';
import { hazePsi, highestSince } from '../tgcloud/lib/psi-record.js';
import { buildSnapshot } from '../tgcloud/lib/snapshot.js';

const BASE = 'https://api-open.data.gov.sg/v2/real-time/api';
const sgtDate = (daysAgo) => new Date(Date.now() + 8 * 3600_000 - daysAgo * 86_400_000).toISOString().slice(0, 10);
const items = async (path, date) =>
  (await (await fetch(`${BASE}/${path}${date ? `?date=${date}` : ''}`)).json()).data.items;

const pm = (await Promise.all([2, 1, 0].map((d) => items('pm25', sgtDate(d))))).flat();
const byTime = new Map(pm.map((i) => [i.timestamp, { timestamp: i.timestamp, readings: i.readings.pm25_one_hourly }]));
const history = [...byTime.values()].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)).slice(-48);
const psi = (await items('psi'))[0];

const { history: _h, ...snapshot } = buildSnapshot(history, psi);
const now = Math.floor(Date.now() / 1000);
const fixture = {
  snapshot: { ...snapshot, stale: false, record: highestSince(hazePsi(snapshot.regions), snapshot.psiAsOf.slice(0, 10)) },
  history: history.map((h) => ({ t: h.timestamp, ...h.readings })),
  sources: [
    { source: 'nea_pm25', lastOkAt: now, lastErrorAt: null, lastError: null, detail: `latest ${snapshot.asOf}` },
    { source: 'nea_psi', lastOkAt: now, lastErrorAt: null, lastError: null, detail: `latest ${snapshot.psiAsOf}` },
  ],
  serverTime: Date.now(),
};
writeFileSync(new URL('../src/dev/fixture.json', import.meta.url), `${JSON.stringify(fixture, null, 2)}\n`);
console.log('wrote src/dev/fixture.json', snapshot.asOf, `${history.length}h`);
