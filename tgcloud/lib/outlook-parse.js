// @ts-check
// NEA's 24-hr PSI forecast from its daily haze situation update, issued about 6 pm SGT during
// haze episodes only. Pure (no sdk) so tests and the Mini App can load it; lib/outlook.js fetches it.
// The feed is the JSON haze.gov.sg itself uses, not a documented API, so nothing here may throw.

import { PSI_BANDS } from './psi.js';
import { sgtToday } from './time.js';

// The last path segment only busts caches; any value works.
export const OUTLOOK_FEED = 'https://www.nea.gov.sg/api/advisory/latesthazesituationupdate';

/** @typedef {{ text: string, from: string, to: string, forDate: string, issuedAt: string }} Outlook */

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** HTML → plain text with the entities NEA uses. @param {unknown} html */
function plain(html) {
  if (typeof html !== 'string') return '';
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(Number(c)))
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
  const month = m ? MONTHS.indexOf(m[2].toLowerCase()) : -1;
  return m && month >= 0 ? `${m[3]}-${String(month + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
}

/**
 * The forecast in NEA's words, mapped to our band ids. Null when there's none we can read, or
 * it's for a day that has passed (`now` decides "today", in SGT). Never throws.
 * @param {any} json
 * @param {number} [now] ms
 * @returns {Outlook | null}
 */
export function parseOutlook(json, now = Date.now()) {
  const expiry = Date.parse(json?.ExpiryDateHazeDisplayDt ?? '');
  if (Number.isFinite(expiry) && expiry < now) return null;
  const body = plain(json?.BodyText);
  const day = body.match(/forecast for (\d{1,2} [A-Za-z]{3,9} \d{4})/i);
  const forDate = day ? isoDate(day[1]) : null;
  if (!forDate || forDate < sgtToday(now)) return null;
  // The short line first; the sentence in the body if NEA changes it.
  const text = (
    plain(json?.AirQualityBlurb).match(/24-hr PSI Forecast:\s*(.+)$/i)?.[1] ??
    body.match(/forecast for [^.]*? is (.+?)\./i)?.[1] ??
    ''
  ).trim();
  const parts = text.split(/\s+(?:to|–|-)\s+/i);
  const from = bandId(parts[0] ?? '');
  const to = bandId(parts.at(-1) ?? '');
  const issuedAt = typeof json?.DateOfArticle === 'string' && Number.isFinite(Date.parse(json.DateOfArticle)) ? json.DateOfArticle : '';
  if (!from || !to || parts.length > 2 || !issuedAt) return null;
  return { text, from, to, forDate, issuedAt };
}
