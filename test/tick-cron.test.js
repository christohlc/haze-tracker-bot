import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import worker, { KEEPALIVE_CRON, dispatchRequest } from '../cron/worker.js';

test('tick cron dispatches main, the keepalive cron adds the input', () => {
  assert.deepEqual(JSON.parse(dispatchRequest('12,27,42,57 * * * *', 't').body), { ref: 'main' });
  assert.deepEqual(JSON.parse(dispatchRequest(KEEPALIVE_CRON, 't').body), {
    ref: 'main',
    inputs: { keepalive: 'true' },
  });
  assert.equal(dispatchRequest('x', 'abc').headers.Authorization, 'Bearer abc');
});

test('wrangler.jsonc schedules the keepalive cron worker.js expects', () => {
  assert.ok(readFileSync(new URL('../cron/wrangler.jsonc', import.meta.url), 'utf8').includes(`"${KEEPALIVE_CRON}"`));
});

test('scheduled throws unless GitHub answers 204', async (t) => {
  const calls = [];
  const reply = (status) => async (url, init) => {
    calls.push(url);
    return new Response(status === 204 ? null : 'nope', { status });
  };
  t.mock.method(globalThis, 'setTimeout', (fn) => fn());
  t.mock.method(globalThis, 'fetch', reply(204));
  await worker.scheduled({ cron: KEEPALIVE_CRON }, { GITHUB_TOKEN: 't' });
  assert.match(calls[0], /tick\.yml\/dispatches$/);

  t.mock.method(globalThis, 'fetch', reply(401));
  await assert.rejects(worker.scheduled({ cron: 'x' }, { GITHUB_TOKEN: 't' }), /HTTP 401/);
  assert.equal(calls.length, 2); // no retry on 401

  t.mock.method(globalThis, 'fetch', reply(502));
  await assert.rejects(worker.scheduled({ cron: 'x' }, { GITHUB_TOKEN: 't' }), /HTTP 502/);
  assert.equal(calls.length, 4); // one retry on 5xx
});
