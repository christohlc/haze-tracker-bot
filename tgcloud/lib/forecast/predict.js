// @ts-check
// Quantile-linear forecast from the exported coefficients. Pure.

import { pm25ToPsi } from '../psi.js';
import { base, features } from './features.js';
import { MODEL } from './model.js';

/** @typedef {import('./features.js').RawWindow} RawWindow */

export const HORIZONS = Object.keys(MODEL.horizons).map(Number);

/**
 * log1p(PM2.5) at the horizon. The model predicts the change from the current reading, so the
 * level is base + b + w·z.
 * @param {any} m MODEL.horizons[h] @param {string} q '0.1' | '0.5' | '0.9'
 * @param {number} b0 base(raw) @param {number[]} x features in MODEL.features order
 */
export function quantile(m, q, b0, x) {
  const { b, w } = m.q[q];
  let s = b0 + b;
  for (let i = 0; i < x.length; i++) s += w[i] * ((x[i] - m.mean[i]) / m.scale[i]);
  return s;
}

/** Missing inputs fall back to the training median. @param {any} m @param {number[]} x */
const fillMissing = (m, x) => x.map((v, i) => (Number.isFinite(v) ? v : m.typical[i]));

/** log1p(PM2.5) → PSI @param {number} z */
const toPsi = (z) => /** @type {number} */ (pm25ToPsi(Math.expm1(z)));

/** @param {RawWindow} raw */
export function predict(raw) {
  const b0 = base(raw);
  let missing = 0;
  /** @type {number[]} */
  let firstX = [];
  const steps = HORIZONS.map((h, k) => {
    const m = MODEL.horizons[String(h)];
    const rawX = features(raw, h, MODEL.features);
    missing = Math.max(missing, rawX.filter((v) => !Number.isFinite(v)).length);
    const x = fillMissing(m, rawX);
    if (k === 0) firstX = x;
    const q10 = quantile(m, '0.1', b0, x) - m.widen;
    const q50 = quantile(m, '0.5', b0, x);
    const q90 = quantile(m, '0.9', b0, x) + m.widen;
    // Quantile crossing guard: keep lo ≤ median ≤ hi.
    return { h, psi: toPsi(q50), lo: toPsi(Math.min(q10, q50)), hi: toPsi(Math.max(q90, q50)) };
  });
  return { steps, factors: factors(b0, firstX), missing };
}

/**
 * What moves the next-hour forecast most, besides the current reading: set each input group to
 * its typical (training median) value and measure the change in the median forecast, in PSI.
 * Positive delta = this group pushes the forecast up compared with a typical hour.
 * @param {number} b0 base(raw) @param {number[]} x filled features for the first horizon
 */
function factors(b0, x) {
  const m = MODEL.horizons[String(HORIZONS[0])];
  const forecast = toPsi(quantile(m, '0.5', b0, x));
  return Object.entries(MODEL.groups)
    .map(([group, idx]) => {
      const typical = x.slice();
      for (const i of /** @type {number[]} */ (idx)) typical[i] = m.typical[i];
      return { group, label: MODEL.groupLabels[group] ?? group, delta: forecast - toPsi(quantile(m, '0.5', b0, typical)) };
    })
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}
