import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import worker, { KEEPALIVE_CRON, dispatchRequest, opsDue } from '../cron/worker.js';

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

const TOP = Date.parse('2026-10-17T04:12:00Z'); // the first tick cron of an hour
const OPS_ENV = { GITHUB_TOKEN: 't', TELEGRAM_BOT_TOKEN: 'bot:tok', OPS_CHAT_ID: '-100123' };

/** fetch for GitHub (dispatch status, last success `agoMin` ago or none) and Telegram, logged in `calls`. */
function fakeApis(t, { dispatch = 204, agoMin = 10, runs = 200 } = {}) {
  const calls = [];
  t.mock.method(globalThis, 'setTimeout', (fn) => fn());
  t.mock.method(console, 'error', () => {});
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url, body: init?.body ? JSON.parse(init.body) : undefined });
    if (url.endsWith('/dispatches')) return new Response(dispatch === 204 ? null : 'bad credentials', { status: dispatch });
    if (url.includes('/runs?')) {
      const workflow_runs = agoMin === null ? [] : [{ updated_at: new Date(TOP - agoMin * 60_000).toISOString(), html_url: 'https://gh/run/1' }];
      return new Response(JSON.stringify({ workflow_runs }), { status: runs });
    }
    return new Response('{"ok":true}');
  });
  return calls;
}
const dms = (calls) => calls.filter((c) => c.url.startsWith('https://api.telegram.org/botbot:tok/'));

test('ops DMs only on the first tick cron of the hour', () => {
  assert.equal(opsDue({ cron: 'x', scheduledTime: TOP }), true);
  assert.equal(opsDue({ cron: 'x', scheduledTime: TOP + 15 * 60_000 }), false);
  assert.equal(opsDue({ cron: KEEPALIVE_CRON, scheduledTime: Date.parse('2026-10-19T03:03:00Z') }), false);
});

test('a tick overdue by more than 45 minutes is DM’d to OPS_CHAT_ID', async (t) => {
  let calls = fakeApis(t, { agoMin: 50 });
  await worker.scheduled({ cron: 'x', scheduledTime: TOP }, OPS_ENV);
  assert.match(calls[1].url, /tick\.yml\/runs\?status=success&per_page=1$/);
  assert.equal(dms(calls).length, 1);
  assert.equal(dms(calls)[0].body.chat_id, '-100123');
  assert.match(dms(calls)[0].body.text, /No successful tick for 50 min \(last: https:\/\/gh\/run\/1\)/);

  calls = fakeApis(t, { agoMin: 30 });
  await worker.scheduled({ cron: 'x', scheduledTime: TOP }, OPS_ENV);
  assert.equal(dms(calls).length, 0);

  calls = fakeApis(t, { agoMin: null });
  await worker.scheduled({ cron: 'x', scheduledTime: TOP }, OPS_ENV);
  assert.match(dms(calls)[0].body.text, /No successful tick run found/);

  calls = fakeApis(t, { agoMin: 50 });
  await worker.scheduled({ cron: 'x', scheduledTime: TOP + 15 * 60_000 }, OPS_ENV);
  assert.equal(calls.length, 1); // not the hour's first cron: dispatch only
});

test('a failed dispatch is DM’d and still fails the run; a failed lookup alone says nothing', async (t) => {
  let calls = fakeApis(t, { dispatch: 401 });
  await assert.rejects(worker.scheduled({ cron: 'x', scheduledTime: TOP }, OPS_ENV), /HTTP 401/);
  assert.match(dms(calls)[0].body.text, /Couldn't start the tick: dispatch x: HTTP 401 bad credentials/);

  calls = fakeApis(t, { runs: 500 });
  await worker.scheduled({ cron: 'x', scheduledTime: TOP }, OPS_ENV);
  assert.equal(dms(calls).length, 0);
});

test('without the Telegram secrets the Worker only dispatches', async (t) => {
  const calls = fakeApis(t, { dispatch: 401 });
  await assert.rejects(worker.scheduled({ cron: 'x', scheduledTime: TOP }, { GITHUB_TOKEN: 't', OPS_CHAT_ID: '1' }));
  assert.equal(calls.length, 1);
});
