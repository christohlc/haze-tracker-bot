// @ts-check
// endpoints/tick.js — the 15-minute job. Run by .github/workflows/tick.yml:
//   npx tgcloud run endpoints/tick            ('{"force":true}' refetches NEA and news regardless)
// (Telegram Serverless has no built-in scheduler.) NEA and news are fetched about once an hour;
// the extra runs are for alerts a previous run didn't reach.

import { runAlerts } from '../lib/alerts.js';
import { requireCli } from '../lib/cli-only.js';
import { refreshNews, refreshNewsIfDue } from '../lib/news.js';
import { refreshNea, refreshNeaIfNewHour } from '../lib/refresh.js';

export default async function (input, ctx) {
  requireCli(ctx);
  const started = Date.now();
  const force = Boolean(input?.force);
  const snap = await (force ? refreshNea() : refreshNeaIfNewHour(started));
  const [alerts, news] = await Promise.all([
    runAlerts(snap, started),
    force ? refreshNews() : refreshNewsIfDue(),
  ]);
  return {
    asOf: snap.asOf,
    psi3h: snap.worst.psi3h,
    alerts,
    news: news.error ? `failed: ${news.error}` : 'skipped' in news ? 'not due' : news.count,
    ms: Date.now() - started,
  };
}
