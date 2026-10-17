// @ts-check
// Inline mode: typing @bot in any chat offers the haze picture and a text summary. Pure.

import { REGIONS } from './config.js';
import { formatHaze, formatShareCaption } from './format.js';
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
  const r = readingsFor(snap, region);
  const psi = r.psi3h?.value ?? null;
  const band = psiBand(psi);
  const where = r.area?.name ?? (r.psi3h ? `highest, ${r.psi3h.name}` : 'Singapore');
  const extra = reply_markup ? { reply_markup } : {};
  /** @type {any[]} */
  const results = [];
  if (fileId && !region) {
    results.push({ type: 'photo', id: `card:${snap.asOf}`, photo_file_id: fileId, caption: formatShareCaption(snap), parse_mode: 'HTML', ...extra });
  }
  results.push({
    type: 'article',
    id: `text:${region ?? 'all'}:${snap.asOf}`,
    title: psi == null ? 'Singapore haze: no reading yet' : `PSI ${psi} · ${band?.label ?? ''}`,
    description: `Our 3-hr PSI, ${where}. Tap to send.`,
    input_message_content: { message_text: formatHaze(snap, null, { region }), parse_mode: 'HTML', link_preview_options: { is_disabled: true } },
    ...extra,
  });
  return results;
}
