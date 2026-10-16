// @ts-check
// Just enough PNG to encode an RGB image: the summary card. The platform has no zlib or
// CompressionStream we can count on, so this carries its own deflate (LZ77 + the fixed Huffman
// code). The card is mostly flat colour, which that compresses well.
// Pure (no SDK): tests and the Mini App use it too.

/** @typedef {{ width: number, height: number, data: Uint8Array }} RgbImage 3 bytes a pixel, rows top to bottom */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** @param {Uint8Array} bytes @param {number} [start] @param {number} [end] */
export function crc32(bytes, start = 0, end = bytes.length) {
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** @param {Uint8Array} bytes */
function adler32(bytes) {
  let a = 1;
  let b = 0;
  for (let i = 0; i < bytes.length; ) {
    const end = Math.min(i + 5552, bytes.length); // largest block that can't overflow
    for (; i < end; i++) {
      a += bytes[i];
      b += a;
    }
    a %= 65521;
    b %= 65521;
  }
  return ((b << 16) | a) >>> 0;
}

/** Bits out, least significant first, as deflate packs them. */
class BitWriter {
  /** @param {number} size initial capacity in bytes */
  constructor(size) {
    this.buf = new Uint8Array(Math.max(1024, size));
    this.pos = 0;
    this.acc = 0;
    this.n = 0;
  }
  /** @param {number} value @param {number} bits */
  put(value, bits) {
    this.acc |= value << this.n;
    this.n += bits;
    while (this.n >= 8) {
      if (this.pos === this.buf.length) {
        const bigger = new Uint8Array(this.buf.length * 2);
        bigger.set(this.buf);
        this.buf = bigger;
      }
      this.buf[this.pos++] = this.acc & 0xff;
      this.acc >>>= 8;
      this.n -= 8;
    }
  }
  bytes() {
    if (this.n) this.put(0, 8 - this.n);
    return this.buf.subarray(0, this.pos);
  }
}

// Length and distance code tables (RFC 1951 §3.2.5).
const LEN_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LEN_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];

/** Code index for a length (3–258) or distance (1–32768). @param {number[]} base @param {number} v */
function codeFor(base, v) {
  let i = base.length - 1;
  while (base[i] > v) i--;
  return i;
}
const LEN_CODE = Uint8Array.from({ length: 259 }, (_, len) => (len < 3 ? 0 : codeFor(LEN_BASE, len)));

/** `code` with its low `bits` reversed: deflate stores Huffman codes most significant bit first. */
const reverse = (/** @type {number} */ code, /** @type {number} */ bits) => {
  let r = 0;
  for (let i = 0; i < bits; i++) r = (r << 1) | ((code >>> i) & 1);
  return r;
};

// The fixed Huffman code (RFC 1951 §3.2.6), pre-reversed for the bit writer.
const SYM_BITS = Uint8Array.from({ length: 288 }, (_, s) => (s < 144 ? 8 : s < 256 ? 9 : s < 280 ? 7 : 8));
const SYM_CODE = Uint16Array.from({ length: 288 }, (_, s) =>
  reverse(s < 144 ? 0x30 + s : s < 256 ? 0x190 + s - 144 : s < 280 ? s - 256 : 0xc0 + s - 280, SYM_BITS[s]),
);
const DIST_CODE = Uint8Array.from({ length: 30 }, (_, d) => reverse(d, 5));

/** Fixed-Huffman literal/length symbol. @param {BitWriter} w @param {number} sym 0–285 */
const symbol = (w, sym) => w.put(SYM_CODE[sym], SYM_BITS[sym]);

const WINDOW = 32768;
const HASH_BITS = 15;
const MAX_CHAIN = 24;
const MAX_MATCH = 258;

