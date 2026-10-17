// Cloudflare Worker that starts .github/workflows/tick.yml through GitHub's workflow_dispatch
// API, because GitHub's own `schedule` drops most runs. Deployed on its own with wrangler
// (README.md#the-15-minute-tick); not part of the bot. GITHUB_TOKEN is a fine-grained token
// (this repo only, Actions: read and write), set with `wrangler secret put`.

const DISPATCH_URL =
  'https://api.github.com/repos/christohogc/haze-tracker-bot/actions/workflows/tick.yml/dispatches';
export const KEEPALIVE_CRON = '33 3 * * MON'; // must match wrangler.jsonc

export function dispatchRequest(cron, token) {
  const body = { ref: 'main' };
  if (cron === KEEPALIVE_CRON) body.inputs = { keepalive: 'true' };
  return {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'haze-tick-cron', // GitHub rejects requests without one
    },
    body: JSON.stringify(body),
  };
}

export default {
  async scheduled(event, env) {
    const init = dispatchRequest(event.cron, env.GITHUB_TOKEN);
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
    // Throwing marks the invocation as failed in the Worker's logs.
    if (res.status !== 204) throw new Error(`dispatch ${event.cron}: HTTP ${res.status} ${await res.text()}`);
  },
};
