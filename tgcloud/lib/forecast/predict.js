// @ts-check
// Quantile-linear forecast from the exported coefficients. Pure.

import { pm25ToPsi } from '../psi.js';
import { features } from './features.js';
import { MODEL } from './model.js';

export const HORIZONS = [1, 2, 3, 6, 24];

/** @param {any} m @param {string} q @param {number[]} x */
function quantile(m, q, x) {
  const { b, w } = m.q[q];
  let s = b;
  for (let i = 0; i < x.length; i++) s += w[i] * ((x[i] - m.mean[i]) / m.scale[i]);
  return s;
}

/** Missing inputs fall back to the training median. @param {any} m @param {number[]} x */
const fill = (m, x) => x.map((v, i) => (Number.isFinite(v) ? v : m.typical[i]));

/** log1p(PM2.5) → PSI @param {number} z */
const toPsi = (z) => /** @type {number} */ (pm25ToPsi(Math.expm1(z)));

/**
 * @param {any} raw window (see features.js)
 * @returns {{ steps: Array<{ h: number, psi: number, lo: number, hi: number }>, factors: Array<{ group: string, label: string, delta: number }>, missing: number }}
 */
export function predict(raw) {
  let missing = 0;
  const steps = HORIZONS.map((h) => {
    const m = MODEL.horizons[String(h)];
    const rawX = features(raw, h);
    if (h === 1) missing = rawX.filter((v) => !Number.isFinite(v)).length;
    const x = fill(m, rawX);
    const q10 = quantile(m, '0.1', x) - m.widen;
    const q50 = quantile(m, '0.5', x);
    const q90 = quantile(m, '0.9', x) + m.widen;
    // Quantile crossing guard: keep lo ≤ median ≤ hi.
    return { h, psi: toPsi(q50), lo: toPsi(Math.min(q10, q50)), hi: toPsi(Math.max(q90, q50)) };
  });
  return { steps, factors: factors(raw), missing };
}

/**
 * What moves the next-hour forecast most, besides current PM2.5: set each input group to its
 * typical (training median) value and measure the change in the median forecast, in PSI.
 * Positive delta = this group pushes the forecast up compared with a typical hour.
 * @param {any} raw
 */
export function factors(raw) {
  const m = MODEL.horizons['1'];
  const x = fill(m, features(raw, 1));
  const base = toPsi(quantile(m, '0.5', x));
  return Object.entries(MODEL.groups)
    .filter(([g]) => g !== 'recent')
    .map(([group, idx]) => {
      const xt = x.slice();
      for (const i of /** @type {number[]} */ (idx)) xt[i] = m.typical[i];
      return { group, label: MODEL.groupLabels[group] ?? group, delta: base - toPsi(quantile(m, '0.5', xt)) };
    })
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}
