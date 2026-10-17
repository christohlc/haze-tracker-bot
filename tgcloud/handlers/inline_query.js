// @ts-check
// @bot in any chat: share the haze picture or a text summary (lib/inline-rules.js).
// Inline mode is switched on in BotFather (/setinline).

import { api } from 'sdk';
import { isBadRequest } from '../lib/bot-errors.js';
import { linkDashboardButton } from '../lib/buttons.js';
import { cachedCardId } from '../lib/card/send.js';
import { INLINE_CACHE_S, inlineResults, regionFromQuery } from '../lib/inline-rules.js';
import { storedSnapshot } from '../lib/refresh.js';

export default async function (query) {
  // The stored snapshot, not a refetch: an inline answer has to be quick, and the tick keeps it fresh.
  const snap = await storedSnapshot();
  if (!snap) return api.answerInlineQuery({ inline_query_id: query.id, results: [], cache_time: 60 });
  // No picture uploaded for this hour yet: the text alone (an inline answer can't upload one).
  const [fileId, reply_markup] = await Promise.all([cachedCardId(snap).catch(() => null), linkDashboardButton()]);
  try {
    await api.answerInlineQuery({
      inline_query_id: query.id,
      results: inlineResults(snap, { fileId, region: regionFromQuery(query.query), reply_markup }),
      cache_time: INLINE_CACHE_S,
    });
  } catch (e) {
    // The query expired (about 10 s) or the user typed on: nobody is waiting for this answer.
    if (!isBadRequest(e)) throw e;
  }
}
