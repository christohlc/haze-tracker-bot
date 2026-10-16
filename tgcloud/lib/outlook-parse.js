// @ts-check
// NEA's 24-hr PSI forecast from its daily haze situation update, issued about 6 pm SGT during
// haze episodes only. Pure (no sdk) so tests and the Mini App can load it; lib/outlook.js fetches it.
// The feed is the JSON haze.gov.sg itself uses, not a documented API, so nothing here may throw.

import { decodeEntities } from './html.js';
import { PSI_BANDS } from './psi.js';
import { MONTHS, sgtDateOf, toSgtIso } from './time.js';

export const OUTLOOK_FEED = 'https://www.nea.gov.sg/api/advisory/latesthazesituationupdate';

/**
 * NEA's words, our band ids, the SGT date it's for, and when it was issued and stops showing
 * (SGT timestamps; `expires` is null when NEA set none).
 * @typedef {{ text: string, from: string, to: string, forDate: string, issuedAt: string, expires: string | null }} Outlook
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
  // The short line first; the sentence in the body if NEA changes it.
  const text = (
    plain(json?.AirQualityBlurb).match(/24-hr PSI Forecast:\s*(.+)$/i)?.[1] ??
    body.match(/forecast for [^.]*? is (.+?)\./i)?.[1] ??
    ''
  ).trim();
  const parts = text.split(/\s+(?:to|–|-)\s+/i);
  const from = bandId(parts[0] ?? '');
  const to = bandId(parts.at(-1) ?? '');
  const issuedAt = sgtIso(json?.DateOfArticle);
  // NEA fills one or the other; the site hides the box after it.
  const expires = sgtIso(json?.ExpiryDateHazeDisplayDt) ?? sgtIso(json?.ExpiryDateHazeDisplay);
  if (!forDate || !from || !to || parts.length > 2 || !issuedAt) return null;
  return { text, from, to, forDate, issuedAt, expires };
}
