// Cloudflare Worker that starts .github/workflows/tick.yml through GitHub's workflow_dispatch
// API, because GitHub's own `schedule` drops most runs. Deployed on its own with wrangler
// (README.md#the-15-minute-tick); not part of the bot. GITHUB_TOKEN is a fine-grained token
// (this repo only, Actions: read and write), set with `wrangler secret put`.
// The tick can't report its own absence, so this Worker does: with TELEGRAM_BOT_TOKEN and
// OPS_CHAT_ID set (also secrets; without them it says nothing), it DMs the operator when the last
// successful tick is over 45 minutes old or the dispatch failed, at most once an hour.

const WORKFLOW_URL = 'https://api.github.com/repos/christohlc/haze-tracker-bot/actions/workflows/tick.yml';
const DISPATCH_URL = `${WORKFLOW_URL}/dispatches`;
const LAST_SUCCESS_URL = `${WORKFLOW_URL}/runs?status=success&per_page=1`;
export const KEEPALIVE_CRON = '33 3 * * MON'; // must match wrangler.jsonc
export const OVERDUE_MS = 45 * 60_000;

const githubHeaders = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'haze-tick-cron', // GitHub rejects requests without one
});

export function dispatchRequest(cron, token) {
  const body = { ref: 'main' };
  if (cron === KEEPALIVE_CRON) body.inputs = { keepalive: 'true' };
  return { method: 'POST', headers: githubHeaders(token), body: JSON.stringify(body) };
}

/**
 * Whether this run may DM: the Worker keeps no state, so only the hour's first tick cron (:12 in
 * wrangler.jsonc; the keepalive's :33 isn't) does, which makes it at most once an hour. A dispatch
 * that fails at :27 is told at :12 if it still fails then.
 */
export const opsDue = (event) => new Date(event.scheduledTime).getUTCMinutes() < 15;

/** Throws unless GitHub took the dispatch. */
async function dispatch(cron, token) {
  const init = dispatchRequest(cron, token);
  let res;
  // One retry, for a network error or a GitHub 5xx. Anything else (401 expired token,
  // 403/404 wrong permission) won't fix itself.
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      res = await fetch(DISPATCH_URL, init);
      if (res.status < 500) break;
    } catch (err) {
      if (attempt === 2) throw err;
    }
    if (attempt === 1) await new Promise((r) => setTimeout(r, 3000));
  }
  if (res.status !== 204) throw new Error(`dispatch ${cron}: HTTP ${res.status} ${await res.text()}`);
}

/** What's wrong with the tick, or null when nothing is. Never throws. */
async function tickProblem(env, now, dispatchError) {
  const problems = [];
  if (dispatchError) problems.push(`Couldn’t start the tick: ${dispatchError.message.slice(0, 300)}`); // GitHub's 5xx body can be a page of HTML
  try {
    const res = await fetch(LAST_SUCCESS_URL, { headers: githubHeaders(env.GITHUB_TOKEN) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const run = (await res.json()).workflow_runs?.[0];
    // The tick has hundreds of successful runs, so an empty list is GitHub's listing glitching
    // (it answered 200 with none on 20 Oct while every run succeeded), not news.
    if (!run) throw new Error('empty run list');
    const agoMs = now - Date.parse(run.updated_at);
    if (agoMs > OVERDUE_MS) problems.push(`No successful tick for ${Math.round(agoMs / 60_000)} min (last: ${run.html_url})`);
  } catch (err) {
    console.error('last tick lookup failed', err.message); // a failed dispatch says enough already
  }
  return problems.length ? `⚠️ ${problems.join('\n\n')}` : null;
}

/** Never throws, and never logs the token (it's in the URL). */
async function sendOps(env, text) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: env.OPS_CHAT_ID, text }),
    });
    if (!res.ok) console.error('ops DM failed: HTTP', res.status);
  } catch {
    console.error('ops DM failed');
  }
}

export default {
  async scheduled(event, env) {
    let dispatchError = null;
    try {
      await dispatch(event.cron, env.GITHUB_TOKEN);
    } catch (err) {
      dispatchError = err;
    }
    if (env.TELEGRAM_BOT_TOKEN && env.OPS_CHAT_ID && opsDue(event)) {
      const text = await tickProblem(env, event.scheduledTime, dispatchError);
      if (text) await sendOps(env, text);
    }
    // Throwing marks the invocation as failed in the Worker's logs.
    if (dispatchError) throw dispatchError;
  },
};
