// @ts-check
// endpoints/tick.js — the hourly job. Run by .github/workflows/tick.yml:
//   npx tgcloud run endpoints/tick
// (Telegram Serverless has no built-in scheduler.)

import { requireCli } from '../lib/cli-only.js';
import { refreshNea } from '../lib/refresh.js';

export default async function (input, ctx) {
  requireCli(ctx);
  const started = Date.now();
  const snap = await refreshNea();
  return {
    asOf: snap.asOf,
    psi3h: snap.worst.psi3h,
    ms: Date.now() - started,
  };
}
