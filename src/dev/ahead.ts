// Dev-only data for the What's ahead section (see loadDashboard in src/lib/api.ts).
import { pm25ToPsi } from '../../tgcloud/lib/psi.js';
import { islandMean } from '../../tgcloud/lib/snapshot.js';
import { AHEAD } from '../../tgcloud/lib/range.js';
import { sgtDateOf, toSgtIso, unixHour } from '../../tgcloud/lib/time.js';
import type { Ahead, Dashboard } from '../lib/api';

const tomorrow = () => sgtDateOf(Date.now() + 86_400_000);
const issued = () => `${sgtDateOf(Date.now())}T18:19:00+08:00`;

/**
 * NEA's outlook from 16 Oct 2026 (with numbers, as NEA words it since), and a range around the fixture's latest reading, like a hazy week
 * gives. `only` keeps one half: 'range' (as outside a haze episode) or 'outlook'.
 */
export function demoAhead(data: Dashboard, only: string | null): Ahead {
  const last = data.history.at(-1)!;
  const pm = islandMean(last) ?? 50;
  const t0 = unixHour(last.t);
  const spread: Record<number, [number, number]> = { 1: [0.87, 1.14], 3: [0.74, 1.3], 6: [0.6, 1.45] };
  const ahead: Ahead = {
    outlook: { text: 'Unhealthy to Very Unhealthy', from: 'unhealthy', to: 'very_unhealthy', psi: { lo: 150, hi: 230 }, forDate: tomorrow(), issuedAt: issued(), expires: null },
    range: {
      now: pm25ToPsi(pm)!,
      steps: AHEAD.map((h) => ({ h, t: toSgtIso((t0 + h) * 3600), lo: pm25ToPsi(pm * spread[h][0])!, hi: pm25ToPsi(pm * spread[h][1])! })),
    },
  };
  return only === 'range' ? { ...ahead, outlook: null } : only === 'outlook' ? { ...ahead, range: null } : ahead;
}

/** The longest wording NEA uses, the top band, and a range from 0 past the top of the scale. */
export function worstAhead(): Ahead {
  const t0 = unixHour('2026-10-17T13:00:00+08:00');
  return {
    outlook: { text: 'High Very Unhealthy to Hazardous', from: 'very_unhealthy', to: 'hazardous', psi: null, forDate: tomorrow(), issuedAt: issued(), expires: null },
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
