// @ts-check
// endpoints/tick.js — the 15-minute job. Run by .github/workflows/tick.yml:
//   npx tgcloud run endpoints/tick            ('{"force":true}' refetches NEA and news regardless)
// (Telegram Serverless has no built-in scheduler.) NEA and news are fetched about once an hour
// (news every run while there's haze); the extra runs are for alerts a previous run didn't reach.
// News comes before alerts, so breaking news from it goes out in the same run (breaking news gets
// its own slice of the alert budget, after the fetch). The budget counts from the start, so NEA and
// news are fetched side by side; news not due by the stored snapshot is checked again by the new one.

import { runAlerts } from '../lib/alerts.js';
import { updateBreaking } from '../lib/breaking.js';
import { requireCli } from '../lib/cli-only.js';
import { refreshNews, refreshNewsIfDue } from '../lib/news.js';
import { refreshNea, refreshNeaIfNewHour, storedSnapshot } from '../lib/refresh.js';

export default async function (input, ctx) {
  requireCli(ctx);
  const started = Date.now();
  const force = Boolean(input?.force);
  const stored = await storedSnapshot();
  let [snap, news] = await Promise.all([
    force ? refreshNea() : refreshNeaIfNewHour(stored, started),
    force ? refreshNews() : refreshNewsIfDue(stored),
  ]);
  if ('skipped' in news) news = await refreshNewsIfDue(snap);
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
