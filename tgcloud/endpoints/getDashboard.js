// @ts-check
// endpoints/getDashboard.js — everything the Mini App renders, in one call.
// The platform verifies init data before this runs, so only Telegram users reach it.

import { getAhead } from '../lib/ahead.js';
import { getNews } from '../lib/news.js';
import { getSnapshot } from '../lib/refresh.js';
import { allSourceStatus, recentReadings } from '../lib/store.js';

export default async function () {
  const refreshed = getSnapshot();
  const [{ history: _recent, ...snapshot }, ahead, history, sources, news] = await Promise.all([
    refreshed,
    getAhead(refreshed),
    refreshed.then(() => recentReadings(48)),
    allSourceStatus(),
    getNews(),
  ]);
  return {
    snapshot,
    // 48h so the chart can draw 24h rolling averages across the whole past day.
    history: history.map((h) => ({ t: h.timestamp, ...h.readings })),
    sources: sources.map((s) => ({
      source: s.source,
      lastOkAt: s.lastOkAt,
      lastErrorAt: s.lastErrorAt,
      lastError: s.lastErrorAt && (!s.lastOkAt || s.lastErrorAt > s.lastOkAt) ? s.lastError : null,
      detail: s.detail,
    })),
    ahead,
    news,
    serverTime: Date.now(),
  };
}
