// @ts-check
// NEA's 24-hr PSI forecast from its daily haze situation update, issued about 6 pm SGT during
// haze episodes only. Pure (no sdk) so tests and the Mini App can load it; lib/outlook.js fetches it.
// The feed is the JSON haze.gov.sg itself uses, not a documented API, so nothing here may throw.

import { decodeEntities } from './html.js';
import { bandRanges, PSI_BANDS, psiBand } from './psi.js';
import { MONTHS, sgtDateOf, toSgtIso } from './time.js';

export const OUTLOOK_FEED = 'https://www.nea.gov.sg/api/advisory/latesthazesituationupdate';

/**
 * NEA's words, our band ids, NEA's PSI numbers when it gives them (since 16 Oct 2026, "150 - 230
 * Unhealthy to Very Unhealthy"; null before), the SGT date it's for, and when it was issued and
 * stops showing (SGT timestamps; `expires` is null when NEA set none).
 * @typedef {{ text: string, from: string, to: string, psi: { lo: number, hi: number } | null, forDate: string, issuedAt: string, expires: string | null }} Outlook
 */

/** HTML → plain text. @param {unknown} html */
function plain(html) {
  if (typeof html !== 'string') return '';
  return decodeEntities(html.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

/** "Low Very Unhealthy" → 'very_unhealthy'; null if it isn't a band. @param {string} words */
function bandId(words) {
  const core = words.replace(/^(low|mid|high)\s+/i, '').trim().toLowerCase();
  return PSI_BANDS.find((b) => b.label.toLowerCase() === core)?.id ?? null;
}

/** "16 Oct 2026" → "2026-10-16"; null if unreadable. @param {string} s */
function isoDate(s) {
  const m = s.match(/^(\d{1,2}) ([a-z]{3})[a-z]* (\d{4})$/i);
  const month = m ? MONTHS.findIndex((x) => x.toLowerCase() === m[2].toLowerCase()) : -1;
  return m && month >= 0 ? `${m[3]}-${String(month + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
}

/** Any parseable timestamp → SGT ISO; null if it isn't one. @param {unknown} v */
function sgtIso(v) {
  const ms = typeof v === 'string' && v ? Date.parse(v) : NaN;
  return Number.isFinite(ms) ? toSgtIso(Math.floor(ms / 1000)) : null;
}

/** "Unhealthy to Low Very Unhealthy" → its one or two band phrases. @param {string} text */
const splitBands = (text) => text.split(/\s+(?:to|–|-)\s+/i);

/**
 * Whether a forecast still applies at `now`: for today or tomorrow (SGT), and not expired.
 * @param {Outlook} o @param {number} [now] ms
 */
export function isCurrent(o, now = Date.now()) {
  return o.forDate >= sgtDateOf(now) && o.forDate <= sgtDateOf(now + 86_400_000) && !(o.expires && Date.parse(o.expires) < now);
}

/**
 * The forecast in NEA's words, mapped to our band ids. Null when there's none we can read. Whether
 * it still applies is isCurrent's call, made when it's read. Never throws.
 * @param {any} json
 * @returns {Outlook | null}
 */
export function parseOutlook(json) {
  const body = plain(json?.BodyText);
  const day = body.match(/forecast for (\d{1,2} [A-Za-z]{3,9} \d{4})/i);
  const forDate = day ? isoDate(day[1]) : null;
  // The short line first; the sentence in the body if that's missing or unreadable.
  const forecast =
    readForecast(plain(json?.AirQualityBlurb).match(/(?:24-hr )?PSI Forecast:\s*(.+)$/i)?.[1]) ??
    readForecast(body.match(/forecast for [^.]*? is (.+?)\.(?!\d)/i)?.[1]);
  const issuedAt = sgtIso(json?.DateOfArticle);
  // NEA fills one or the other; the site hides the box after it.
  const expires = sgtIso(json?.ExpiryDateHazeDisplayDt) ?? sgtIso(json?.ExpiryDateHazeDisplay);
  if (!forDate || !forecast || !issuedAt) return null;
  return { ...forecast, forDate, issuedAt, expires };
}

/**
 * "Unhealthy to Low Very Unhealthy", "150 - 230 Unhealthy to Very Unhealthy" or "150 – 230
 * (Unhealthy to Very Unhealthy)." → its words, band ids and numbers. Numbers that don't fall in
 * the bands NEA names are dropped, keeping the words. Null if the words aren't one or two bands.
 * @param {string | undefined} line
 */
function readForecast(line) {
  // "150 - 230", "150", "150 – 230 PSI -" before the words.
  const nums = (line ?? '').trim().match(/^(\d{1,4})(?:\s*(?:-|–|to)\s*(\d{1,4}))?(?:\s*PSI)?\s*[-–:]?\s*/i);
  const text = (line ?? '')
    .trim()
    .slice(nums?.[0].length ?? 0)
    .replace(/^\(\s*|\s*\)?\s*\.?$/g, '');
  const parts = splitBands(text);
  const from = bandId(parts[0] ?? '');
  const to = bandId(parts.at(-1) ?? '');
  if (!from || !to || parts.length > 2) return null;
  const [a, b] = nums ? [Number(nums[1]), Number(nums[2] ?? nums[1])] : [NaN, NaN];
  const psi = nums ? { lo: Math.min(a, b), hi: Math.max(a, b) } : null;
  const named = [from, to];
  const fits = psi && named.includes(psiBand(psi.lo)?.id ?? '') && named.includes(psiBand(psi.hi)?.id ?? '');
  return { text, from, to, psi: fits ? psi : null };
}

/** "150–230", or "150" when it's one number. @param {{ lo: number, hi: number }} r */
export const psiRangeText = ({ lo, hi }) => (lo === hi ? `${lo}` : `${lo}–${hi}`);

/** "150–230 (Unhealthy to Very Unhealthy)", or NEA's words alone when it gave no numbers. @param {Outlook} o */
export const outlookLabel = (o) => (o.psi ? `${psiRangeText(o.psi)} (${o.text})` : o.text);

/** Where the dial ends: Hazardous runs from 301 to here. */
export const METER_MAX = 400;

/**
 * The PSI span NEA's words cover, for drawing: from the start of the first band to the end of the
 * last, narrowed to a third of a band where NEA says Low, Mid or High ("Unhealthy to Low Very
 * Unhealthy" → 101–233). NEA's forecast is in bands, so this is a picture of its words, not a
 * number to quote. Null if the words aren't bands.
 * @param {string} text NEA's words, as in Outlook.text
 * @returns {{ lo: number, hi: number } | null}
 */
export function outlookSpan(text) {
  const parts = splitBands(text);
  /** @param {string} words */
  const span = (words) => {
    const band = bandRanges(METER_MAX).find((b) => b.id === bandId(words));
    if (!band) return null;
    const third = (band.to - band.from + 1) / 3;
    const q = ['low', 'mid', 'high'].indexOf(words.trim().split(/\s+/)[0].toLowerCase());
    return q < 0 ? band : { from: Math.round(band.from + q * third), to: Math.round(band.from + (q + 1) * third - 1) };
  };
  const first = span(parts[0] ?? '');
  const last = span(parts.at(-1) ?? '');
  if (!first || !last || parts.length > 2) return null;
  // In whichever order NEA words it.
  return { lo: Math.min(first.from, last.from), hi: Math.max(first.to, last.to) };
}

/** The narrowest stretch the dial draws, so a single number never vanishes. */
const METER_MIN_SPAN = 12;

/**
 * What the dial draws for a forecast: NEA's numbers when it gave them, else the span its words
 * cover; at least METER_MIN_SPAN wide. Null if neither can be drawn.
 * @param {Outlook} o
 * @returns {{ lo: number, hi: number } | null}
 */
export function meterSpan(o) {
  const span = o.psi ?? outlookSpan(o.text);
  if (!span || span.hi - span.lo >= METER_MIN_SPAN) return span;
  const mid = (span.lo + span.hi) / 2;
  return { lo: mid - METER_MIN_SPAN / 2, hi: mid + METER_MIN_SPAN / 2 };
}
