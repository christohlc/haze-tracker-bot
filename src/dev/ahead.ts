// Dev-only data for the What's ahead section (see loadDashboard in src/lib/api.ts).
import { pm25ToPsi } from '../../tgcloud/lib/psi.js';
import { islandMean } from '../../tgcloud/lib/snapshot.js';
import { sgtToday, toSgtIso, unixHour } from '../../tgcloud/lib/time.js';
import type { Ahead, Dashboard } from '../lib/api';

const tomorrow = () => sgtToday(Date.now() + 86_400_000);
const issued = () => `${sgtToday()}T18:19:00+08:00`;

/** NEA's outlook from 15 Oct 2026, and a range around the fixture's latest reading, like a hazy week gives. */
export function demoAhead(data: Dashboard): Ahead {
  const last = data.history.at(-1)!;
  const pm = islandMean(last) ?? 50;
  const t0 = unixHour(last.t);
  const spread: Record<number, [number, number]> = { 1: [0.87, 1.14], 3: [0.74, 1.3], 6: [0.6, 1.45] };
  return {
    outlook: { text: 'Unhealthy to Low Very Unhealthy', from: 'unhealthy', to: 'very_unhealthy', forDate: tomorrow(), issuedAt: issued(), expires: null },
    range: {
      now: pm25ToPsi(pm)!,
      steps: [1, 3, 6].map((h) => ({ h, t: toSgtIso((t0 + h) * 3600), lo: pm25ToPsi(pm * spread[h][0])!, hi: pm25ToPsi(pm * spread[h][1])! })),
    },
  };
}

/** The longest wording NEA uses, the top band, and a range from 0 past the top of the scale. */
export function worstAhead(): Ahead {
  const t0 = unixHour('2026-10-17T13:00:00+08:00');
  return {
    outlook: { text: 'High Very Unhealthy to Hazardous', from: 'very_unhealthy', to: 'hazardous', forDate: tomorrow(), issuedAt: issued(), expires: null },
    range: {
      now: 833,
      steps: [
        { h: 1, t: toSgtIso((t0 + 1) * 3600), lo: 0, hi: 1000 },
        { h: 3, t: toSgtIso((t0 + 3) * 3600), lo: 412, hi: 1000 },
        { h: 6, t: toSgtIso((t0 + 6) * 3600), lo: 1000, hi: 1000 },
      ],
    },
  };
}
