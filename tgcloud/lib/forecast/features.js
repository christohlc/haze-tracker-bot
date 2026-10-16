// @ts-check
// Forecast features. MUST stay identical to scripts/train/features.py —
// test/forecast.test.js checks this file against vectors exported from Python.
//
// A raw window for issue hour t (UTC):
//   pm: 25 island-mean PM2.5 values, hours t-24..t (last = t)
//   blh, ws, wd, precip: 25 values, hours t..t+24 (index = offset from t)
//   aq: { sg, riau, jambi, palembang, batam, kalbar }: 25 values each, hours t..t+24
//   hour_utc: hour of day of t in UTC

/** Air-quality points (lat, lon), same order as config.py. */
export const POINTS = {
  sg: [1.35, 103.82],
  riau: [0.53, 101.45],
  jambi: [-1.61, 103.61],
  palembang: [-2.98, 104.75],
  batam: [1.08, 104.03],
  kalbar: [-0.03, 109.33],
};

/** @param {number} x */
const l = (x) => Math.log1p(Math.max(x, 0));
/** @param {number[]} xs */
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * Feature vector for horizon h. A missing input yields NaN in that slot (the caller fills it).
 * @param {any} raw
 * @param {number} h
 * @returns {number[]}
 */
export function features(raw, h) {
  const { pm, aq } = raw;
  const y0 = l(pm[24]);
  const hour = (raw.hour_utc + 8 + h) % 24;
  const ws = raw.ws[h];
  const wd = (raw.wd[h] * Math.PI) / 180;
  const u = -ws * Math.sin(wd);
  const v = -ws * Math.cos(wd);
  const sumatra = l(mean([aq.riau[0], aq.jambi[0], aq.palembang[0]]));
  const kal = l(aq.kalbar[0]);
  return [
    y0,
    l(pm[23]),
    l(mean(pm.slice(22, 25))),
    l(mean(pm.slice(1, 25))),
    y0 - l(pm[21]),
    Math.sin((2 * Math.PI * hour) / 24),
    Math.cos((2 * Math.PI * hour) / 24),
    Math.log(Math.max(raw.blh[h], 50)),
    ws,
    u,
    v,
    Math.log1p(raw.precip.slice(1, h + 1).reduce((a, b) => a + b, 0)),
    l(aq.sg[h]),
    l(aq.sg[0]),
    sumatra,
    l(aq.batam[0]),
    kal,
    (sumatra * Math.max(u + v, 0)) / 14,
    (kal * Math.max(-u, 0)) / 10,
  ].map((x) => (x == null || Number.isNaN(x) ? NaN : x));
}
