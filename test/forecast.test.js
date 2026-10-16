import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { pm25ToPsi } from '../tgcloud/lib/psi.js';

// Exported by scripts/train/train.py from real data. If the JS features, model maths or PSI
// breakpoints drift from Python, the deployed model isn't the one we backtested.
const VECTORS = new URL('./forecast-vectors.json', import.meta.url);
const MODEL_JS = new URL('../tgcloud/lib/forecast/model.js', import.meta.url);
const ready = existsSync(VECTORS) && existsSync(MODEL_JS);
const vectors = () => JSON.parse(readFileSync(VECTORS, 'utf8'));

test('every candidate feature matches Python', { skip: !ready && 'run scripts/train/train.py first' }, async () => {
  const { features, CANDIDATE_NAMES } = await import('../tgcloud/lib/forecast/features.js');
  const { windows } = vectors();
  assert.ok(windows.length > 0);
  for (const { raw, expected } of windows) {
    for (const [h, exp] of Object.entries(expected)) {
      assert.deepEqual(Object.keys(exp.candidates).sort(), [...CANDIDATE_NAMES].sort(), 'same candidate set');
      const x = features(raw, Number(h), Object.keys(exp.candidates));
      Object.values(exp.candidates).forEach((want, i) =>
        assert.ok(Math.abs(x[i] - want) < 1e-9, `h=${h} ${Object.keys(exp.candidates)[i]}: ${x[i]} vs ${want}`),
      );
    }
  }
});

test('median prediction and PSI breakpoints match Python', { skip: !ready && 'no model yet' }, async () => {
  const { base, features } = await import('../tgcloud/lib/forecast/features.js');
  const { quantile } = await import('../tgcloud/lib/forecast/predict.js');
  const { MODEL } = await import('../tgcloud/lib/forecast/model.js');
  const { psi, windows } = vectors();
  for (const [pm, want] of psi) assert.equal(pm25ToPsi(pm), want, `PSI at ${pm} µg/m³`);
  for (const { raw, expected } of windows) {
    for (const [h, exp] of Object.entries(expected)) {
      const q50 = quantile(MODEL.horizons[h], '0.5', base(raw), features(raw, Number(h), MODEL.features));
      assert.ok(Math.abs(q50 - exp.q50_log) < 1e-6, `h=${h} q50 ${q50} vs ${exp.q50_log}`);
    }
  }
});

test('predict() keeps lo ≤ median ≤ hi and fills missing inputs', { skip: !ready && 'no model yet' }, async () => {
  const { predict } = await import('../tgcloud/lib/forecast/predict.js');
  const [{ raw }] = vectors().windows;
  const out = predict(raw);
  assert.equal(out.steps.length, Object.keys((await import('../tgcloud/lib/forecast/model.js')).MODEL.horizons).length);
  for (const s of out.steps) assert.ok(s.lo <= s.psi && s.psi <= s.hi, JSON.stringify(s));

  const nanAll = (/** @type {number[]} */ xs) => xs.map(() => NaN);
  const broken = { ...raw, ws: nanAll(raw.ws), precip: nanAll(raw.precip), aq: { ...raw.aq, sg: nanAll(raw.aq.sg) } };
  const out2 = predict(broken);
  for (const s of out2.steps) assert.ok(Number.isFinite(s.psi));
});
