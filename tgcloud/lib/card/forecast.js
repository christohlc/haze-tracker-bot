// @ts-check
// The forecast card that /forecast sends: NEA's 24-hr PSI forecast as a half-dial (as in the
// Mini App's What's ahead, after the meter on haze.gov.sg) and our range for the next few hours
// as band-coloured bars, on the summary card's sky. Either half may be missing; the height fits
// what's there. Rules: docs/design.md#forecast-card.
// Pure (no SDK): tests and the preview script use it too.

import { METER_MAX, meterSpan, psiRangeText } from '../outlook-parse.js';
import { bandById, bandRanges, psiBand } from '../psi.js';
import { sgtDayMonth, sgtDayName, sgtHour, sgtWeekday } from '../time.js';
import { CARD_W } from './geometry.js';
import { encodePng } from './png.js';
import { backdrop, BAND, C } from './summary.js';

/** @typedef {import('./raster.js').Canvas} Canvas */
/** @typedef {import('./raster.js').Rgb} Rgb */
/** @typedef {import('../ahead.js').Ahead} Ahead */

const PANEL = { x: 36, w: CARD_W - 72, r: 24, pad: 36 };
const BANDS = bandRanges();

/** @param {string} id */
const bandColour = (id) => BAND[/** @type {keyof typeof BAND} */ (id)];
/** A band's colour at 24% on white, as the app's faded track (`color-mix(… 24%, transparent)`). @param {string} id @returns {Rgb} */
const faded = (id) => /** @type {Rgb} */ (bandColour(id)[0].map((v, i) => Math.round(C.card[i] + (v - C.card[i]) * 0.24)));
const FADED = Object.fromEntries(BANDS.map((b) => [b.id, faded(b.id)]));
const SOLID = Object.fromEntries(BANDS.map((b) => [b.id, bandColour(b.id)[0]]));

/** "Tomorrow, Sunday 18 Oct"; a date further off drops the "on". @param {string} ymd */
function dayTitle(ymd) {
  const rel = sgtDayName(ymd);
  const date = `${sgtWeekday(ymd)} ${sgtDayMonth(ymd)}`;
  return rel.startsWith('on ') ? date : `${rel[0].toUpperCase()}${rel.slice(1)}, ${date}`;
}

/** A line with a white halo, so it stays visible on any band colour. @param {Canvas} c @param {number[]} p @param {number} w */
function inkLine(c, [x0, y0, x1, y1], w) {
  c.fillSegment(x0, y0, x1, y1, w + 6, C.card);
  c.fillSegment(x0, y0, x1, y1, w, C.ink);
}

// Dial geometry: from 0 on the left to METER_MAX on the right, y up.
const R = 300;
const THICK = 72;
const GAP = 1.5;
const angle = (/** @type {number} */ v) => Math.PI * (1 - Math.min(Math.max(v, 0), METER_MAX) / METER_MAX);
const at = (/** @type {number} */ cx, /** @type {number} */ cy, /** @type {number} */ v, /** @type {number} */ r) => [cx + r * Math.cos(angle(v)), cy - r * Math.sin(angle(v))];

/** Height of the outlook panel. */
const OUTLOOK_H = 740;

/**
 * NEA's forecast: the day, the dial, the bands as pills, NEA's own words and when it was issued.
 * @param {Canvas} c @param {number} top @param {NonNullable<Ahead['outlook']>} outlook @param {number | null} today
 */
