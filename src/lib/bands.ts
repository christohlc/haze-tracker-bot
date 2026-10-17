import { bandRanges, psiBand } from '../../tgcloud/lib/psi.js';

/** The first and last band a range crosses (“Unhealthy to Hazardous” reads as “through”). */
export function bandsIn(lo: number, hi: number) {
  const a = psiBand(lo);
  const b = psiBand(hi);
  return !a || !b ? [] : a === b ? [a] : [a, b];
}

/** Band colours as hard stops between `lo` and `hi`, so each colour sits exactly on its band. */
export function bandStops(lo: number, hi: number, faded = false) {
  const at = (v: number) => (hi === lo ? 0 : ((Math.min(Math.max(v, lo), hi) - lo) / (hi - lo)) * 100);
  const parts = bandRanges().flatMap((b) => {
    const from = Math.max(b.from, lo);
    const to = Math.min(b.to, hi);
    if (from > to) return [];
    const c = faded ? `color-mix(in srgb, var(--band-${b.id}) 22%, transparent)` : `var(--band-${b.id})`;
    return [`${c} ${at(from).toFixed(2)}%`, `${c} ${at(to + 1).toFixed(2)}%`];
  });
  return `linear-gradient(90deg, ${parts.join(', ')})`;
}
