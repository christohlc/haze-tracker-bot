// How often the next-hours range (tgcloud/lib/range.js) held the actual reading.
//   node scripts/range-backtest.mjs <dir of NEA day files>
// Each file is one day of NEA's hourly PM2.5, as a JSON array of { t, pm25: { north, … } }, e.g.
// saved from https://api-open.data.gov.sg/v2/real-time/api/pm25?date=YYYY-MM-DD. On 2022-08 to
// 2026-10 (about 35,000 hours) it held 81–83% at +1/3/6h, and 80–86% when the PSI was above 100.

import { readdirSync, readFileSync } from 'node:fs';
import { pm25ToPsi } from '../tgcloud/lib/psi.js';
import { HISTORY_HOURS, nextHours } from '../tgcloud/lib/range.js';
import { islandMean } from '../tgcloud/lib/snapshot.js';
import { unixHour } from '../tgcloud/lib/time.js';

const dir = process.argv[2];
if (!dir) throw new Error('Usage: node scripts/range-backtest.mjs <dir>');
const byTime = new Map();
for (const f of readdirSync(dir)) for (const i of JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'))) byTime.set(i.t, i.pm25);
const rows = [...byTime].sort((a, b) => Date.parse(a[0]) - Date.parse(b[0])).map(([timestamp, readings]) => ({ timestamp, readings }));
const at = new Map(rows.map((r, i) => [unixHour(r.timestamp), i]));

const stats = {};
for (let i = HISTORY_HOURS; i < rows.length; i++) {
  const now = Date.parse(rows[i].timestamp);
  const r = nextHours(rows.slice(i - HISTORY_HOURS + 1, i + 1), now);
  if (!r) continue;
  for (const s of r.steps) {
    const j = at.get(unixHour(rows[i].timestamp) + s.h);
    const actual = j == null ? null : pm25ToPsi(islandMean(rows[j].readings));
    if (actual == null) continue;
    for (const k of [`+${s.h}h all`, ...(r.now > 100 ? [`+${s.h}h haze`] : [])]) {
      const st = (stats[k] ??= { n: 0, held: 0 });
      st.n++;
      if (actual >= s.lo && actual <= s.hi) st.held++;
    }
  }
}
for (const [k, { n, held }] of Object.entries(stats)) console.log(`${k.padEnd(10)} ${((held / n) * 100).toFixed(1)}% of ${n} hours`);
