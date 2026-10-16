// @ts-check
// The summary card: each region's 24-hour PSI and 1-hour PM2.5 on a map of Singapore, drawn in
// the app's own look (the hero sky, logo, region colours and band pills). Both numbers are
// NEA's, so the card needs no "our calculation" caption. Rules: docs/design.md#summary-card.
// Pure (no SDK): tests and the Mini App use it too.

import { REGIONS } from '../config.js';
import { PM25_BANDS, PSI_BANDS, pm25Band, psiBand } from '../psi.js';
import { LOGO, MAP_MASK } from './art.js';
import { CARD_H, CARD_W } from './geometry.js';
import { encodePng } from './png.js';
import { Canvas, decodeMask, fromBase64, rgb } from './raster.js';

/** @typedef {import('./raster.js').Rgb} Rgb */

/**
 * The hero sky per band (src/components/Hero.svelte, light theme), with its fixed ink. `land`
 * is how strongly the island shows through.
 * @type {Record<string, { top: Rgb, bottom: Rgb, haze: Rgb, hazeAlpha: number, ink: Rgb, land: number }>}
 */
const SKY = {
  none: { top: rgb('#8db8ea'), bottom: rgb('#d9e6f2'), haze: rgb('#ffffff'), hazeAlpha: 0.35, ink: rgb('#0e1a26'), land: 0.42 },
  moderate: { top: rgb('#a6c1db'), bottom: rgb('#e6e2d3'), haze: rgb('#f0e8d6'), hazeAlpha: 0.55, ink: rgb('#0e1a26'), land: 0.42 },
  unhealthy: { top: rgb('#c3c0b2'), bottom: rgb('#ebcd78'), haze: rgb('#f5e2aa'), hazeAlpha: 0.6, ink: rgb('#0e1a26'), land: 0.4 },
  very_unhealthy: { top: rgb('#b9946a'), bottom: rgb('#e7ad5c'), haze: rgb('#f0cd96'), hazeAlpha: 0.55, ink: rgb('#1e1206'), land: 0.34 },
  hazardous: { top: rgb('#4b2f45'), bottom: rgb('#8a4a36'), haze: rgb('#be785a'), hazeAlpha: 0.15, ink: rgb('#fbf3ea'), land: 0.14 },
};

const C = {
  card: rgb('#ffffff'),
  ink: rgb('#1c1712'),
  muted: rgb('#6b6560'),
  none: rgb('#dcdcdc'),
  noneInk: rgb('#3d3d3d'),
  missing: rgb('#b8b2ab'),
  stale: rgb('#e2b84a'),
};

/** --band-<id> and --band-<id>-ink. */
const BAND = {
  good: [rgb('#0ca30c'), rgb('#0b0b0b')],
  moderate: [rgb('#2a78d6'), rgb('#ffffff')],
  unhealthy: [rgb('#dcab00'), rgb('#0b0b0b')],
  very_unhealthy: [rgb('#e0481f'), rgb('#0b0b0b')],
  hazardous: [rgb('#8e3a9e'), rgb('#ffffff')],
};

/** --region-<id>. */
const REGION_COLOUR = {
  north: rgb('#2a78d6'),
  west: rgb('#eb6834'),
  central: rgb('#1baf7a'),
  east: rgb('#eda100'),
  south: rgb('#e87ba4'),
};

/** NEA's 1-hour PM2.5 bands borrow the PSI colours with the same meaning. */
const PM25_COLOUR = { I: 'good', II: 'unhealthy', III: 'very_unhealthy', IV: 'hazardous' };

const CARD = { w: 262, h: 222, r: 24 };

