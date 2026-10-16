// @ts-check
// Health advice, following NEA: 24-hour PSI for planning ahead, 1-hour PM2.5 band
// for what to do right now (that wording is simplified — haze.gov.sg is official).

import { psiBand, pm25Band } from './psi.js';

/** @type {Record<string, { healthy: string, vulnerable: string, chronic: string }>} */
const BY_PSI = {
  good: { healthy: 'Normal activities.', vulnerable: 'Normal activities.', chronic: 'Normal activities.' },
  moderate: { healthy: 'Normal activities.', vulnerable: 'Normal activities.', chronic: 'Normal activities.' },
  unhealthy: {
    healthy: 'Reduce prolonged or strenuous outdoor physical exertion.',
    vulnerable: 'Minimise prolonged or strenuous outdoor physical exertion.',
    chronic: 'Avoid prolonged or strenuous outdoor physical exertion.',
  },
  very_unhealthy: {
    healthy: 'Avoid prolonged or strenuous outdoor physical exertion.',
    vulnerable: 'Avoid prolonged or strenuous outdoor physical exertion.',
    chronic: 'Minimise outdoor activity.',
  },
  hazardous: {
    healthy: 'Minimise outdoor activity.',
    vulnerable: 'Avoid outdoor activity.',
    chronic: 'Avoid outdoor activity.',
  },
};

/** @type {Record<string, string>} */
const RIGHT_NOW = {
  I: 'Air is fine for normal activities.',
  II: 'Cut back on long or hard exercise outdoors if you feel unwell.',
  III: 'Move strenuous activity indoors and keep time outside short.',
  IV: 'Stay indoors where you can. Wear a well-fitted N95 if you must go out.',
};

/** @type {Record<string, { title: string, text: string }>} */
const MASK = {
  good: { title: 'Breathe easy', text: 'No mask needed.' },
  moderate: { title: 'All good', text: 'No mask needed for most people.' },
  unhealthy: { title: 'Take it easy', text: 'Sensitive? Keep an N95 handy.' },
  very_unhealthy: { title: 'Mask up', text: 'N95 if you really must go out.' },
  hazardous: { title: 'Stay in', text: 'N95 outdoors, windows shut indoors.' },
};

/** @param {number|null} psi24h  @param {number|null} maxPm25Now */
export function advice(psi24h, maxPm25Now) {
  const band = psiBand(psi24h);
  const now = pm25Band(maxPm25Now);
  return {
    groups: band ? BY_PSI[band.id] : null,
    rightNow: now ? { band: now.id, label: now.label, text: RIGHT_NOW[now.id] } : null,
  };
}

/**
 * Short headline card, keyed off the headline PSI.
 * @param {number | null} psi
 */
export function maskCard(psi) {
  const band = psiBand(psi);
  return band ? MASK[band.id] : null;
}