function outlookPanel(c, top, outlook, today) {
  const x = PANEL.x + PANEL.pad;
  c.fillRoundRect(PANEL.x, top, PANEL.w, OUTLOOK_H, PANEL.r, C.card);
  c.text(dayTitle(outlook.forDate), x, top + 74, 'subtitle', C.ink);
  c.text('NEA’s 24-hr PSI forecast', x, top + 114, 'body', C.muted);

  const cx = CARD_W / 2;
  const cy = top + 500;
  const rIn = R - THICK;
  const span = meterSpan(outlook);
  const nums = outlook.psi && psiRangeText(outlook.psi);
  for (const b of bandRanges(METER_MAX)) {
    c.fillArc(cx, cy, rIn, R, angle(b.to - GAP), angle(b.from + GAP), FADED[b.id]);
    const from = Math.max(b.from, span?.lo ?? Infinity);
    const to = Math.min(b.to, span?.hi ?? -Infinity);
    if (to - from > 2 * GAP) c.fillArc(cx, cy, rIn, R, angle(to - GAP), angle(from + GAP), SOLID[b.id]);
  }
  for (const v of [100, 200, 300]) {
    if (today != null && Math.abs(v - Math.min(today, METER_MAX)) <= 40) continue;
    const [lx, ly] = at(cx, cy, v, R + 30);
    c.text(String(v), lx, ly + c.capHeight('label') / 2, 'label', C.muted, 'center');
  }
  if (today != null) {
    inkLine(c, [...at(cx, cy, today, rIn - 16), ...at(cx, cy, today, R + 16)], 6);
    // Along the tick, aligned away from the dial so it never runs into it.
    const [lx, ly] = at(cx, cy, today, R + 34);
    const cos = Math.cos(angle(today));
    c.text(`today ${today}`, lx, ly + c.capHeight('body') / 2, 'body', C.ink, cos > 0.35 ? 'left' : cos < -0.35 ? 'right' : 'center');
  }

  // NEA's numbers in the bowl of the dial, as on its own meter.
  if (nums) c.text(nums, cx, cy - 24, c.measure(nums, 'num') <= (rIn - 20) * 2 ? 'num' : 'numSmall', C.ink, 'center');

  // The bands NEA named, under the dial; a smaller size if the pair is too wide.
  const ids = outlook.to === outlook.from ? [outlook.from] : [outlook.from, outlook.to];
  const labels = ids.map((id) => bandById(id)?.label ?? id);
  const big = labels.reduce((w, l) => w + c.measure(l, 'subtitle') + 64, 0) + (ids.length - 1) * 80 <= PANEL.w - PANEL.pad * 2;
  const font = big ? 'subtitle' : 'head';
  const h = big ? 76 : 56;
  const pad = big ? 32 : 24;
  const widths = labels.map((l) => Math.ceil(c.measure(l, font)) + pad * 2);
  const toW = c.measure('to', font) + 32;
  let px = cx - (widths.reduce((a, b) => a + b, 0) + (ids.length - 1) * toW) / 2;
  const py = cy + 36;
  ids.forEach((id, i) => {
    if (i) {
      c.text('to', px + toW / 2, py + h / 2 + c.capHeight(font) / 2, font, C.muted, 'center');
      px += toW;
    }
    const [fill, ink] = bandColour(id);
    c.fillRoundRect(Math.round(px), py, widths[i], h, h / 2, fill);
    c.text(labels[i], px + pad, py + h / 2 + c.capHeight(font) / 2, font, ink);
    px += widths[i];
  });

  const words = `In NEA’s words: ${nums ? `${nums}, ${outlook.text}` : outlook.text}`;
  c.text(words, x, top + OUTLOOK_H - 66, c.measure(words, 'body') <= PANEL.w - PANEL.pad * 2 ? 'body' : 'label', C.ink);
  const tick = today != null ? ' · The tick is today’s official 24-hr PSI' : '';
  c.text(`Issued ${sgtDayMonth(outlook.issuedAt)}, ${sgtHour(outlook.issuedAt)} SGT${tick}`, x, top + OUTLOOK_H - 30, 'label', C.muted);
}

const ROW_H = 132;
/** Height of the range panel for `n` rows. @param {number} n */
const rangeHeight = (n) => 150 + n * ROW_H + 56;

/**
 * Our range: one row per step, each a bar on one shared scale with the likely span in band
 * colours over a faded track, and a line where the reading is now through every bar.
 * @param {Canvas} c @param {number} top @param {NonNullable<Ahead['range']>} range
 */
