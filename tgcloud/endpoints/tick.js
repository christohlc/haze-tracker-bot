// @ts-check
// endpoints/tick.js — the hourly job. Run by .github/workflows/tick.yml:
//   npx tgcloud run endpoints/tick
// (Telegram Serverless has no built-in scheduler.)

import { runAlerts } from '../lib/alerts.js';
import { requireCli } from '../lib/cli-only.js';
import { runForecast } from '../lib/forecast/run.js';
import { refreshNea } from '../lib/refresh.js';

export default async function (input, ctx) {
  requireCli(ctx);
  const started = Date.now();
  const snap = await refreshNea();
  const alerts = await runAlerts(snap);
  const forecast = await runForecast(snap);
  return {
    asOf: snap.asOf,
    psi3h: snap.worst.psi3h,
    alerts,
    forecast: forecast?.steps?.map((s) => `+${s.h}h ${s.psi} (${s.lo}–${s.hi})`) ?? null,
    ms: Date.now() - started,
  };
}
