// @ts-check
// endpoints/tick.js — the 15-minute job. Run by .github/workflows/tick.yml:
//   npx tgcloud run endpoints/tick            ('{"force":true}' refetches NEA and news regardless)
// (Telegram Serverless has no built-in scheduler.) NEA and news are fetched about once an hour
// (news every run while there's haze); the extra runs are for alerts a previous run didn't reach.
// News comes before alerts, so breaking news from it goes out in the same run (breaking news gets
// its own slice of the alert budget, after the fetch). NEA and news are fetched side by side, since
// the alert budget counts from the start: whether news is due goes by the stored snapshot, and if
// this run's NEA brings the haze that makes it due every tick, it's fetched after.

import { runAlerts } from '../lib/alerts.js';
import { updateBreaking } from '../lib/breaking.js';
import { requireCli } from '../lib/cli-only.js';
import { refreshNews, refreshNewsIfDue } from '../lib/news.js';
import { refreshNea, refreshNeaIfNewHour } from '../lib/refresh.js';
import { getState } from '../lib/store.js';

export default async function (input, ctx) {
  requireCli(ctx);
  const started = Date.now();
  const force = Boolean(input?.force);
  const [snap, early] = await Promise.all([
    force ? refreshNea() : refreshNeaIfNewHour(started),
    force ? refreshNews() : getState('snapshot').then((s) => refreshNewsIfDue(s?.value)),
  ]);
  const news = 'skipped' in early ? await refreshNewsIfDue(snap) : early;
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
