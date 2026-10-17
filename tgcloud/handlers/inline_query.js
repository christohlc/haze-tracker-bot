// @ts-check
// @bot in any chat: share the haze picture or a text summary (lib/inline-rules.js).
// Inline mode is switched on in BotFather (/setinline).

import { api } from 'sdk';
import { cachedCardId } from '../lib/card/send.js';
import { groupDashboardUrl } from '../lib/chat-rules.js';
import { botInfo } from '../lib/groups.js';
import { INLINE_CACHE_S, inlineResults, regionFromQuery } from '../lib/inline-rules.js';
import { storedSnapshot } from '../lib/refresh.js';

export default async function (query) {
  // The stored snapshot, not a refetch: an inline answer has to be quick, and the tick keeps it fresh.
  const snap = await storedSnapshot();
  if (!snap) return api.answerInlineQuery({ inline_query_id: query.id, results: [], cache_time: 60 });
  // No picture uploaded for this hour yet: the text alone (an inline answer can't upload one).
  const [fileId, bot] = await Promise.all([cachedCardId(snap).catch(() => null), botInfo()]);
  const reply_markup = bot?.username ? { inline_keyboard: [[{ text: '📊 Open dashboard', url: groupDashboardUrl(bot) }]] } : undefined;
  await api.answerInlineQuery({
    inline_query_id: query.id,
    results: inlineResults(snap, { fileId, region: regionFromQuery(query.query), reply_markup }),
    cache_time: INLINE_CACHE_S,
  });
}