/** Top-left of each region's card, roughly where the region is. */
export const CARD_AT = {
  north: [409, 372],
  west: [36, 600],
  central: [409, 610],
  east: [782, 600],
  south: [409, 848],
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-10-16T13:00:00+08:00" (already SGT) → "1 pm", "1:30 pm". @param {string} iso */
export function cardTime(iso) {
  const h = Number(iso.slice(11, 13));
  const m = iso.slice(14, 16);
  return `${h % 12 || 12}${m === '00' ? '' : `:${m}`} ${h < 12 ? 'am' : 'pm'}`;
}

/** → "16 Oct, 1 pm SGT". @param {string} iso */
export function cardDate(iso) {
  return `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}, ${cardTime(iso)} SGT`;
}

/** "0–55", …, ">250" for a band list with inclusive `max`. @param {Array<{ max: number }>} bands */
export function bandRanges(bands) {
  return bands.map((b, i) => {
    const lo = i ? bands[i - 1].max + 1 : 0;
    return Number.isFinite(b.max) ? `${lo}–${b.max}` : `>${lo - 1}`;
  });
}

/** @param {number | null | undefined} v */
const fmt = (v) => (v == null ? '–' : String(Math.round(v)));
/** Rounded like the number shown, so a 55.4 drawn as "55" also gets 55's band. @param {number | null | undefined} v */
const shown = (v) => (v == null ? null : Math.round(v));

/**
 * A pill: band colour, label in the band's ink, vertically centred on `y + h / 2`.
 * @param {Canvas} c @param {number} x @param {number} y @param {string} text @param {Rgb} fill @param {Rgb} ink
 * @param {{ h?: number, pad?: number }} [opts] @returns {number} its width
 */
function pill(c, x, y, text, fill, ink, { h = 34, pad = 14 } = {}) {
  const w = Math.ceil(c.measure(text, 'label')) + pad * 2;
  c.fillRoundRect(x, y, w, h, h / 2, fill);
  c.text(text, x + pad, y + h / 2 + c.capHeight('label') / 2, 'label', ink);
  return w;
}

/** @param {Canvas} c @param {any} region */
function regionCard(c, region) {
  const [x, y] = CARD_AT[/** @type {keyof typeof CARD_AT} */ (region.id)];
  c.fillRoundRect(x, y, CARD.w, CARD.h, CARD.r, C.card);

  // Name with its region colour, then the big number and what it is.
  c.fillRoundRect(x + 24, y + 30, 16, 16, 8, REGION_COLOUR[/** @type {keyof typeof REGION_COLOUR} */ (region.id)]);
  c.text(region.name, x + 50, y + 48, 'head', C.ink);

  const value = fmt(region.psi24h);
  const big = c.measure(value, 'num') <= 140 ? 'num' : 'numSmall';
  c.text(value, x + 22, y + 124, big, region.psi24h == null ? C.missing : C.ink);
  c.text('24-hr PSI', x + 22 + c.measure(value, big) + 12, y + 124, 'label', C.muted);

  const band = psiBand(shown(region.psi24h));
  const [fill, ink] = band ? BAND[/** @type {keyof typeof BAND} */ (band.id)] : [C.none, C.noneInk];
  pill(c, x + 24, y + 138, band?.label ?? 'No reading', fill, ink);

  // 1-hour PM2.5 underneath, with its own band dot.
  const pm = pm25Band(shown(region.pm25));
  const pmFill = pm ? BAND[/** @type {keyof typeof BAND} */ (PM25_COLOUR[/** @type {keyof typeof PM25_COLOUR} */ (pm.id)])][0] : C.none;
  c.fillRoundRect(x + 26, y + 191, 12, 12, 6, pmFill);
  c.text(`1-hr PM2.5: ${fmt(region.pm25)}`, x + 48, y + 204, 'label', C.ink);
}

/**
 * A row of band chips under a title, squeezed to fit the panel.
 * @param {Canvas} c @param {number} y title baseline @param {string} title
 * @param {Array<{ label: string, max: number }>} bands @param {string[]} colourIds
 */
function legendRow(c, y, title, bands, colourIds) {
  const x0 = 64;
  const avail = CARD_W - 36 - 28 - x0;
  const gap = 10;
  const labels = bandRanges(bands).map((range, i) => `${bands[i].label} ${range}`);
  const text = labels.reduce((s, l) => s + c.measure(l, 'label'), 0);
  const pad = Math.max(6, Math.min(16, Math.floor((avail - text - gap * (labels.length - 1)) / (labels.length * 2))));
  c.text(title, x0, y, 'head', C.ink);
  let x = x0;
  labels.forEach((l, i) => {
    const [fill, ink] = BAND[/** @type {keyof typeof BAND} */ (colourIds[i])];
    x += pill(c, x, y + 14, l, fill, ink, { h: 40, pad }) + gap;
  });
}

/** The map silhouette and logo, decoded once. */
let mapAlpha = /** @type {Uint8Array | null} */ (null);
let logoRgba = /** @type {Uint8Array | null} */ (null);

/** @param {any} snap a snapshot (lib/snapshot.js) @returns {Canvas} */
export function drawSummaryCard(snap) {
  const worst = snap.worst?.psi24h ?? null;
  const band = psiBand(worst?.value);
  const sky = SKY[band?.id ?? 'none'] ?? SKY.none;

  const c = new Canvas(CARD_W, CARD_H, sky.top);
  c.verticalGradient(sky.top, sky.bottom);
  // The hero's haze: radial-gradient(120% 60% at 20% 105%, haze, transparent 70%).
  c.glow(CARD_W * 0.2, CARD_H * 1.05, CARD_W * 1.2, CARD_H * 0.6, sky.haze, sky.hazeAlpha, 0.7);

  mapAlpha ??= decodeMask(fromBase64(MAP_MASK.data), 0, MAP_MASK.w * MAP_MASK.h);
  c.blitMask(mapAlpha, MAP_MASK.w, MAP_MASK.h, 0, 0, rgb('#ffffff'), sky.land);

  // Brand, then the answer: the worst official reading and its band.
  logoRgba ??= fromBase64(LOGO.data);
  c.blitRgba(logoRgba, LOGO.w, LOGO.h, 56, 48);
  c.text('I’m going hazelnuts!', 164, 84, 'head', sky.ink);
  c.text(`Singapore haze · ${cardDate(snap.asOf)}`, 164, 122, 'body', sky.ink);
  c.text(band?.label ?? 'No reading yet', 56, 236, 'title', sky.ink);
  if (worst) c.text(`24-hr PSI up to ${fmt(worst.value)} in ${worst.name}`, 56, 292, 'subtitle', sky.ink);
  if (snap.stale) {
    const note = 'NEA hasn’t updated recently, so this may be out of date';
    c.fillRoundRect(56, 314, Math.ceil(c.measure(note, 'body')) + 36, 44, 22, C.stale);
    c.text(note, 74, 336 + c.capHeight('body') / 2, 'body', C.ink);
  }

  const byId = new Map(snap.regions.map((/** @type {any} */ r) => [r.id, r]));
  for (const { id, name } of REGIONS) regionCard(c, byId.get(id) ?? { id, name, pm25: null, psi24h: null });

  c.fillRoundRect(36, 1092, CARD_W - 72, 208, CARD.r, C.card);
  legendRow(c, 1136, '24-hr PSI', PSI_BANDS, PSI_BANDS.map((b) => b.id));
  legendRow(c, 1230, '1-hr PM2.5 (µg/m³)', PM25_BANDS, PM25_BANDS.map((b) => PM25_COLOUR[/** @type {keyof typeof PM25_COLOUR} */ (b.id)]));

  const psiNote = snap.psiAsOf && snap.psiAsOf !== snap.asOf ? ` 24-hr PSI as at ${cardTime(snap.psiAsOf)}.` : '';
  c.text(`Readings from NEA.${psiNote} Advisories: haze.gov.sg`, 56, 1332, 'label', sky.ink);
  return c;
}

/** @param {any} snap @returns {Uint8Array} the card as a PNG */
export function summaryCardPng(snap) {
  const c = drawSummaryCard(snap);
  return encodePng({ width: c.width, height: c.height, data: c.data });
}
