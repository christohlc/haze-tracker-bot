// @ts-check
// The summary card: each region's 24-hour PSI and 1-hour PM2.5 on a map of Singapore, in the
// app's own look: the hero sky for the worst band behind, and each region's card filled with its
// own band colour (outlined in white) so the severity reads at a glance. Both numbers are
// NEA's, so the card needs no "our calculation" caption. Rules: docs/design.md#summary-card.
// Pure (no SDK): tests and the Mini App use it too.

import { REGIONS } from '../config.js';
import { PM25_BANDS, pm25Band, PSI_BANDS, psiBand } from '../psi.js';
import { STALE_NOTE } from '../snapshot.js';
import { LOGO, MAP_MASK } from './art.js';
import { sgtDayMonth, sgtHour } from '../time.js';
import { CARD_H, CARD_W, project } from './geometry.js';
import { encodePng } from './png.js';
import { Canvas, decodeMask, fromBase64, rgb } from './raster.js';

/** @typedef {import('./raster.js').Rgb} Rgb */

/**
 * The hero sky for the worst band (src/components/Hero.svelte, light theme), with its fixed ink.
 * `land` is how strongly the island shows through.
 * @type {Record<string, { top: Rgb, bottom: Rgb, haze: Rgb, hazeAlpha: number, ink: Rgb, land: number }>}
 */
const SKY = {
  none: { top: rgb('#8db8ea'), bottom: rgb('#d9e6f2'), haze: rgb('#ffffff'), hazeAlpha: 0.35, ink: rgb('#0e1a26'), land: 0.42 },
  moderate: { top: rgb('#a6c1db'), bottom: rgb('#e6e2d3'), haze: rgb('#f0e8d6'), hazeAlpha: 0.55, ink: rgb('#0e1a26'), land: 0.42 },
  unhealthy: { top: rgb('#c3c0b2'), bottom: rgb('#ebcd78'), haze: rgb('#f5e2aa'), hazeAlpha: 0.6, ink: rgb('#0e1a26'), land: 0.4 },
  very_unhealthy: { top: rgb('#b9946a'), bottom: rgb('#e7ad5c'), haze: rgb('#f0cd96'), hazeAlpha: 0.55, ink: rgb('#1e1206'), land: 0.34 },
  hazardous: { top: rgb('#4b2f45'), bottom: rgb('#8a4a36'), haze: rgb('#be785a'), hazeAlpha: 0.15, ink: rgb('#fbf3ea'), land: 0.14 },
};

/** White outline around each region card, so it stands off a sky of a similar colour. */
const OUTLINE = 5;

export const C = {
  card: rgb('#ffffff'),
  ink: rgb('#1c1712'),
  muted: rgb('#6b6560'),
  none: rgb('#dcdcdc'),
  noneInk: rgb('#3d3d3d'),
  stale: rgb('#e2b84a'),
};

/** --band-<id> and --band-<id>-ink. @type {Record<'good' | 'moderate' | 'unhealthy' | 'very_unhealthy' | 'hazardous', [Rgb, Rgb]>} */
export const BAND = {
  good: [rgb('#0ca30c'), rgb('#0b0b0b')],
  moderate: [rgb('#2a78d6'), rgb('#ffffff')],
  unhealthy: [rgb('#dcab00'), rgb('#0b0b0b')],
  very_unhealthy: [rgb('#e0481f'), rgb('#0b0b0b')],
  hazardous: [rgb('#8e3a9e'), rgb('#ffffff')],
};

/** The 1-hour PM2.5 bands' colours [fill, ink], as the newspapers' graphics use: the PSI palette's
 *  green, yellow and orange for the same severity, and a red of its own for Very high.
 *  @type {Record<'I' | 'II' | 'III' | 'IV', [Rgb, Rgb]>} */
export const PM25_BAND = {
  I: BAND.good,
  II: BAND.unhealthy,
  III: BAND.very_unhealthy,
  IV: [rgb('#b3201c'), rgb('#ffffff')],
};

/** `foot` is the white strip at the bottom of each card that holds the PM2.5. */
const CARD = { w: 262, h: 192, r: 24, foot: 36 };

