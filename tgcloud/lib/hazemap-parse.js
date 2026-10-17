// @ts-check
// NEA's regional haze map, as haze.gov.sg draws it: fire hotspots, dense and moderate haze areas,
// the wind picture at 2,500 ft (~760 m), and its two daily texts. Pure (no sdk) so tests and the Mini App can
// load it; lib/hazemap.js fetches it. None of this is a documented API (the homepage embeds the
// KML links in a script), so nothing here may throw.

import { decodeEntities } from './html.js';
import { MONTHS, sgtDateOf, toSgtIso } from './time.js';

export const HAZE_HOME = 'https://www.haze.gov.sg/';

/** What the Mini App's map shows: Sumatra, Borneo's west and Java around Singapore. */
export const MAP_BOUNDS = { west: 95, east: 120, south: -10, north: 8 };
/** SVG units per degree: the map is drawn 400 × 288 (equirectangular, fine this near the equator). */
export const MAP_SCALE = 16;
export const MAP_WIDTH = (MAP_BOUNDS.east - MAP_BOUNDS.west) * MAP_SCALE;
export const MAP_HEIGHT = (MAP_BOUNDS.north - MAP_BOUNDS.south) * MAP_SCALE;

/** lon, lat → SVG x, y on the map, to 0.1 unit. Shared by the map and its land asset's generator. */
export const project = (/** @type {number} */ lon, /** @type {number} */ lat) => [
  Math.round((lon - MAP_BOUNDS.west) * MAP_SCALE * 10) / 10,
  Math.round((MAP_BOUNDS.north - lat) * MAP_SCALE * 10) / 10,
];

// Hotspots are snapped to this grid (degrees): 5,000 fires stay a few hundred dots.
const BIN = 0.25;
// Haze outlines keep 2 decimals (~1 km) and drop points closer than this to the last one kept.
const MIN_STEP = 0.05;

/**
 * `hotspots.dots` is flat [lon, lat, count, …], each a 0.25° cell's centre, inside MAP_BOUNDS only;
 * `total` and `regions` (NEA's names, e.g. Sumatra) count every hotspot in NEA's file. Each haze area
 * is a list of rings, each flat [lon, lat, …]. `wind` is NEA's picture and the box it covers.
 * Dates are SGT; `updatedAt` is when NEA last updated its two texts.
 * @typedef {{ date: string | null, total: number, regions: Record<string, number>, dots: number[] }} Hotspots
 * @typedef {number[][]} Area
 * @typedef {{ image: string, box: { west: number, east: number, south: number, north: number }, date: string | null }} Wind
 * @typedef {{
 *   hotspots: Hotspots | null,
 *   haze: { dense: Area[], moderate: Area[], date: string | null } | null,
 *   wind: Wind | null,
 *   situation: string | null,
 *   outlook: string | null,
 *   updatedAt: string | null,
 * }} HazeMap
 */

/** HTML → plain text, keeping paragraph breaks as "\n\n". @param {string} html */
function plain(html) {
  return decodeEntities(html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, ' '))
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n');
}

