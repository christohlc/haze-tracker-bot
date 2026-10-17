// Dev only: the fixture has two days of readings; the chart's 7-day view needs a week.
import type { HourRow, RegionId } from '../lib/api';

const IDS: RegionId[] = ['north', 'west', 'central', 'east', 'south'];

/** `history` with six more days in front: haze building through the week, peaking each afternoon. */
export function withWeek(history: HourRow[]): HourRow[] {
  if (!history.length) return history;
  const first = Date.parse(history[0].t);
  const before = Array.from({ length: 6 * 24 }, (_, k): HourRow => {
    const ms = first - (6 * 24 - k) * 3600_000;
    const t = `${new Date(ms + 8 * 3600_000).toISOString().slice(0, 19)}+08:00`;
    const hour = Number(t.slice(11, 13));
    const daily = 1 + 0.35 * Math.sin(((hour - 9) / 24) * 2 * Math.PI);
    const row: HourRow = { t };
    IDS.forEach((id, i) => (row[id] = Math.round((18 + k * 0.6 + i * 4) * daily)));
    return row;
  });
  return [...before, ...history];
}