/** Each region's card is centred on NEA's reference point for it, with three nudges: North and
 *  South are closer to Central than a card is tall, so they're pushed out just enough to clear it;
 *  the middle column sits a little east (103.83°) and East further toward Changi (103.96°), so the
 *  row is balanced over the island. */
const centres = Object.fromEntries(REGIONS.map((r) => [r.id, project(r.lon, r.lat)]));
const PITCH = CARD.h + 24;
for (const id of ['north', 'central', 'south']) centres[id][0] = project(103.83, 0)[0];
centres.east[0] = project(103.96, 0)[0];
centres.north[1] = Math.min(centres.north[1], centres.central[1] - PITCH);
centres.south[1] = Math.max(centres.south[1], centres.central[1] + PITCH);

/** Top-left of each region's card. @type {Record<string, [number, number]>} */
export const CARD_AT = Object.fromEntries(
  Object.entries(centres).map(([id, [x, y]]) => [id, [Math.round(x - CARD.w / 2), Math.round(y - CARD.h / 2)]]),
);

/** → "16 Oct, 1 pm SGT". @param {string} iso */
export const cardDate = (iso) => `${sgtDayMonth(iso)}, ${sgtHour(iso)} SGT`;

/** "0–55", …, ">250" for a band list with inclusive `max`. @param {Array<{ max: number }>} bands */
export function bandRanges(bands) {
  return bands.map((b, i) => {
    const lo = i ? bands[i - 1].max + 1 : 0;
    return Number.isFinite(b.max) ? `${lo}–${b.max}` : `>${lo - 1}`;
  });
}

/** Rounded as shown, so a 55.4 drawn as "55" also gets 55's band. @param {number | null | undefined} v */
const shown = (v) => (v == null ? null : Math.round(v));
/** @param {number | null | undefined} v */
const fmt = (v) => String(shown(v) ?? '–');

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

/**
 * A region's card, filled with its 24-hour PSI band colour so severity reads at a glance.
 * @param {Canvas} c @param {any} region
 */
function regionCard(c, region) {
  const [x, y] = CARD_AT[region.id];
  const band = psiBand(shown(region.psi24h));
  const [fill, ink] = band ? BAND[/** @type {keyof typeof BAND} */ (band.id)] : [C.none, C.noneInk];
  c.fillRoundRect(x - OUTLINE, y - OUTLINE, CARD.w + OUTLINE * 2, CARD.h + OUTLINE * 2, CARD.r + OUTLINE, C.card);
  c.fillRoundRect(x, y, CARD.w, CARD.h, CARD.r, fill);

  c.text(region.name, x + 24, y + 40, 'head', ink);
  c.text('24-hr PSI', x + CARD.w - 24, y + 38, 'label', ink, 'right');
  const value = fmt(region.psi24h);
  c.text(value, x + 22, y + 104, c.measure(value, 'num') <= CARD.w - 44 ? 'num' : 'numSmall', ink);
  c.text(band?.label ?? 'No reading', x + 24, y + 138, 'body', ink);
  // The last hour's PM2.5 in a footer of its own band's colour, under a white rule. No unit: the
  // Mini App has the detail.
  const pm = pm25Band(shown(region.pm25));
  const [pmFill, pmInk] = pm ? PM25_BAND[/** @type {keyof typeof PM25_BAND} */ (pm.id)] : [C.none, C.noneInk];
  const footY = y + CARD.h - CARD.foot;
  c.fillRect(x, footY - 3, CARD.w, 3, C.card);
  c.fillRoundRect(x, footY, CARD.w, CARD.foot, [0, 0, CARD.r, CARD.r], pmFill);
  c.text(`1-hr PM2.5: ${fmt(region.pm25)}`, x + 24, footY + CARD.foot / 2 + c.capHeight('label') / 2, 'label', pmInk);
}

/**
 * A row of band chips under a title, squeezed to fit the panel.
 * @param {Canvas} c @param {number} y title baseline @param {string} title
 * @param {Array<{ label: string, max: number }>} bands @param {Array<[Rgb, Rgb]>} colours
 */