function rangePanel(c, top, range) {
  const x = PANEL.x + PANEL.pad;
  const w = PANEL.w - PANEL.pad * 2;
  c.fillRoundRect(PANEL.x, top, PANEL.w, rangeHeight(range.steps.length), PANEL.r, C.card);
  c.text('Next few hours', x, top + 74, 'subtitle', C.ink);
  c.text('Island-wide 1-hour PSI · our calculation, not official', x, top + 114, 'body', C.muted);

  const max = Math.max(300, Math.ceil(Math.max(range.now, ...range.steps.map((s) => s.hi)) / 100) * 100);
  const H = 26;
  const xOf = (/** @type {number} */ v) => x + (Math.min(Math.max(v, 0), max) / max) * w;
  const valueAt = (/** @type {number} */ px) => ((px - x) / w) * max;
  const colourAt = (/** @type {Record<string, Rgb>} */ palette) => (/** @type {number} */ px) => palette[psiBand(Math.round(valueAt(px)))?.id ?? 'good'];
  const nowX = xOf(range.now);

  range.steps.forEach((s, i) => {
    const y = top + 150 + i * ROW_H;
    const when = `In ${s.h} ${s.h === 1 ? 'hour' : 'hours'}`;
    c.text(when, x, y + 34, 'head', C.ink);
    c.text(`${sgtHour(s.t)} SGT`, x + c.measure(when, 'head') + 14, y + 34, 'body', C.muted);
    c.text(s.lo === s.hi ? String(s.lo) : `${s.lo}–${s.hi}`, x + w, y + 38, 'subtitle', C.ink, 'right');
    const by = y + 70;
    c.fillSegment(x + H / 2, by, x + w - H / 2, by, H, colourAt(FADED));
    // At least a dot, kept inside the track at either end.
    const a = Math.min(Math.max(xOf(s.lo), x + H / 2), x + w - H / 2);
    const b = Math.min(Math.max(xOf(s.hi), a), x + w - H / 2);
    c.fillSegment(a, by, b, by, H + 6, C.card);
    c.fillSegment(a, by, b, by, H, colourAt(SOLID));
    inkLine(c, [nowX, by - H / 2 - 6, nowX, by + H / 2 + 6], 4);
    const lo = psiBand(s.lo);
    const hi = psiBand(s.hi);
    const text = !lo || !hi ? '' : lo === hi ? lo.label : `${lo.label} to ${hi.label}`;
    c.text(text, x, y + 116, 'label', C.muted);
  });

  const ly = top + 150 + range.steps.length * ROW_H + 18;
  c.fillSegment(x + 2, ly - 16, x + 2, ly + 2, 4, C.ink);
  c.text(`now ${range.now} · scale 0–${max}`, x + 14, ly, 'label', C.muted);
}

/**
 * @param {any} snap a snapshot (lib/snapshot.js): the sky and today's 24-hr PSI
 * @param {Ahead} ahead at least one of `outlook` and `range`
 * @returns {Canvas}
 */
export function drawForecastCard(snap, { outlook, range }) {
  const TOP = 254;
  const GAP_Y = 24;
  const heights = [outlook ? OUTLOOK_H : 0, range ? rangeHeight(range.steps.length) : 0];
  const body = heights.filter(Boolean).reduce((a, b) => a + b + GAP_Y, 0);
  const { c, sky } = backdrop(TOP + body + 70, snap, { island: false });
  c.text('What’s ahead', 56, 222, 'title', sky.ink);

  let y = TOP;
  if (outlook) outlookPanel(c, y, outlook, snap.worst?.psi24h?.value != null ? Math.round(snap.worst.psi24h.value) : null);
  y += heights[0] && heights[0] + GAP_Y;
  if (range) rangePanel(c, y, range);
  y += heights[1] && heights[1] + GAP_Y;

  const sources = [outlook && 'Forecast: NEA, haze.gov.sg', range && 'next few hours: our calculation from NEA readings'].filter(Boolean).join(' · ');
  if (sources) c.text(`${sources[0].toUpperCase()}${sources.slice(1)}`, 56, y + 30, 'label', sky.ink);
  return c;
}

/** @param {any} snap @param {Ahead} ahead @returns {Uint8Array} the card as a PNG */
export function forecastCardPng(snap, ahead) {
  const c = drawForecastCard(snap, ahead);
  return encodePng({ width: c.width, height: c.height, data: c.data });
}
