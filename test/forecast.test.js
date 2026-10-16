import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

// Vectors exported by scripts/train/train.py from real data: the JS features and median
// prediction must match Python's, or the deployed model is not the model we backtested.
const VECTORS = new URL('./forecast-vectors.json', import.meta.url);
const MODEL_JS = new URL('../tgcloud/lib/forecast/model.js', import.meta.url);
const ready = existsSync(VECTORS) && existsSync(MODEL_JS);

test('JS forecast features and predictions match Python', { skip: !ready && 'run scripts/train/train.py first' }, async () => {
  const { features } = await import('../tgcloud/lib/forecast/features.js');
  const { MODEL } = await import('../tgcloud/lib/forecast/model.js');
  const vectors = JSON.parse(readFileSync(VECTORS, 'utf8'));
  assert.ok(vectors.length > 0);
  for (const { raw, expected } of vectors) {
    for (const [h, exp] of Object.entries(expected)) {
      const x = features(raw, Number(h));
      x.forEach((v, i) => assert.ok(Math.abs(v - exp.features[i]) < 1e-9, `h=${h} feature ${MODEL.features[i]}: ${v} vs ${exp.features[i]}`));
      const m = MODEL.horizons[h];
      const { b, w } = m.q['0.5'];
      const base = (MODEL.target === 'delta' ? x[0] : 0) + b;
      const q50 = x.reduce((s, xi, i) => s + w[i] * ((xi - m.mean[i]) / m.scale[i]), base);
      assert.ok(Math.abs(q50 - exp.q50_log) < 1e-6, `h=${h} q50 ${q50} vs ${exp.q50_log}`);
    }
  }
});

test('predict() returns ordered ranges and handles missing inputs', { skip: !ready && 'no model yet' }, async () => {
  const { predict } = await import('../tgcloud/lib/forecast/predict.js');
  const [{ raw }] = JSON.parse(readFileSync(VECTORS, 'utf8'));
  const out = predict(raw);
  assert.equal(out.steps.length, 5);
  for (const s of out.steps) assert.ok(s.lo <= s.psi && s.psi <= s.hi, JSON.stringify(s));
  assert.ok(out.factors.every((f) => f.group !== 'recent'));

  const broken = { ...raw, blh: raw.blh.map(() => NaN), aq: { ...raw.aq, kalbar: raw.aq.kalbar.map(() => NaN) } };
  const out2 = predict(broken);
  assert.ok(out2.missing > 0);
  for (const s of out2.steps) assert.ok(Number.isFinite(s.psi));
});