function legendRow(c, y, title, bands, colours) {
  const x0 = 64;
  const avail = CARD_W - 36 - 28 - x0;
  const gap = 10;
  const labels = bandRanges(bands).map((range, i) => `${bands[i].label} ${range}`);
  const text = labels.reduce((s, l) => s + c.measure(l, 'label'), 0);
  const pad = Math.max(6, Math.min(16, Math.floor((avail - text - gap * (labels.length - 1)) / (labels.length * 2))));
  c.text(title, x0, y, 'head', C.ink);
  let x = x0;
  labels.forEach((l, i) => {
    const [fill, ink] = colours[i];
    x += pill(c, x, y + 14, l, fill, ink, { h: 40, pad }) + gap;
  });
}

/** The map silhouette and logo, decoded once. */
let mapAlpha = /** @type {Uint8Array | null} */ (null);
let logoRgba = /** @type {Uint8Array | null} */ (null);

/**
 * A card's background and brand: the hero sky for today's worst 24-hour PSI band, the island,
 * the logo and name, and "Singapore haze · <time>". Shared with the forecast card, which leaves
 * out the island: its panels would cover nearly all of it.
 * @param {number} height @param {any} snap @param {{ island?: boolean }} [opts]
 * @returns {{ c: Canvas, sky: typeof SKY.none }}
 */
export function backdrop(height, snap, { island = true } = {}) {
  const sky = SKY[psiBand(snap.worst?.psi24h?.value)?.id ?? 'none'] ?? SKY.none;
  const c = new Canvas(CARD_W, height);
  c.verticalGradient(sky.top, sky.bottom);
  // The hero's haze: radial-gradient(120% 60% at 20% 105%, haze, transparent 70%).
  c.glow(CARD_W * 0.2, height * 1.05, CARD_W * 1.2, height * 0.6, sky.haze, sky.hazeAlpha, 0.7);
  if (island) {
    mapAlpha ??= decodeMask(fromBase64(MAP_MASK.data), 0, MAP_MASK.w * MAP_MASK.h);
    c.blitMask(mapAlpha, MAP_MASK.w, MAP_MASK.h, 0, 0, C.card, sky.land);
  }
  logoRgba ??= fromBase64(LOGO.data);
  c.blitRgba(logoRgba, LOGO.w, LOGO.h, 56, 48);
  c.text('I’m going hazelnuts!', 164, 84, 'head', sky.ink);
  c.text(`Singapore haze · ${cardDate(snap.asOf)}`, 164, 122, 'body', sky.ink);
  return { c, sky };
}

/** @param {any} snap a snapshot (lib/snapshot.js) @returns {Canvas} */
export function drawSummaryCard(snap) {
  // Brand, then what the card shows. No band for the whole island: each region's card has its
  // own, and the caption says where each applies.
  const { c, sky } = backdrop(CARD_H, snap);
  c.text('24-hr PSI by region', 56, 236, 'title', sky.ink);
  if (snap.stale) {
    c.fillRoundRect(56, 314, Math.ceil(c.measure(STALE_NOTE, 'body')) + 36, 44, 22, C.stale);
    c.text(STALE_NOTE, 74, 336 + c.capHeight('body') / 2, 'body', C.ink);
  }

  const byId = new Map(snap.regions.map((/** @type {any} */ r) => [r.id, r]));
  for (const { id, name } of REGIONS) regionCard(c, byId.get(id) ?? { id, name, pm25: null, psi24h: null });

  c.fillRoundRect(36, 1030, CARD_W - 72, 226, CARD.r, C.card);
  legendRow(c, 1074, 'Card: 24-hr PSI band', PSI_BANDS, PSI_BANDS.map((b) => BAND[/** @type {keyof typeof BAND} */ (b.id)]));
  legendRow(c, 1170, 'Footer: 1-hr PM2.5 band', PM25_BANDS, PM25_BANDS.map((b) => PM25_BAND[/** @type {keyof typeof PM25_BAND} */ (b.id)]));

  const psiNote = snap.psiAsOf && snap.psiAsOf !== snap.asOf ? ` 24-hr PSI as at ${sgtHour(snap.psiAsOf)}.` : '';
  c.text(`Readings from NEA.${psiNote} Advisories: haze.gov.sg`, 56, 1300, 'label', sky.ink);
  return c;
}

/** @param {any} snap @returns {Uint8Array} the card as a PNG */
export function summaryCardPng(snap) {
  const c = drawSummaryCard(snap);
  return encodePng({ width: c.width, height: c.height, data: c.data });
}
