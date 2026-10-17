// @ts-check
// Health advice, following NEA's 24-hour PSI and 1-hour PM2.5 advisories (simplified wording;
// haze.gov.sg is official).

import { psiBand, pm25Band } from './psi.js';

/** @type {Record<string, { title: string, text: string }>} */
const MASK = {
  good: { title: 'Breathe easy', text: 'No mask needed.' },
  moderate: { title: 'All good', text: 'No mask needed for most people.' },
  unhealthy: { title: 'Take it easy', text: 'Sensitive? Keep an N95 handy.' },
  very_unhealthy: { title: 'Mask up', text: 'N95 if you really must go out.' },
  hazardous: { title: 'Stay in', text: 'N95 outdoors, windows shut indoors.' },
};

/**
 * Short headline card, keyed off the headline PSI.
 * @param {number | null} psi
 */
export function maskCard(psi) {
  const band = psiBand(psi);
  return band ? MASK[band.id] : null;
}

// "Is it safe outside right now?" in one line. NEA's advice for the 24-hour PSI band and for the
// 1-hour PM2.5 band, put on one scale of outdoor action, 0 (normal) to 4 (stay in); the stricter wins.

/** NEA's 24-hour PSI advice as a rank: [general public, vulnerable people]. Vulnerable people take
    the stricter of NEA's "elderly, pregnant women, children" and "chronic lung or heart disease" rows. */
const PSI_RANK = {
  good: [0, 0], // normal activities
  moderate: [0, 0],
  unhealthy: [1, 2], // reduce prolonged or strenuous exertion · avoid it
  very_unhealthy: [2, 3], // avoid prolonged or strenuous exertion · minimise outdoor activity
  hazardous: [3, 4], // minimise outdoor activity · avoid outdoor activity
};
/** NEA's 1-hour PM2.5 bands as a rank; NEA gives one piece of advice per band for everyone. */
const PM25_RANK = { I: 0, II: 1, III: 3, IV: 4 };

const VERDICT = [
  { headline: 'Fine for normal activities.', detail: '' },
  { headline: 'Go easy on long or hard exercise outdoors.', detail: 'Stop and rest if you feel unwell.' },
  { headline: 'Skip long or hard exercise outdoors.', detail: 'Move workouts indoors.' },
  { headline: 'Keep time outdoors short.', detail: 'Move activities indoors. Wear a well-fitted N95 if you must be out for long.' },
  { headline: 'Stay indoors where you can.', detail: 'Keep windows shut and run a purifier or air-con on recirculate. Wear a well-fitted N95 if you must go out.' },
];

/**
 * The stricter of NEA's 24-hour PSI and 1-hour PM2.5 advice, for the general public or vulnerable
 * people. Null without either reading.
 * @param {number | null} psi24h  @param {number | null} pm25Now  @param {'general' | 'vulnerable'} group
 * @returns {{ rank: number, headline: string, detail: string } | null}
 */
export function verdict(psi24h, pm25Now, group) {
  const band = psiBand(psi24h);
  const now = pm25Band(pm25Now);
  if (!band && !now) return null;
  const psiRank = band ? PSI_RANK[/** @type {keyof typeof PSI_RANK} */ (band.id)][group === 'general' ? 0 : 1] : -1;
  const pmRank = now ? PM25_RANK[/** @type {keyof typeof PM25_RANK} */ (now.id)] : -1;
  const rank = Math.max(psiRank, pmRank);
  return { rank, ...VERDICT[rank] };
}
