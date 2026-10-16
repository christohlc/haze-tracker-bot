import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cigarettes, exposureFactor } from '../tgcloud/lib/cigs.js';

const near = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} ≈ ${b}`);

test('matches haze-tracker.pages.dev at 100% outdoors', () => {
  // Site: island-wide now = mean(152,157,177,168,194) = 169.6 → 0.32 last hour, 7.7/day
  const c = cigarettes({ now: 169.6, mean24h: 145.2 }, 1);
  near(c.lastHour, 0.32);
  near(c.perDayAtCurrent, 7.7, 0.05);
  near(c.past24h, 6.6, 0.05);
});

test('indoors never reaches zero', () => {
  assert.equal(exposureFactor(1), 1);
  assert.equal(exposureFactor(0), 0.4);
  near(exposureFactor(0.5), 0.7);
  assert.equal(exposureFactor(2), 1);
  assert.equal(cigarettes({ now: null, mean24h: null }).past24h, null);
});
