// @ts-check
// Candidate forecast features, by name. MUST stay identical to scripts/train/features.py —
// test/forecast.test.js checks every candidate against vectors exported from Python.
// The model predicts the change from base(raw) = log1p(current PM2.5); MODEL.features lists
// which candidates it uses, in order.

/**
 * @typedef {object} RawWindow
 * @property {number[]} pm 25 island-mean PM2.5 values, hours t-24..t (last = t)
 * @property {number[]} [blh] 25 values, hours t..t+24
 * @property {number[]} ws wind speed km/h, hours t..t+24
 * @property {number[]} wd wind direction (from), degrees, hours t..t+24
 * @property {number[]} precip mm, hours t..t+24
 * @property {Record<string, number[]>} aq PM2.5 µg/m³ per point, hours t..t+24
 * @property {number} hour_utc hour of day of t in UTC
 */

/** @param {number} x */
const log1pPos = (x) => Math.log1p(Math.max(x, 0));
/** @param {number[]} xs */
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** (u, v) in km/h toward the east and north. @param {RawWindow} r @param {number} h */
function wind(r, h) {
  const wd = (r.wd[h] * Math.PI) / 180;
  return [-r.ws[h] * Math.sin(wd), -r.ws[h] * Math.cos(wd)];
}
/** SGT hour of the forecast target. @param {RawWindow} r @param {number} h */
const targetHour = (r, h) => (r.hour_utc + 8 + h) % 24;
/** @param {RawWindow} r */
const sumatra = (r) => log1pPos(mean([r.aq.riau[0], r.aq.jambi[0], r.aq.palembang[0]]));

/** @type {Record<string, (r: RawWindow, h: number) => number>} */
const CANDIDATES = {
  y1: (r) => log1pPos(r.pm[23]),
  y3: (r) => log1pPos(mean(r.pm.slice(22, 25))),
  y24: (r) => log1pPos(mean(r.pm.slice(1, 25))),
  dy3: (r) => log1pPos(r.pm[24]) - log1pPos(r.pm[21]),
  hour_sin: (r, h) => Math.sin((2 * Math.PI * targetHour(r, h)) / 24),
  hour_cos: (r, h) => Math.cos((2 * Math.PI * targetHour(r, h)) / 24),
  log_blh: (r, h) => Math.log(Math.max(/** @type {number[]} */ (r.blh)[h], 50)),
  wind_speed: (r, h) => r.ws[h],
  wind_u: (r, h) => wind(r, h)[0],
  wind_v: (r, h) => wind(r, h)[1],
  rain: (r, h) => Math.log1p(r.precip.slice(1, h + 1).reduce((a, b) => a + b, 0)),
  cams_sg_h: (r, h) => log1pPos(r.aq.sg[h]),
  cams_sg_0: (r) => log1pPos(r.aq.sg[0]),
  sumatra: (r) => sumatra(r),
  batam: (r) => log1pPos(r.aq.batam[0]),
  kalimantan: (r) => log1pPos(r.aq.kalbar[0]),
  sumatra_x_sw: (r, h) => (sumatra(r) * Math.max(wind(r, h)[0] + wind(r, h)[1], 0)) / 14,
  kalimantan_x_e: (r, h) => (log1pPos(r.aq.kalbar[0]) * Math.max(-wind(r, h)[0], 0)) / 10,
};

export const CANDIDATE_NAMES = Object.keys(CANDIDATES);

/** log1p of the current island-mean PM2.5. @param {RawWindow} raw */
export const base = (raw) => log1pPos(raw.pm[24]);

/**
 * Named features for horizon h. A missing input gives NaN in that slot (the caller fills it).
 * @param {RawWindow} raw @param {number} h @param {string[]} names
 */
export function features(raw, h, names) {
  return names.map((n) => {
    if (!CANDIDATES[n]) throw new Error(`Unknown forecast feature "${n}"`);
    return CANDIDATES[n](raw, h);
  });
}
