// @ts-check
// Fetch haze headlines from ST, CNA and Mothership each tick and keep them in state('news').
// Stories are merged into the stored list, so ones that drop out of a short feed
// (Mothership only lists its last 10 posts) stay for 14 days.

import { fetch } from 'sdk';
import { mergeNews, parseFeed, PUBLISHERS } from './news-parse.js';
import { getState, recordSource, setState } from './store.js';

/** @param {unknown} e */
const errorText = (e) => (e instanceof Error ? e.message : String(e));

/** @param {keyof typeof PUBLISHERS} source */
async function fetchFeed(source) {
  const res = await fetch(PUBLISHERS[source].feed, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; HazeTrackerBot)' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const items = parseFeed(await res.text(), source);
  if (!items.length) throw new Error('Feed had no stories we could read');
  return items;
}

/** Fetch every feed, record each one's health, and store the merged list. Never throws. */
export async function refreshNews() {
  try {
    const sources = /** @type {Array<keyof typeof PUBLISHERS>} */ (Object.keys(PUBLISHERS));
    const [prev, ...feeds] = await Promise.all([
      getNews(),
      ...sources.map((s) => fetchFeed(s).then((items) => ({ items, error: null }), (e) => ({ items: [], error: errorText(e) }))),
    ]);
    await Promise.all(
      feeds.map(({ items, error }, i) =>
        recordSource(`news_${sources[i]}`, error ? { ok: false, error } : { ok: true, detail: `${items.length} stories checked` }),
      ),
    );
    const items = mergeNews(prev ?? [], feeds.flatMap((f) => f.items), Date.now());
    await setState('news', { items });
    return { count: items.length, error: null };
  } catch (e) {
    return { count: null, error: errorText(e) };
  }
}

/** Stored haze headlines, or null before the first tick has fetched them. */
export async function getNews() {
  return (await getState('news'))?.value?.items ?? null;
}
