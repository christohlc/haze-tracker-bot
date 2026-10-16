// @ts-check
// endpoints/getDashboard.js — everything the Mini App renders, in one call.
// The platform verifies init data before this runs, so only Telegram users reach it.

import { getForecast } from '../lib/forecast/run.js';
import { getSnapshot } from '../lib/refresh.js';
import { allSourceStatus, recentReadings } from '../lib/store.js';

export default async function () {
  const { history: _recent, ...snapshot } = await getSnapshot();
  const [history, sources, forecast] = await Promise.all([recentReadings(48), allSourceStatus(), getForecast()]);
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
    // Only show a forecast issued from the same NEA hour the page is showing.
    forecast: forecast?.issuedAt === snapshot.asOf ? forecast : null,
    serverTime: Date.now(),
  };
}
