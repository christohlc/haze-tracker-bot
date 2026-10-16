import assert from 'node:assert/strict';
import { test } from 'node:test';
import { meanOfLast, pm25Band, pm25ToPsi, psiBand } from '../tgcloud/lib/psi.js';

test('pm25ToPsi hits NEA breakpoints', () => {
  assert.equal(pm25ToPsi(0), 0);
  assert.equal(pm25ToPsi(12), 50);
  assert.equal(pm25ToPsi(55), 100);
  assert.equal(pm25ToPsi(150), 200);
  assert.equal(pm25ToPsi(250), 300);
  assert.equal(pm25ToPsi(350), 400);
  assert.equal(pm25ToPsi(500), 500);
});

test('pm25ToPsi matches haze-tracker.pages.dev 1h PSI', () => {
  // Region readings seen on the site: PM2.5 → 1h PSI
  for (const [pm, psi] of [[152, 202], [157, 207], [177, 227], [168, 218], [194, 244]]) {
    assert.equal(pm25ToPsi(pm), psi, `PM2.5 ${pm}`);
  }
});

test('pm25ToPsi edge cases', () => {
  assert.equal(pm25ToPsi(13), 51);
  assert.equal(pm25ToPsi(-5), 0);
  assert.equal(pm25ToPsi(null), null);
  assert.ok(pm25ToPsi(600) > 500);
});

test('psiBand boundaries', () => {
  assert.equal(psiBand(50).id, 'good');
  assert.equal(psiBand(51).id, 'moderate');
  assert.equal(psiBand(100).id, 'moderate');
  assert.equal(psiBand(101).id, 'unhealthy');
  assert.equal(psiBand(200).id, 'unhealthy');
  assert.equal(psiBand(201).id, 'very_unhealthy');
  assert.equal(psiBand(300).id, 'very_unhealthy');
  assert.equal(psiBand(301).id, 'hazardous');
  assert.equal(psiBand(null), null);
});

test('pm25Band boundaries', () => {
  assert.equal(pm25Band(55).id, 'I');
  assert.equal(pm25Band(56).id, 'II');
  assert.equal(pm25Band(150).id, 'II');
  assert.equal(pm25Band(194).id, 'III');
  assert.equal(pm25Band(251).id, 'IV');
});

test('meanOfLast ignores nulls', () => {
  assert.equal(meanOfLast([1, 2, 3, 4], 2), 3.5);
  assert.equal(meanOfLast([1, null, 3], 3), 2);
  assert.equal(meanOfLast([], 3), null);
});
