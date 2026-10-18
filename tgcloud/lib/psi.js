// @ts-check
// PM2.5 → PSI conversion and bands, following NEA's PM2.5 sub-index breakpoints.
// Pure module (no SDK) so it can be unit-tested with node:test.

/** [µg/m³, PSI] breakpoints; PSI is linear between them. */
const BREAKPOINTS = [
  [0, 0],
  [12, 50],
  [55, 100],
  [150, 200],
  [250, 300],
  [350, 400],
  [500, 500],
];

/**
 * PM2.5 concentration (µg/m³) → PSI sub-index, rounded. Extrapolates past 500.
 * @param {number | null | undefined} pm25
 * @returns {number | null}
 */
export function pm25ToPsi(pm25) {
  if (pm25 == null || Number.isNaN(pm25)) return null;
  const c = Math.max(0, pm25);
  for (let i = 1; i < BREAKPOINTS.length; i++) {
    const [cHi, iHi] = BREAKPOINTS[i];
    if (c <= cHi || i === BREAKPOINTS.length - 1) {
      const [cLo, iLo] = BREAKPOINTS[i - 1];
      return Math.round(iLo + ((c - cLo) * (iHi - iLo)) / (cHi - cLo));
    }
  }
  return null;
}

/** PSI bands (NEA). `max` is inclusive. */
export const PSI_BANDS = [
  { id: 'good', label: 'Good', max: 50, emoji: '🟢' },
  { id: 'moderate', label: 'Moderate', max: 100, emoji: '🔵' },
  { id: 'unhealthy', label: 'Unhealthy', max: 200, emoji: '🟡' },
  { id: 'very_unhealthy', label: 'Very unhealthy', max: 300, emoji: '🟠' },
  { id: 'hazardous', label: 'Hazardous', max: Infinity, emoji: '🔴' },
];

/** @param {string | null | undefined} id */
export const bandById = (id) => PSI_BANDS.find((b) => b.id === id) ?? null;

/** @param {number | null | undefined} psi */
export function psiBand(psi) {
  if (psi == null) return null;
  return PSI_BANDS.find((b) => psi <= b.max) ?? null;
}

/**
 * The lowest PSI in the band `psi` falls in (0 for Good).
 * @param {number | null | undefined} psi
 */
export function bandFloor(psi) {
  const i = PSI_BANDS.findIndex((b) => psi != null && psi <= b.max);
  return i > 0 ? PSI_BANDS[i - 1].max + 1 : 0;
}

/**
 * Each PSI band's stretch, `from`–`to` inclusive, with Hazardous ending at `cap`.
 * @param {number} [cap]
 */
export const bandRanges = (cap = Infinity) =>
  PSI_BANDS.map((b, i) => ({ id: b.id, label: b.label, from: i ? PSI_BANDS[i - 1].max + 1 : 0, to: Math.min(b.max, cap) }));

/** NEA 1-hour PM2.5 bands, used for "what to do right now". */
export const PM25_BANDS = [
  { id: 'I', label: 'Normal', max: 55 },
  { id: 'II', label: 'Elevated', max: 150 },
  { id: 'III', label: 'High', max: 250 },
  { id: 'IV', label: 'Very high', max: Infinity },
];

/** @param {number | null | undefined} pm25 */
export function pm25Band(pm25) {
  if (pm25 == null) return null;
  return PM25_BANDS.find((b) => pm25 <= b.max) ?? null;
}

/**
 * Regions grouped by the band of their `key` reading, worst band first, regions in the order
 * given. Regions without a reading are left out. `lo`/`hi` are the group's lowest and highest
 * readings, rounded.
 * @template {{ id: string, label: string, max: number }} B
 * @param {Array<any>} regions @param {string} key @param {B[]} bands PSI_BANDS or PM25_BANDS
 * @returns {Array<{ band: B, names: string[], lo: number, hi: number }>}
 */
export function bandGroups(regions, key, bands) {
  return [...bands].reverse().flatMap((band, i, worstFirst) => {
    const floor = worstFirst[i + 1]?.max ?? -Infinity;
    const vals = regions.filter((r) => r[key] != null).map((r) => ({ name: r.name, v: Math.round(r[key]) })).filter(({ v }) => v > floor && v <= band.max);
    return vals.length ? [{ band, names: vals.map((x) => x.name), lo: Math.min(...vals.map((x) => x.v)), hi: Math.max(...vals.map((x) => x.v)) }] : [];
  });
}

/**
 * Mean of the last `n` numbers (ignoring nulls); null if none.
 * @param {Array<number | null | undefined>} values
 * @param {number} n
 * @returns {number | null}
 */
export function meanOfLast(values, n) {
  const xs = /** @type {number[]} */ (values.slice(-n).filter((v) => v != null));
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}
