// @ts-check
// endpoints/getDashboard.js — everything the Mini App renders, in one call.
// The platform verifies init data before this runs, so only Telegram users reach it.

import { getAhead, peekAhead } from '../lib/ahead.js';
import { hazeGateOpen } from '../lib/breaking-rules.js';
import { getNews } from '../lib/news.js';
import { getSnapshot, peekSnapshot } from '../lib/refresh.js';
import { allSourceStatus, recentReadings } from '../lib/store.js';

const HISTORY_HOURS = 8 * 24;

/**
 * The Mini App calls this twice when NEA is due: first without `refresh`, which answers from what's
 * stored (a few DB reads) and says `refreshDue`, then with `refresh: true`, which refetches NEA's
 * readings and, during haze, its forecast (each up to ~5 s) and waits for them. The runtime had no
 * timers to cut a slow fetch short, and stops work left running after a response (both probed with
 * `tgcloud run`, Oct 2026), so the wait can't hide in one call.
 * @param {{ refresh?: boolean }} input
 */
export default async function ({ refresh = false } = {}) {
  const latest = refresh ? refetchNow() : fromStore();
  const [{ snap, ahead, refreshDue }, history, sources, news] = await Promise.all([
    latest,
    // 7 days, plus a day so the chart can draw 24h rolling averages across all of them.
    latest.then(() => recentReadings(HISTORY_HOURS)),
    allSourceStatus(),
    getNews(),
  ]);
  const { history: _recent, ...snapshot } = snap;
  return {
    snapshot,
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
    refreshDue,
    serverTime: Date.now(),
  };
}

/** NEA issues its forecast only during haze episodes, so it's worth a second call only then. */
async function fromStore() {
  const [{ snap, due }, { ahead, due: outlookDue }] = await Promise.all([peekSnapshot(), peekAhead()]);
  return { snap, ahead, refreshDue: due || (outlookDue && hazeGateOpen(snap)) };
}

async function refetchNow() {
  const refreshed = getSnapshot();
  const [snap, ahead] = await Promise.all([refreshed, getAhead(refreshed)]);
  return { snap, ahead };
}
