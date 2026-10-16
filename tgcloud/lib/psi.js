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

/** PM2.5 concentration (µg/m³) → PSI sub-index, rounded. Extrapolates past 500. */
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

export function psiBand(psi) {
  if (psi == null) return null;
  return PSI_BANDS.find((b) => psi <= b.max) ?? null;
}

/** NEA 1-hour PM2.5 bands, used for "what to do right now". */
export const PM25_BANDS = [
  { id: 'I', label: 'Normal', max: 55 },
  { id: 'II', label: 'Elevated', max: 150 },
  { id: 'III', label: 'High', max: 250 },
  { id: 'IV', label: 'Very high', max: Infinity },
];

export function pm25Band(pm25) {
  if (pm25 == null) return null;
  return PM25_BANDS.find((b) => pm25 <= b.max) ?? null;
}

/** Mean of the last `n` numbers (ignoring nulls); null if none. */
export function meanOfLast(values, n) {
  const xs = values.slice(-n).filter((v) => v != null);
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}
