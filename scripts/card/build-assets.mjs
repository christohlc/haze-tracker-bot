// Generates the summary card's bitmaps: tgcloud/lib/card/glyphs.js (Nunito glyphs at the sizes
// the card uses) and tgcloud/lib/card/art.js (the island silhouette from singapore.svg, and the logo). The
// platform has no canvas or font rasteriser, so the card blits these masks itself.
//
//   npm run card:assets
//
// Masks are 4-bit alpha, run-length coded (see decodeMask in tgcloud/lib/card/raster.js):
// one byte per run, level << 4 | n, run = n + 1 for n < 15, else 16 + a LEB128 varint.

import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync } from 'node:fs';
import { CARD_H, CARD_W } from '../../tgcloud/lib/card/geometry.js';

const LOGO_SIZE = 88;

const FONTS_DIR = new URL('./fonts/', import.meta.url);
const NUMS = '0123456789–';
const TEXT = `${Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join('')}·–’µ³≥`;

/** name → [file, px size, charset]. summary.js picks them by name. */
const FONTS = {
  num: ['Nunito-ExtraBold.ttf', 70, NUMS],
  numSmall: ['Nunito-ExtraBold.ttf', 52, NUMS],
  title: ['Nunito-ExtraBold.ttf', 66, TEXT],
  subtitle: ['Nunito-ExtraBold.ttf', 44, TEXT],
  head: ['Nunito-ExtraBold.ttf', 28, TEXT],
  body: ['Nunito-Bold.ttf', 26, TEXT],
  label: ['Nunito-Bold.ttf', 20, TEXT],
};

/** @param {string} svg @param {string[]} [fontFiles] */
function render(svg, fontFiles = []) {
  const r = new Resvg(svg, { font: { fontFiles, loadSystemFonts: false, defaultFontFamily: 'Nunito' } });
  return { r, img: r.render() };
}

