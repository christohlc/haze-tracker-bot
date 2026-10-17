# I’m going hazelnuts!

<img src="public/logo.svg" alt="" width="72" align="right" />

A Telegram bot and Mini App for haze in Singapore. It shows current PSI by region (also as a
shareable picture of the island), a cigarette
equivalent, NEA’s 24-hour PSI forecast during haze episodes, a likely range for the next few hours,
NEA’s health advice, wind and rain from NEA’s weather stations, NEA’s wind forecast, NEA’s regional map of fires and
smoke haze (from haze.gov.sg), LTA’s checkpoint and Sentosa
camera pictures and the latest haze headlines from The Straits Times, CNA and Mothership, and
sends alerts to a chat when the haze band changes or there’s breaking haze news (schools closing,
outdoor activities called off, NEA’s 24-hour PSI turning Very unhealthy or Hazardous).

- **Bot:** `/haze`, `/cigs [region] [% outdoors]`, `/forecast`, `/subscribe`, `/alerts`,
  `/unsubscribe`
- **Mini App:** <https://app8809761337.tgcloud.ai/>, opened from the bot’s button

Readings come from NEA (via data.gov.sg). The 1-hour and 3-hour PSI and the next-hours range are this
project’s own calculations, not official figures. Breaking news is picked from the headlines by
the bot’s own rules and sent without anyone checking it first; the operator can pause it with
`endpoints/admin` (`breaking_pause`).

## How it fits together

```
Cloudflare Worker cron (cron/, every 15 min: :12, :27, :42, :57) ─▶ GitHub Actions workflow_dispatch
  └─ npx tgcloud run endpoints/tick
       ├─ refresh NEA PM2.5 + PSI  → readings, state(snapshot)
       ├─ refresh news (every run while there's haze) → state(news), breaking events → state(breaking)
       └─ send breaking news, band-change and daily alerts → subscribers, alerts_sent

Telegram ─ message / callback_query ─▶ tgcloud/handlers/*      (bot commands)
Mini App  ─ Serverless.call(...)     ─▶ tgcloud/endpoints/*     (getDashboard, getWeather, getCameras, getHazeMap, alerts, shareCard)
```

