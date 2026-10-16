// @ts-check
// endpoints/tick.js — the 15-minute job. Run by .github/workflows/tick.yml:
//   npx tgcloud run endpoints/tick            ('{"force":true}' refetches NEA and news regardless)
// (Telegram Serverless has no built-in scheduler.) NEA and news are fetched about once an hour
// (news every run while there's haze) and the forecast once per NEA hour; the extra runs are for
// alerts a previous run didn't reach. News comes before alerts, so breaking news from it goes
// out in the same run.

import { runAlerts } from '../lib/alerts.js';
import { updateBreaking } from '../lib/breaking.js';
import { requireCli } from '../lib/cli-only.js';
import { runForecast } from '../lib/forecast/run.js';
import { refreshNews, refreshNewsIfDue } from '../lib/news.js';
import { refreshNea, refreshNeaIfNewHour } from '../lib/refresh.js';

/** Alerts wait this long for the news; a slow feed then finishes alongside them, and its
 *  breaking news goes out on the next run. */
const NEWS_WAIT_MS = 5_000;

/** `p`, or null if it takes longer than `ms` (no timers: just `p`). @template T @param {Promise<T>} p @param {number} ms */
const within = (p, ms) =>
  typeof setTimeout === 'function' ? Promise.race([p, new Promise((r) => setTimeout(() => r(null), ms))]) : p;

export default async function (input, ctx) {
  requireCli(ctx);
  const started = Date.now();
  const force = Boolean(input?.force);
  const snap = await (force ? refreshNea() : refreshNeaIfNewHour(started));
  const forecastRun = runForecast(snap);
  const newsRun = force ? refreshNews() : refreshNewsIfDue(snap);
  const early = await within(newsRun, NEWS_WAIT_MS);
  const breaking = await updateBreaking(snap, early?.fresh ?? [], started);
  const [alerts, forecast, news] = await Promise.all([runAlerts(snap, started), forecastRun, newsRun]);
  return {
    asOf: snap.asOf,
    psi3h: snap.worst.psi3h,
    breaking: breaking.length ? breaking : null,
    alerts,
    forecast: forecast?.steps?.map((s) => `+${s.h}h ${s.psi} (${s.lo}–${s.hi})`) ?? null,
    news: news.error ? `failed: ${news.error}` : 'skipped' in news ? 'not due' : news.count,
    ms: Date.now() - started,
  };
}
