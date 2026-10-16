// @ts-check
// Run the forecast once per NEA hour and cache it in state('forecast').

import { pm25ToPsi } from '../psi.js';
import { getState, recentReadings, recordSource, setState, toSgtIso } from '../store.js';
import { fetchInputs } from './inputs.js';
import { MODEL } from './model.js';
import { predict } from './predict.js';

/** @param {any} snap */
export async function runForecast(snap) {
  const prev = (await getState('forecast'))?.value ?? null;
  if (prev?.issuedAt === snap.asOf && prev?.model?.trainedAt === MODEL.trainedAt) return prev;
  try {
    const raw = await fetchInputs(snap.asOf, await recentReadings(30));
    const { steps, factors, missing } = predict(raw);
    const t0 = Math.floor(Date.parse(snap.asOf) / 1000);
    const forecast = {
      issuedAt: snap.asOf,
      now: pm25ToPsi(snap.island.now),
      steps: steps.map((s) => ({ ...s, t: toSgtIso(t0 + s.h * 3600) })),
      factors: factors.slice(0, 3).map((f) => ({ ...f, delta: Math.round(f.delta) })),
      missingInputs: missing,
      model: { version: MODEL.version, trainedAt: MODEL.trainedAt },
    };
    await setState('forecast', forecast);
    await recordSource('openmeteo', {
      ok: true,
      detail: missing ? `${missing} inputs missing, filled with typical values` : 'weather + 6 air-quality points',
    });
    return forecast;
  } catch (e) {
    await recordSource('openmeteo', { ok: false, error: e instanceof Error ? e.message : String(e) });
    return prev;
  }
}

export async function getForecast() {
  return (await getState('forecast'))?.value ?? null;
}
