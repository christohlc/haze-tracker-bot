import { pm25ToPsi } from '../../tgcloud/lib/psi.js';
import type { HourRow, RegionId } from './api';

export type Scale = 'pm25' | 'psi';
export type Window = 1 | 3 | 24;

/**
 * Rolling averages ending at each of the last `points` hours.
 * Values are null where the window has no readings.
 */
export function rollingSeries(history: HourRow[], region: RegionId, window: Window, scale: Scale, points = 24) {
  const start = Math.max(0, history.length - points);
  return history.slice(start).map((row, i) => {
    const end = start + i;
    const vals = history
      .slice(Math.max(0, end - window + 1), end + 1)
      .map((h) => h[region])
      .filter((v): v is number => v != null);
    const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    const v = mean == null ? null : scale === 'psi' ? pm25ToPsi(mean) : mean;
    return { t: row.t, v };
  });
}

/** Round an axis max up to a clean step. */
export function niceMax(v: number) {
  const step = v <= 60 ? 20 : v <= 150 ? 50 : 100;
  return Math.max(step, Math.ceil(v / step) * step);
}