/** zlib stream (deflate, one fixed-Huffman block). @param {Uint8Array} input */
export function zlibDeflate(input) {
  const w = new BitWriter(input.length / 4);
  w.put(0x78, 8);
  w.put(0x01, 8); // deflate, 32K window, no dictionary, "fastest" level hint
  w.put(1, 1); // final block
  w.put(1, 2); // fixed Huffman

  const head = new Int32Array(1 << HASH_BITS).fill(-1);
  const prev = new Int32Array(WINDOW);
  const n = input.length;
  const hashAt = (/** @type {number} */ i) => ((input[i] << 10) ^ (input[i + 1] << 5) ^ input[i + 2]) & ((1 << HASH_BITS) - 1);
  const insert = (/** @type {number} */ i) => {
    const h = hashAt(i);
    prev[i & (WINDOW - 1)] = head[h];
    head[h] = i;
  };

  let i = 0;
  while (i < n) {
    let bestLen = 0;
    let bestDist = 0;
    if (i + 3 <= n) {
      const limit = Math.min(MAX_MATCH, n - i);
      let cand = head[hashAt(i)];
      for (let chain = 0; cand >= 0 && i - cand <= WINDOW && chain < MAX_CHAIN; chain++) {
        if (input[cand + bestLen] === input[i + bestLen]) {
          let len = 0;
          while (len < limit && input[cand + len] === input[i + len]) len++;
          if (len > bestLen) {
            bestLen = len;
            bestDist = i - cand;
            if (len === limit) break;
          }
        }
        const next = prev[cand & (WINDOW - 1)];
        if (next >= cand) break; // overwritten slot from an older pass
        cand = next;
      }
    }
    if (bestLen >= 3) {
      const lc = LEN_CODE[bestLen];
      symbol(w, 257 + lc);
      if (LEN_EXTRA[lc]) w.put(bestLen - LEN_BASE[lc], LEN_EXTRA[lc]);
      const dc = codeFor(DIST_BASE, bestDist);
      w.put(DIST_CODE[dc], 5);
      if (DIST_EXTRA[dc]) w.put(bestDist - DIST_BASE[dc], DIST_EXTRA[dc]);
      const end = i + bestLen;
      for (; i < end; i++) if (i + 3 <= n) insert(i);
    } else {
      symbol(w, input[i]);
      if (i + 3 <= n) insert(i);
      i++;
    }
  }
  symbol(w, 256);
  const body = w.bytes();
  const out = new Uint8Array(body.length + 4);
  out.set(body);
  new DataView(out.buffer).setUint32(body.length, adler32(input));
  return out;
}

/** @param {string} type @param {Uint8Array} body */
function chunk(type, body) {
  const out = new Uint8Array(12 + body.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, body.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(body, 8);
  view.setUint32(8 + body.length, crc32(out, 4, 8 + body.length));
  return out;
}

/**
 * Filter each row with whichever of None, Sub or Up leaves the smallest residuals.
 * @param {RgbImage} image
 */
function filterRows({ width, height, data }) {
  const stride = width * 3;
  const out = new Uint8Array((stride + 1) * height);
  const sub = new Uint8Array(stride);
  const up = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const row = y * stride;
    let costNone = 0;
    let costSub = 0;
    let costUp = 0;
    for (let x = 0; x < stride; x++) {
      const v = data[row + x];
      sub[x] = (v - (x >= 3 ? data[row + x - 3] : 0)) & 0xff;
      up[x] = (v - (y ? data[row - stride + x] : 0)) & 0xff;
      costNone += v < 128 ? v : 256 - v;
      costSub += sub[x] < 128 ? sub[x] : 256 - sub[x];
      costUp += up[x] < 128 ? up[x] : 256 - up[x];
    }
    const at = y * (stride + 1);
    if (costUp <= costSub && costUp <= costNone) {
      out[at] = 2;
      out.set(up, at + 1);
    } else if (costSub <= costNone) {
      out[at] = 1;
      out.set(sub, at + 1);
    } else {
      out[at] = 0;
      out.set(data.subarray(row, row + stride), at + 1);
    }
  }
  return out;
}

/** @param {RgbImage} image @returns {Uint8Array} a PNG file */
export function encodePng(image) {
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, image.width);
  view.setUint32(4, image.height);
  header.set([8, 2, 0, 0, 0], 8); // 8-bit RGB, no interlace
  const parts = [
    Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', zlibDeflate(filterRows(image))),
    chunk('IEND', new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
