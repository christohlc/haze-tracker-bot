import assert from 'node:assert/strict';
import { test } from 'node:test';
import { retryOnce } from '../tgcloud/lib/fetch-retry.js';

/** A request that fails `failures` times with the platform's error, then answers. */
function flaky(failures) {
  let calls = 0;
  const request = async () => {
    calls++;
    if (calls <= failures) throw new Error(`fetch: request failed (${calls})`);
    return 'feed';
  };
  return { request, calls: () => calls };
}

test('a request that works is made once', async () => {
  const r = flaky(0);
  assert.equal(await retryOnce(r.request), 'feed');
  assert.equal(r.calls(), 1);
});

test('a request that fails once is retried', async () => {
  const r = flaky(1);
  assert.equal(await retryOnce(r.request), 'feed');
  assert.equal(r.calls(), 2);
});

test('a request that fails twice throws the second error', async () => {
  const r = flaky(2);
  await assert.rejects(retryOnce(r.request), /request failed \(2\)/);
  assert.equal(r.calls(), 2);
});
