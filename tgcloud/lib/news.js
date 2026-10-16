// @ts-check
// Fetch haze headlines from ST, CNA and Mothership about hourly (every tick while there's haze,
// for breaking news) and keep them in state('news').
// Stories are merged into the stored list, so ones that drop out of a short feed
// (Mothership only lists its last 10 posts) stay for 14 days.

import { hazeGateOpen } from './breaking-rules.js';
import { mergeNews, parseFeed, PUBLISHERS } from './news-parse.js';
import { errorText, getText } from './http.js';
import { getState, recordSource, setState } from './store.js';

/** @param {keyof typeof PUBLISHERS} source */
async function fetchFeed(source) {
  const items = parseFeed(await getText(PUBLISHERS[source].feed), source);
  if (!items.length) throw new Error('Feed had no stories we could read');
  return items;
}

/**
 * Fetch every feed, record each one's health, and store the merged list. Never throws.
 * `fresh` is every story just fetched, with its description, for picking breaking news.
 */
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
    const fresh = feeds.flatMap((f) => f.items);
    const items = mergeNews(prev ?? [], fresh, Date.now());
    await setState('news', { items });
    return { count: items.length, error: null, fresh };
  } catch (e) {
    return { count: null, error: errorText(e), fresh: [] };
  }
}

const NEWS_EVERY_S = 55 * 60;
/** While there's haze, every tick, so breaking news goes out within about 15 minutes. */
const HAZE_NEWS_EVERY_S = 10 * 60;

/** For the tick (every 15 min): refetch the feeds about once an hour, or every tick in haze. @param {any} snap */
export async function refreshNewsIfDue(snap) {
  const updatedAt = (await getState('news'))?.updatedAt ?? 0;
  const every = hazeGateOpen(snap) ? HAZE_NEWS_EVERY_S : NEWS_EVERY_S;
  if (Date.now() / 1000 - updatedAt < every) return { count: null, error: null, fresh: [], skipped: true };
  return refreshNews();
}

/** Stored haze headlines, or null before the first tick has fetched them. */
export async function getNews() {
  return (await getState('news'))?.value?.items ?? null;
}