/** "_20261017_105929" in a file name → "2026-10-17"; null if there's none. @param {string} url */
export function fileDate(url) {
  const m = url.match(/_(20\d\d)(\d\d)(\d\d)_\d{6}/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/**
 * "10:59 AM 17 October" (no year) → SGT ISO, in the latest year that isn't after `now`. Null if unreadable.
 * @param {string} s @param {number} now ms
 */
export function parseUpdated(s, now) {
  const m = s.match(/(\d{1,2}):(\d\d)\s*([AP])\.?M\.?\s+(\d{1,2})\s+([A-Za-z]{3,9})(?:\s+(\d{4}))?/i);
  const month = m ? MONTHS.findIndex((x) => x.toLowerCase() === m[5].slice(0, 3).toLowerCase()) : -1;
  if (!m || month < 0) return null;
  const hour = (Number(m[1]) % 12) + (m[3].toUpperCase() === 'P' ? 12 : 0);
  const at = (/** @type {number} */ year) => Date.UTC(year, month, Number(m[4]), hour - 8, Number(m[2])) / 1000;
  if (m[6]) return toSgtIso(at(Number(m[6])));
  // NEA's update is never ahead of now (a day's slack for clocks), so the latest year that isn't.
  const thisYear = Number(sgtDateOf(now).slice(0, 4));
  const best = [thisYear - 1, thisYear].map(at).filter((t) => t * 1000 <= now + 86_400_000).at(-1);
  return best !== undefined && Number.isFinite(best) ? toSgtIso(best) : null;
}

/**
 * The homepage's KML links, wind picture and two texts. Anything missing is null.
 * @param {unknown} html @param {number} [now] ms, to place "Updated on" (which has no year)
 */
export function parseHome(html, now = Date.now()) {
  const page = typeof html === 'string' ? html : '';
  const urls = [...page.matchAll(/["'](https?:\/\/[^"'\s]+?\.(?:kml|png)(?:\?[^"'\s]*)?)["']/gi)].map((m) => decodeEntities(m[1]));
  const find = (/** @type {RegExp} */ re) => urls.find((u) => re.test(u)) ?? null;
  /** The text under one heading, up to its "Updated on" line. @param {string} title */
  const block = (title) => {
    const m = page.match(new RegExp(`<h3[^>]*>\\s*${title}\\s*</h3>([\\s\\S]*?)(?:<span[^>]*>\\s*(Updated on[^<]*)</span>|<h3)`, 'i'));
    return m ? { text: plain(m[1]) || null, updated: m[2] ? parseUpdated(m[2], now) : null } : { text: null, updated: null };
  };
  const situation = block('Latest Weather and Haze Situation');
  const outlook = block('Weather and Haze Outlook');
  return {
    hotspotsUrl: find(/haze_hotspots\/[^/]+\.kml/i),
    hazeUrl: find(/hazeboundaries\/[^/]+\.kml/i),
    windUrl: find(/haze_wind\/[^/]+\.kml/i),
    situation: situation.text,
    outlook: outlook.text,
    updatedAt: [situation.updated, outlook.updated].filter(Boolean).sort().at(-1) ?? null,
  };
}

/** "lon,lat[,alt] lon,lat …" → [lon, lat, …]; pairs that aren't numbers are skipped. @param {string} s */
function coords(s) {
  /** @type {number[]} */
  const out = [];
  for (const t of s.trim().split(/\s+/)) {
    const [lon, lat] = t.split(',').map(Number);
    if (Number.isFinite(lon) && Number.isFinite(lat) && Math.abs(lon) <= 180 && Math.abs(lat) <= 90) out.push(lon, lat);
  }
  return out;
}

/** NEA's placemarks, or null if `kml` isn't KML. @param {unknown} kml */
function placemarks(kml) {
  return typeof kml === 'string' && /<kml/i.test(kml) ? [...kml.matchAll(/<Placemark\b[\s\S]*?<\/Placemark>/gi)].map((m) => m[0]) : null;
}

const inBounds = (/** @type {number} */ lon, /** @type {number} */ lat) =>
  lon >= MAP_BOUNDS.west && lon <= MAP_BOUNDS.east && lat >= MAP_BOUNDS.south && lat <= MAP_BOUNDS.north;

/**
 * NEA's hotspot KML → counts, and dots binned to 0.25° inside MAP_BOUNDS. Null if it isn't one.
 * @param {unknown} kml @param {string | null} [date] from the file name
 * @returns {Hotspots | null}
 */
export function parseHotspots(kml, date = null) {
  const pms = placemarks(kml);
  if (!pms) return null;
  /** @type {Map<string, number[]>} cell → [lon, lat, count], at the cell's centre */
  const cells = new Map();
  /** @type {Record<string, number>} */
  const regions = {};
  let total = 0;
  for (const pm of pms) {
    const point = pm.match(/<Point\b[\s\S]*?<coordinates>([^<]*)<\/coordinates>/i);
    const [lon, lat] = point ? coords(point[1]) : [];
    if (lon === undefined) continue;
    total++;
    const region = pm.match(/<SimpleData name="region">([^<]*)<\/SimpleData>/i)?.[1].trim().replace(/_/g, ' ');
    if (region) regions[region] = (regions[region] ?? 0) + 1;
    if (!inBounds(lon, lat)) continue;
    const cx = Math.floor(lon / BIN);
    const cy = Math.floor(lat / BIN);
    const cell = cells.get(`${cx},${cy}`);
    if (cell) cell[2]++;
    else cells.set(`${cx},${cy}`, [(cx + 0.5) * BIN, (cy + 0.5) * BIN, 1]);
  }
  return { date, total, regions, dots: [...cells.values()].flat() };
}

/** Whether a ring's bounding box touches MAP_BOUNDS. @param {number[]} flat */
function overlapsMap(flat) {
  let [w, e, s, n] = [Infinity, -Infinity, Infinity, -Infinity];
  for (let i = 0; i < flat.length; i += 2) {
    w = Math.min(w, flat[i]);
    e = Math.max(e, flat[i]);
    s = Math.min(s, flat[i + 1]);
    n = Math.max(n, flat[i + 1]);
  }
  return e >= MAP_BOUNDS.west && w <= MAP_BOUNDS.east && n >= MAP_BOUNDS.south && s <= MAP_BOUNDS.north;
}

/** A ring, rounded and thinned; null if fewer than 3 points are left. @param {number[]} flat */
function thin(flat) {
  /** @type {number[]} */
  const out = [];
  for (let i = 0; i < flat.length; i += 2) {
    const lon = Math.round(flat[i] * 100) / 100;
    const lat = Math.round(flat[i + 1] * 100) / 100;
    const n = out.length;
    const last = i + 2 >= flat.length;
    if (n && !last && Math.hypot(lon - out[n - 2], lat - out[n - 1]) < MIN_STEP) continue;
    out.push(lon, lat);
  }
  return out.length >= 6 ? out : null;
}

/**
 * NEA's haze boundaries KML → dense and moderate areas (all of them; the map clips). Null if it isn't one.
 * @param {unknown} kml @param {string | null} [date] from the file name
 */
export function parseHaze(kml, date = null) {
  const pms = placemarks(kml);
  if (!pms) return null;
  /** @type {{ dense: Area[], moderate: Area[], date: string | null }} */
  const haze = { dense: [], moderate: [], date };
  for (const pm of pms) {
    // NEA names them "Dense Haze" / "Moderate Haze" and styles them #denHaze / #modHaze.
    const name = pm.match(/<name>([^<]*)/i)?.[1] ?? '';
    const style = pm.match(/<styleUrl>\s*#?([^<\s]*)/i)?.[1] ?? '';
    const kind = /\bdense\b/i.test(name) || /^den/i.test(style) ? 'dense' : /\bmoderate\b/i.test(name) || /^mod/i.test(style) ? 'moderate' : null;
    if (!kind) continue;
    for (const [poly] of pm.matchAll(/<Polygon\b[\s\S]*?<\/Polygon>/gi)) {
      const rings = [...poly.matchAll(/<coordinates>([^<]*)<\/coordinates>/gi)].map((m) => thin(coords(m[1]))).filter((r) => r !== null);
      // Areas wholly off the map (Papua, the Mekong) would only be clipped away.
      if (rings.length && overlapsMap(rings[0])) haze[kind].push(rings);
    }
  }
  return haze;
}

/**
 * NEA's wind KML → its picture (resolved against the KML's address) and the box it covers. Null if unreadable.
 * @param {unknown} kml @param {string} url the KML's own address
 * @returns {Wind | null}
 */
export function parseWind(kml, url) {
  if (typeof kml !== 'string') return null;
  const href = kml.match(/<Icon\b[\s\S]*?<href>\s*([^<\s]+)\s*<\/href>/i)?.[1];
  /** @param {string} side */
  const edge = (side) => Number(kml.match(new RegExp(`<${side}>\\s*([-\\d.]+)\\s*</${side}>`, 'i'))?.[1]);
  const box = { west: edge('west'), east: edge('east'), south: edge('south'), north: edge('north') };
  if (!href || !Object.values(box).every(Number.isFinite) || box.west >= box.east || box.south >= box.north) return null;
  let image;
  try {
    image = new URL(decodeEntities(href), url).href;
  } catch {
    return null;
  }
  if (!/^https:\/\//.test(image)) return null;
  return { image, box, date: fileDate(image) ?? fileDate(url) };
}

