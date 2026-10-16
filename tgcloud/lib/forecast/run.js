// @ts-check
// Run the forecast once per NEA hour and cache it in state('forecast').
// /haze and the Mini App can trigger a run, so attempts are throttled per hour: when Open-Meteo
// is down, requests get the previous forecast (or null) instead of each calling it again.

import { pm25ToPsi } from '../psi.js';
import { getState, recordSource, setState } from '../store.js';
import { toSgtIso, unixHour } from '../time.js';
import { fetchInputs } from './inputs.js';
import { MODEL } from './model.js';
import { predict } from './predict.js';

const RETRY_MS = 5 * 60_000;

/**
 * Forecast for the snapshot's NEA hour: the cached one if already made, else a fresh run.
 * @param {any} snap
 */
export async function runForecast(snap) {
  const prev = (await getState('forecast'))?.value ?? null;
  if (prev?.issuedAt === snap.asOf && prev?.model?.trainedAt === MODEL.trainedAt) return prev;
  // A new NEA hour gets a try straight away; retries for the same hour wait RETRY_MS.
  const last = (await getState('forecast_attempt'))?.value;
  if (last?.asOf === snap.asOf && Date.now() - last.at < RETRY_MS) return prev;
  await setState('forecast_attempt', { asOf: snap.asOf, at: Date.now() });
  try {
    const raw = await fetchInputs(snap);
    const { steps, factors, missing } = predict(raw);
    const t0 = unixHour(snap.asOf);
    const forecast = {
      issuedAt: snap.asOf,
      now: pm25ToPsi(snap.island.now),
      steps: steps.map((s) => ({ ...s, t: toSgtIso((t0 + s.h) * 3600) })),
      factors: factors.map((f) => ({ ...f, delta: Math.round(f.delta) })),
      missingInputs: missing,
      model: { version: MODEL.version, trainedAt: MODEL.trainedAt, backtest: MODEL.backtest ?? null },
    };
    await Promise.all([
      setState('forecast', forecast),
      recordSource('openmeteo', {
        ok: true,
        detail: missing ? `${missing} inputs missing, filled with typical values` : 'weather and air quality',
      }),
    ]);
    return forecast;
  } catch (e) {
    await recordSource('openmeteo', { ok: false, error: e instanceof Error ? e.message : String(e) });
    return prev;
  }
}

/**
 * The forecast for `snap`'s NEA hour, or null if it can't be made (Open-Meteo down). When /haze
 * refreshed the snapshot ahead of the hourly tick, this makes the matching forecast.
 * @param {any} snap
 */
export async function getCurrentForecast(snap) {
  const forecast = await runForecast(snap);
  return forecast?.issuedAt === snap.asOf ? forecast : null;
}
