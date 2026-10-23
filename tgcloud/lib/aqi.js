// @ts-check
// PM2.5 → US AQI, the scale IQAir and AQICN show, so the Mini App can say why their number is
// bigger than NEA's PSI for the same air. US EPA's PM2.5 breakpoints as revised in 2024.
// Pure module (no SDK) so it can be unit-tested with node:test.

/** [µg/m³ low, µg/m³ high, AQI low, AQI high, label] */
const BREAKPOINTS = /** @type {const} */ ([
  [0, 9, 0, 50, 'Good'],
  [9.1, 35.4, 51, 100, 'Moderate'],
  [35.5, 55.4, 101, 150, 'Unhealthy for sensitive groups'],
  [55.5, 125.4, 151, 200, 'Unhealthy'],
  [125.5, 225.4, 201, 300, 'Very unhealthy'],
  [225.5, 325.4, 301, 500, 'Hazardous'],
]);

/**
 * PM2.5 concentration (µg/m³) → US AQI and its label. Past the top of the scale it stays at 500,
 * with `beyond` set (shown as “500+”).
 * @param {number | null | undefined} pm25
 * @returns {{ aqi: number, label: string, beyond: boolean } | null}
 */
export function pm25ToUsAqi(pm25) {
  if (pm25 == null || Number.isNaN(pm25)) return null;
  // EPA truncates to one decimal before looking up the breakpoint.
  const c = Math.floor(Math.max(0, pm25) * 10) / 10;
  for (const [cLo, cHi, iLo, iHi, label] of BREAKPOINTS)
    if (c <= cHi) return { aqi: Math.round(iLo + ((c - cLo) * (iHi - iLo)) / (cHi - cLo)), label, beyond: false };
  return { aqi: 500, label: 'Hazardous', beyond: true };
}
