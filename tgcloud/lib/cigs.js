// @ts-check
// Cigarette equivalent (Berkeley Earth rule of thumb): 22 µg/m³ of PM2.5 breathed
// over 24 hours ≈ one cigarette. Indoors is assumed to have 40% of outdoor PM2.5.
// An illustration of exposure, not a medical measurement.

export const UG_PER_CIG_DAY = 22;
export const INDOOR_FACTOR = 0.4;

/** Share of outdoor PM2.5 actually breathed, given the fraction of time outdoors (0–1). */
export function exposureFactor(outdoorShare = 1) {
  const f = Math.min(1, Math.max(0, outdoorShare));
  return f + (1 - f) * INDOOR_FACTOR;
}

/**
 * @param {{ mean24h: number|null, now: number|null }} pm  island or region PM2.5 (µg/m³)
 * @param {number} [outdoorShare]  0–1
 */
export function cigarettes(pm, outdoorShare = 1) {
  const k = exposureFactor(outdoorShare) / UG_PER_CIG_DAY;
  return {
    past24h: pm.mean24h == null ? null : pm.mean24h * k,
    lastHour: pm.now == null ? null : (pm.now * k) / 24,
    perDayAtCurrent: pm.now == null ? null : pm.now * k,
  };
}
