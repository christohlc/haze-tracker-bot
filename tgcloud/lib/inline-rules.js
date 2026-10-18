// @ts-check
// Inline mode: typing @bot in any chat offers the haze picture and a text summary. Pure.

import { REGIONS } from './config.js';
import { bandWords, formatHaze, formatShareCaption } from './format.js';
import { psiBand } from './psi.js';
import { readingsFor } from './snapshot.js';

/** How long Telegram may reuse an answer, in seconds: NEA's readings change hourly. */
export const INLINE_CACHE_S = 300;

/** "west" or "West" → 'west'; anything else → null (the highest region). @param {string | undefined} q */
export function regionFromQuery(q) {
  const t = (q ?? '').trim().toLowerCase();
  return REGIONS.find((r) => r.id === t || r.name.toLowerCase() === t)?.id ?? null;
}

/**
 * The results for an inline query: the summary card when Telegram has it (by file id), and
 * always the text summary, which leads with `region` if one was typed.
 * @param {any} snap @param {{ fileId: string | null, region: string | null, reply_markup?: any }} o
 */
export function inlineResults(snap, { fileId, region, reply_markup }) {
  // NEA's 24-hr PSI, as the card and caption give it: the typed region's, else each band and where.
  const area = readingsFor(snap, region).area;
  const band = psiBand(area?.psi24h);
  const title = area
    ? `${area.name}: 24-hr PSI ${area.psi24h == null ? 'no reading' : `${Math.round(area.psi24h)} · ${band?.label}`}`
    : 'Singapore haze update';
  const description = `${area ? 'NEA’s reading' : bandWords(snap, 'psi24h')}. Tap to send.`;
  const extra = reply_markup ? { reply_markup } : {};
  /** @type {any[]} */
  const results = [];
  if (fileId && !region) {
    results.push({ type: 'photo', id: `card:${snap.asOf}`, photo_file_id: fileId, caption: formatShareCaption(snap), parse_mode: 'HTML', ...extra });
  }
  results.push({
    type: 'article',
    id: `text:${region ?? 'all'}:${snap.asOf}`,
    title,
    description,
    input_message_content: { message_text: formatHaze(snap, null, { region }), parse_mode: 'HTML', link_preview_options: { is_disabled: true } },
    ...extra,
  });
  return results;
}
