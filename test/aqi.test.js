import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pm25ToUsAqi } from '../tgcloud/lib/aqi.js';
import { pm25ToPsi } from '../tgcloud/lib/psi.js';

test('pm25ToUsAqi hits EPA 2024 breakpoints', () => {
  for (const [pm, aqi] of [[0, 0], [9, 50], [9.1, 51], [35.4, 100], [35.5, 101], [55.4, 150], [55.5, 151], [125.4, 200], [125.5, 201], [225.4, 300], [225.5, 301], [325.4, 500]]) {
    assert.equal(pm25ToUsAqi(pm).aqi, aqi, `PM2.5 ${pm}`);
  }
});

test('pm25ToUsAqi truncates to one decimal, as EPA does', () => {
  assert.equal(pm25ToUsAqi(9.09).aqi, 50);
  assert.equal(pm25ToUsAqi(35.49).aqi, 100);
});

test('pm25ToUsAqi labels and edge cases', () => {
  assert.equal(pm25ToUsAqi(40).label, 'Unhealthy for sensitive groups');
  assert.equal(pm25ToUsAqi(80).label, 'Unhealthy');
  assert.deepEqual(pm25ToUsAqi(600), { aqi: 500, label: 'Hazardous', beyond: true });
  assert.equal(pm25ToUsAqi(325.4).beyond, false);
  assert.equal(pm25ToUsAqi(-3).aqi, 0);
  assert.equal(pm25ToUsAqi(null), null);
});

test('the US AQI is higher than the PSI for the same haze', () => {
  for (const pm of [20, 40, 55, 80, 150]) assert.ok(pm25ToUsAqi(pm).aqi > pm25ToPsi(pm), `PM2.5 ${pm}`);
});