It runs on Telegram Serverless (tgcloud). There is no server to host: `tgcloud/` holds the
modules that run in the cloud, and `src/` is the Svelte front-end, built to `dist/` and served
as the Mini App. Telegram Serverless has no scheduler, so
[`.github/workflows/tick.yml`](.github/workflows/tick.yml) runs the 15-minute job, started by an
external cron ([below](#the-15-minute-tick)). If a run is late, `/haze` and the Mini App fetch
fresh data themselves when the snapshot is stale.

| Path | What it is |
|---|---|
| `tgcloud/schema.js` | Database tables |
| `tgcloud/handlers/` | Bot commands and inline buttons |
| `cron/` | Cloudflare Worker that starts the tick workflow every 15 minutes (deployed separately) |
| `tgcloud/endpoints/` | `getDashboard`, `getWeather`, `getCameras`, `getHazeMap`, `alerts`, `shareCard` (Mini App), `tick`, `admin` (CLI only) |
| `tgcloud/lib/` | NEA fetch, PSI maths, alerts, breaking news, formatting, NEA’s outlook and the next-hours range, weather and cameras |
| `src/` | Mini App (Svelte 5 + Vite + TypeScript) |
| `scripts/fixture.mjs` | Builds `src/dev/fixture.json` from live data for local UI work |
| `scripts/deploy-guard.mjs` | Run by `npm run deploy`: refuses unless on a clean `main` level with `origin/main` |
| `scripts/card/` | Builds the summary picture’s glyphs, map and logo (`npm run card:assets`); `preview.mjs` writes sample PNGs |
| `test/` | `node --test` unit tests for the shared logic |
| `docs/` | Platform SDK reference, [design notes](docs/design.md), UI audit |

## Develop

Needs Node (version in `.nvmrc`).

```bash
npm install
```

```bash
npm run dev
```

Outside Telegram the Mini App uses `src/dev/fixture.json` instead of calling endpoints. A
toolbar at the bottom of the page switches between demo, worst-case, empty, error and loading
data (`?demo=worst` and so on). To refresh the fixture from live NEA data:

```bash
node scripts/fixture.mjs
```

Checks:

```bash
npm test
```

```bash
npm run check
```

## Deploy

```bash
npm run deploy
```

That builds the front-end and runs `tgcloud push`, but only from a clean `main` that matches
`origin/main` (`DEPLOY_FORCE=1 npm run deploy` overrides it). Deploying never changes the
database: after editing `tgcloud/schema.js`, run `npx tgcloud migrate` as well.
`npx tgcloud status` shows what differs from the cloud. It doesn't touch the cron Worker in `cron/`: after changing that, run
`npx wrangler@4 deploy --config cron/wrangler.jsonc` ([below](#the-15-minute-tick)).

To run a module in the cloud by hand:

```bash
npx tgcloud run endpoints/tick
```

The tick workflow needs the secret `TGCLOUD_TOKEN` in the `production` environment (Settings →
Environments), which only `main` can use.

### The 15-minute tick

GitHub's own `schedule` trigger is best effort and drops most runs (on 16 Oct 2026 it fired 1 of
31 slots), so a Cloudflare Worker ([`cron/`](cron/)) starts the workflow through the API at :12,
:27, :42 and :57, plus the keepalive on Mondays. The `schedule` in the workflow stays as a
backstop; when both fire in the same slot, the second run waits for the first and finds NEA and
the news cached. To set it up:

1. GitHub → Settings → Developer settings → Fine-grained tokens → new token with access to this
   repository only and the single permission **Actions: Read and write**. Set an expiry and a
   reminder to renew it; once it lapses only the unreliable `schedule` is left.
2. Deploy the Worker (free plan; `npx wrangler@4 login` first). On a new Cloudflare account,
   open **Workers & Pages** in the dashboard once before deploying: cron triggers need the
   account's workers.dev subdomain (error 10063), which that page creates, even though this
   Worker has no public URL. If that error came up anyway, the code is uploaded but the crons
   aren't: open that page, then deploy again.

   ```bash
   npx wrangler@4 deploy --config cron/wrangler.jsonc
   ```

3. Store the token. It prompts for the value, so paste it there, not into this repo or a chat:

   ```bash
   npx wrangler@4 secret put GITHUB_TOKEN --config cron/wrangler.jsonc
   ```

4. In the Cloudflare dashboard, the Worker's **Settings → Trigger events** lists both crons (if it
   says “No cron triggers configured”, deploy again) and
   **Observability → Logs** shows each run; a failed dispatch is logged as an error with GitHub's
   status (401: the token is wrong or expired; 403/404: wrong permission or repository).

The token can start, re-run and cancel Actions runs in this repository and nothing else. Check
that runs are coming in with:

```bash
gh run list --workflow tick.yml -L 12
```

### Groups

Add the bot to a group and an admin sends `/subscribe` (in the topic the alerts should go to, if
the group has topics). Only the group’s admins can change or stop its alerts. In groups,
`/haze`, `/cigs`, `/forecast`, `/alerts` and `/help` are ephemeral: picked from the command menu,
the command and the reply are seen only by the person who sent it. The list, and `/help`, come
from `COMMANDS` in [`tgcloud/lib/chat-rules.js`](tgcloud/lib/chat-rules.js); after deploying a
change to it, set the menus again:

```bash
npx tgcloud run endpoints/admin "{ action: 'commands' }"
```

If the bot is a group admin, it can also send an ephemeral “admins only” answer to an ordinary
command, and still answer an ephemeral command after Telegram’s 15-second reply window; otherwise
the first is visible to the group and the second gets no answer.

In groups the dashboard button is a `t.me` link: it opens the Mini App directly if it’s set as
the bot’s main Mini App in BotFather (Bot Settings → Configure Mini App), otherwise the bot’s
private chat. The bot reads that setting once per isolate, so a change shows after the next deploy.

### Operator settings

There is no secret store, so secrets live in the `settings` table and are set only through the
CLI-only `admin` endpoint (see the comment at the top of
[`tgcloud/endpoints/admin.js`](tgcloud/endpoints/admin.js)). Don’t paste keys into commands
that end up in shell history; the file shows how to read one with `read -rs`. `tgcloud run` and
npm print a command's input, key included, so the example filters those lines out; never share
that output unfiltered. A new data.gov.sg key reaches the bot within 10 minutes, and revoking an
old one is safe at any time: data.gov.sg treats an unknown key like no key.

## What’s ahead

Two parts, with no model to train:

- **NEA’s 24-hr PSI forecast** (`lib/outlook-parse.js`), read from the JSON that haze.gov.sg
  itself uses (`nea.gov.sg/api/advisory/latesthazesituationupdate`). NEA issues it at about 6 pm
  SGT, and only during haze episodes. It isn’t a documented API, so the parser returns null for
  anything it can’t read and the section shows only the range.
- **The next few hours** (`lib/range.js`): the island-wide 1-hour PSI now, widened by the 10th
  and 90th percentiles of how far it moved over 1, 3 and 6 hours in the past two weeks. On NEA
  readings from 2022 to 2026 the actual value landed inside it 81–83% of the time (80–86%
  during haze); rerun with `node scripts/range-backtest.mjs <dir of NEA day files>`. It needs
  three days of readings and the tick only ever fetches today and yesterday, so after a fresh start
  or a gap backfill them once:

  ```bash
  npx tgcloud run endpoints/admin "{ action: 'backfill', days: 14 }"
  ```

  It skips days already complete and stops before the run limit; rerun until `remaining` is empty.
  If the result says `paced: false` (the runtime has no way to wait between requests), a run fetches
  at most 5 days, to stay under data.gov.sg’s rate limit, so wait a minute between reruns.

## Releasing a user-facing change

Add an entry to [`src/lib/changelog.ts`](src/lib/changelog.ts) for the in-app **What’s new**
card under More. The rules are in [docs/design.md](docs/design.md#whats-new).