const esc = (/** @type {string} */ s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** @param {Uint8Array} alpha 8-bit @returns {number[]} */
function rle(alpha) {
  const out = [];
  for (let i = 0; i < alpha.length; ) {
    const level = Math.round((alpha[i] * 15) / 255);
    let run = 1;
    while (i + run < alpha.length && Math.round((alpha[i + run] * 15) / 255) === level) run++;
    i += run;
    if (run < 16) out.push((level << 4) | (run - 1));
    else {
      out.push((level << 4) | 15);
      let v = run - 16;
      do {
        out.push((v & 0x7f) | (v > 0x7f ? 0x80 : 0));
        v >>>= 7;
      } while (v);
    }
  }
  return out;
}

/**
 * Advance widths in font units, from the TTF's cmap (format 4) and hmtx tables. resvg can
 * measure ink but not advances, and kerning is left out on purpose (the card's strings are short).
 * @param {Buffer} ttf
 */
function advances(ttf) {
  const tables = {};
  for (let i = 0, n = ttf.readUInt16BE(4); i < n; i++) {
    const at = 12 + i * 16;
    tables[ttf.toString('latin1', at, at + 4)] = ttf.readUInt32BE(at + 8);
  }
  const unitsPerEm = ttf.readUInt16BE(tables.head + 18);
  const nHMetrics = ttf.readUInt16BE(tables.hhea + 34);
  const cmap = tables.cmap;
  let sub = -1;
  for (let i = 0, n = ttf.readUInt16BE(cmap + 2); i < n; i++) {
    const at = cmap + 4 + i * 8;
    if (ttf.readUInt16BE(at) === 3 && ttf.readUInt16BE(at + 2) === 1) sub = cmap + ttf.readUInt32BE(at + 4);
  }
  if (sub < 0 || ttf.readUInt16BE(sub) !== 4) throw new Error('no format 4 cmap');
  const segs = ttf.readUInt16BE(sub + 6) / 2;
  const ends = sub + 14;
  const starts = ends + segs * 2 + 2;
  const deltas = starts + segs * 2;
  const offsets = deltas + segs * 2;
  /** @param {number} code */
  const glyphId = (code) => {
    for (let i = 0; i < segs; i++) {
      if (code > ttf.readUInt16BE(ends + i * 2)) continue;
      const start = ttf.readUInt16BE(starts + i * 2);
      if (code < start) return 0;
      const delta = ttf.readInt16BE(deltas + i * 2);
      const ro = ttf.readUInt16BE(offsets + i * 2);
      if (!ro) return (code + delta) & 0xffff;
      const g = ttf.readUInt16BE(offsets + i * 2 + ro + (code - start) * 2);
      return g ? (g + delta) & 0xffff : 0;
    }
    return 0;
  };
  /** @param {string} ch @param {number} size px */
  return (ch, size) => {
    const g = Math.min(glyphId(/** @type {number} */ (ch.codePointAt(0))), nHMetrics - 1);
    return (ttf.readUInt16BE(tables.hmtx + g * 4) * size) / unitsPerEm;
  };
}

/** @param {string} file @param {number} size @param {string} chars */
function buildFont(file, size, chars) {
  const path = new URL(file, FONTS_DIR).pathname;
  const advance = advances(readFileSync(path));
  // Every glyph in one render, each in its own cell.
  const list = [...chars];
  const cell = Math.ceil(size * 1.6);
  const W = cell * list.length;
  const H = Math.ceil(size * 1.8);
  const padX = Math.round(size * 0.3);
  const baseY = Math.round(size * 1.3);
  const texts = list
    .map((ch, i) => `<text x="${i * cell + padX}" y="${baseY}" font-size="${size}" xml:space="preserve">${esc(ch)}</text>`)
    .join('');
  const px = render(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${texts}</svg>`, [path]).img.pixels;

  const glyphs = [];
  /** @type {number[]} */
  const bytes = [];
  list.forEach((ch, i) => {
    const adv = Math.round(advance(ch, size) * 10) / 10;
    const left = i * cell;
    let x0 = cell, y0 = H, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < cell; x++)
        if (px[(y * W + left + x) * 4 + 3]) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
    if (x1 < 0) {
      glyphs.push([ch, adv, 0, 0, 0, 0, bytes.length]);
      return;
    }
    const w = x1 - x0 + 1;
    const h = y1 - y0 + 1;
    const alpha = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) alpha[y * w + x] = px[((y0 + y) * W + left + x0 + x) * 4 + 3];
    // Offsets from the pen position on the baseline.
    glyphs.push([ch, adv, x0 - padX, y0 - baseY, w, h, bytes.length]);
    for (const b of rle(alpha)) bytes.push(b);
  });
  const cap = glyphs.find((g) => g[0] === (chars.includes('H') ? 'H' : '0'));
  return { size, cap: -(/** @type {number} */ (cap?.[3] ?? 0)), glyphs, data: Buffer.from(bytes).toString('base64') };
}

const header = (/** @type {string} */ what) =>
  `// GENERATED by scripts/card/build-assets.mjs (npm run card:assets). Don't edit by hand.\n// ${what}\n`;

const fonts = Object.fromEntries(Object.entries(FONTS).map(([name, [file, size, chars]]) => [name, buildFont(file, size, chars)]));
writeFileSync(
  new URL('../../tgcloud/lib/card/glyphs.js', import.meta.url),
  `${header('Nunito (SIL Open Font License, scripts/card/fonts/OFL.txt) glyph masks. Each glyph: [char, advance, x, y, w, h, offset], x/y from the pen on the baseline.')}
export const FONTS = ${JSON.stringify(fonts)};
`,
);

// `pixels` copies the bitmap on every read, so read it once.
const mapPx = render(readFileSync(new URL('./singapore.svg', import.meta.url), 'utf8')).img.pixels;
const alpha = new Uint8Array(CARD_W * CARD_H);
for (let i = 0; i < alpha.length; i++) alpha[i] = mapPx[i * 4 + 3];

// The app logo, clipped to a rounded square, as straight RGBA.
const logoSvg = readFileSync(new URL('../../public/logo.svg', import.meta.url), 'utf8')
  .replace(/<svg([^>]*)width="512" height="512"/, `<svg$1width="${LOGO_SIZE}" height="${LOGO_SIZE}"`)
  .replace('</defs>', '<clipPath id="card-round"><rect width="512" height="512" rx="112"/></clipPath></defs><g clip-path="url(#card-round)">')
  .replace(/<\/svg>\s*$/, '</g></svg>');
const logo = render(logoSvg).img;

writeFileSync(
  new URL('../../tgcloud/lib/card/art.js', import.meta.url),
  `${header('Island silhouette mask at card size, from URA Master Plan 2019 subzone boundaries (data.gov.sg), and the app logo (public/logo.svg) as RGBA.')}
export const MAP_MASK = ${JSON.stringify({ w: CARD_W, h: CARD_H, data: Buffer.from(rle(alpha)).toString('base64') })};
export const LOGO = ${JSON.stringify({ w: logo.width, h: logo.height, data: Buffer.from(logo.pixels).toString('base64') })};
`,
);
console.log('glyphs.js and art.js written');
