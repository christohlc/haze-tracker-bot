import assert from 'node:assert/strict';
import { test } from 'node:test';
import { retryOnce } from '../tgcloud/lib/fetch-retry.js';

/** Calls `request` through retryOnce; resolves to what it returned (or threw) and how often it ran. */
async function run(request, deadline) {
  let calls = 0;
  const result = await retryOnce(() => request(++calls), deadline).catch((e) => e);
  return { result, calls };
}

const failFirst = (n) => async (call) => {
  if (call <= n) throw new Error(`fetch: request failed (${call})`);
  return 'feed';
};

test('a request that works is made once', async () => {
  assert.deepEqual(await run(failFirst(0)), { result: 'feed', calls: 1 });
});

test('a request that fails once is retried', async () => {
  assert.deepEqual(await run(failFirst(1)), { result: 'feed', calls: 2 });
});

test('a request that fails twice throws the second error', async () => {
  const { result, calls } = await run(failFirst(2));
  assert.match(result.message, /request failed \(2\)/);
  assert.equal(calls, 2);
});

test('an HTTP error is a response, so it isn’t retried', async () => {
  assert.deepEqual(await run(async () => ({ ok: false, status: 503 })), { result: { ok: false, status: 503 }, calls: 1 });
});

test('no retry that could run past the caller’s deadline', async () => {
  const { result, calls } = await run(failFirst(1), Date.now() + 1_000);
  assert.match(result.message, /request failed \(1\)/);
  assert.equal(calls, 1);
});
