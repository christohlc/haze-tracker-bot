// @ts-check
// endpoints/tick.js — the 15-minute job. Run by .github/workflows/tick.yml:
//   npx tgcloud run endpoints/tick            ('{"force":true}' refetches NEA and news regardless)
// (Telegram Serverless has no built-in scheduler.) NEA is refetched every run (refreshNeaIfDue: NEA
// revises an hour's readings, and /haze or the Mini App may have fetched the new hour already),
// news about once an hour (every run while there's haze); the extra runs also send alerts a previous
// run didn't reach.
// News comes before alerts, so breaking news from it goes out in the same run (breaking news gets
// its own slice of the alert budget, after the fetch). The budget counts from the start, so NEA and
// news are fetched side by side. News not due by the stored snapshot is checked again by the new
// one, in case this run's reading starts haze (news every run).
// Then the heartbeat, and a DM to the operator about feeds that keep failing (lib/ops.js), and, beside
// it, the summary card uploaded to the operator's chat if nobody was sent this snapshot's yet, so
// inline mode has a picture every hour.

import { runAlerts } from '../lib/alerts.js';
import { updateBreaking } from '../lib/breaking.js';
import { requireCli } from '../lib/cli-only.js';
import { refreshNews, refreshNewsIfDue } from '../lib/news.js';
import { reportOps, uploadCard } from '../lib/ops.js';
import { refreshNea, refreshNeaIfDue, storedSnapshot } from '../lib/refresh.js';

export default async function (input, ctx) {
  requireCli(ctx);
  const started = Date.now();
  const force = Boolean(input?.force);
  const stored = await storedSnapshot();
  let [snap, firstNews] = await Promise.all([
    force ? refreshNea() : refreshNeaIfDue({ now: started }),
    force ? refreshNews() : refreshNewsIfDue(stored),
  ]);
  // If this run's NEA claim lost to a Mini App mid-fetch, alert on what that fetch stored by now.
  if (!force) snap = (await storedSnapshot()) ?? snap;
  const news = 'skipped' in firstNews ? await refreshNewsIfDue(snap) : firstNews;
  const breaking = await updateBreaking(snap, news.fresh, started);
  const alerts = await runAlerts(snap, started, breaking.toSend);
  // Last, so they never take from the alert budget; neither throws.
  const [ops, card] = await Promise.all([reportOps(started), uploadCard(snap, started)]);
  return {
    asOf: snap.asOf,
    psi3h: snap.worst.psi3h,
    breaking: breaking.added.length ? breaking.added : null,
    alerts,
    ops,
    card,
    news: news.error ? `failed: ${news.error}` : 'skipped' in news ? 'not due' : news.count,
    ms: Date.now() - started,
  };
}
