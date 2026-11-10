// @ts-check
// @bot in any chat: share the haze update, as the picture or a text summary (lib/inline-rules.js).
// Inline mode is switched on in BotFather (/setinline).

import { api } from 'sdk';
import { isBadRequest } from '../lib/bot-errors.js';
import { linkDashboardButton } from '../lib/buttons.js';
import { cachedCardId } from '../lib/card/send.js';
import { INLINE_CACHE_S, inlineResults, regionFromQuery } from '../lib/inline-rules.js';
import { storedSnapshot } from '../lib/refresh.js';
import { RETIRED, retiredInlineResults } from '../lib/retired.js';

export default async function (query) {
  if (RETIRED) return answerInline(query, retiredInlineResults(), 3600);
  // The stored snapshot, not a refetch: an inline answer has to be quick, and the tick keeps it fresh.
  const snap = await storedSnapshot();
  // No picture uploaded for this hour yet: the text alone (an inline answer can't upload one).
  const [fileId, reply_markup] = snap ? await Promise.all([cachedCardId(snap).catch(() => null), linkDashboardButton()]) : [];
  const results = snap ? inlineResults(snap, { fileId: fileId ?? null, region: regionFromQuery(query.query), reply_markup }) : [];
  return answerInline(query, results, snap ? INLINE_CACHE_S : 60);
}

/** @param {any} query @param {any[]} results @param {number} cache_time */
async function answerInline(query, results, cache_time) {
  try {
    await api.answerInlineQuery({ inline_query_id: query.id, results, cache_time });
  } catch (e) {
    // The query expired (about 10 s) or the user typed on: nobody is waiting for this answer.
    if (!isBadRequest(e)) throw e;
  }
}
