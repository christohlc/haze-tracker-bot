// @ts-check
// endpoints/tick.js — the hourly job. Run by .github/workflows/tick.yml:
//   npx tgcloud run endpoints/tick
// (Telegram Serverless has no built-in scheduler.)

import { runAlerts } from '../lib/alerts.js';
import { requireCli } from '../lib/cli-only.js';
import { refreshNea } from '../lib/refresh.js';

export default async function (input, ctx) {
  requireCli(ctx);
  const started = Date.now();
  const snap = await refreshNea();
  const alerts = await runAlerts(snap);
  return {
    asOf: snap.asOf,
    psi3h: snap.worst.psi3h,
    alerts,
    ms: Date.now() - started,
  };
}
