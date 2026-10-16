// @ts-check
// endpoints/tick.js — the 15-minute job. Run by .github/workflows/tick.yml:
//   npx tgcloud run endpoints/tick            ('{"force":true}' refetches NEA and news regardless)
// (Telegram Serverless has no built-in scheduler.) NEA and news are fetched about once an hour
// (news every run while there's haze); the extra runs are for alerts a previous run didn't reach.
// News comes before alerts, so breaking news from it goes out in the same run (breaking news gets
// its own slice of the alert budget, after the fetch).

import { runAlerts } from '../lib/alerts.js';
import { updateBreaking } from '../lib/breaking.js';
import { requireCli } from '../lib/cli-only.js';
import { refreshNews, refreshNewsIfDue } from '../lib/news.js';
import { refreshNea, refreshNeaIfNewHour } from '../lib/refresh.js';

export default async function (input, ctx) {
  requireCli(ctx);
  const started = Date.now();
  const force = Boolean(input?.force);
  const snap = await (force ? refreshNea() : refreshNeaIfNewHour(started));
  const news = await (force ? refreshNews() : refreshNewsIfDue(snap));
  const breaking = await updateBreaking(snap, news.fresh, started);
  const alerts = await runAlerts(snap, started, breaking.toSend);
  return {
    asOf: snap.asOf,
    psi3h: snap.worst.psi3h,
    breaking: breaking.added.length ? breaking.added : null,
    alerts,
    news: news.error ? `failed: ${news.error}` : 'skipped' in news ? 'not due' : news.count,
    ms: Date.now() - started,
  };
}
