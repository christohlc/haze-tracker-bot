# I’m going hazelnuts!

<img src="public/logo.svg" alt="" width="72" align="right" />

A Telegram bot and Mini App for haze in Singapore. It shows current PSI by region (also as a
shareable picture of the island), a cigarette
equivalent, a 24-hour PSI forecast, NEA’s health advice and the latest haze headlines from The
Straits Times, CNA and Mothership, and sends alerts to a chat when the haze band changes or
there’s breaking haze news (schools closing, outdoor activities called off, NEA’s 24-hour PSI
turning Very unhealthy or Hazardous).

- **Bot:** `/haze`, `/cigs [region] [% outdoors]`, `/forecast`, `/subscribe`, `/alerts`,
  `/unsubscribe`
- **Mini App:** <https://app8809761337.tgcloud.ai/>, opened from the bot’s button

Readings come from NEA (via data.gov.sg). The 1-hour and 3-hour PSI and the forecast are this
project’s own calculations, not official figures. Breaking news is picked from the headlines by
the bot's own rules and sent without anyone checking it first; the operator can pause it with
`endpoints/admin` (`breaking_pause`).

## How it fits together

```
GitHub Actions (hourly, :12)
  └─ npx tgcloud run endpoints/tick
       ├─ refresh NEA PM2.5 + PSI  → readings, state(snapshot)
       ├─ refresh news (every run while there's haze) → state(news), breaking events → state(breaking)
       ├─ send breaking news, band-change and daily alerts → subscribers, alerts_sent
       └─ run the forecast (Open-Meteo inputs) → state(forecast)

Telegram ─ message / callback_query ─▶ tgcloud/handlers/*      (bot commands)
Mini App  ─ Serverless.call(...)     ─▶ tgcloud/endpoints/*     (getDashboard, alerts)
```

It runs on Telegram Serverless (tgcloud). There is no server to host: `tgcloud/` holds the
modules that run in the cloud, and `src/` is the Svelte front-end, built to `dist/` and served
as the Mini App. Telegram Serverless has no scheduler, so
[`.github/workflows/tick.yml`](.github/workflows/tick.yml) runs the hourly job. If a run is
late, `/haze` and the Mini App fetch fresh data themselves when the snapshot is stale.

| Path | What it is |
|---|---|
| `tgcloud/schema.js` | Database tables |
| `tgcloud/handlers/` | Bot commands and inline buttons |
| `tgcloud/endpoints/` | `getDashboard`, `alerts`, `shareCard` (Mini App), `tick`, `admin` (CLI only) |
| `tgcloud/lib/` | NEA fetch, PSI maths, alerts, formatting, the forecast runtime |
| `src/` | Mini App (Svelte 5 + Vite + TypeScript) |
| `scripts/train/` | Offline Python training for the forecast. Never deployed |
| `scripts/fixture.mjs` | Builds `src/dev/fixture.json` from live data for local UI work |
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

That builds the front-end and runs `tgcloud push`. Deploying never changes the database: after
editing `tgcloud/schema.js`, run `npx tgcloud migrate` as well. `npx tgcloud status` shows what
differs from the cloud.

To run a module in the cloud by hand:

```bash
npx tgcloud run endpoints/tick
```

The tick workflow needs the repository secret `TGCLOUD_TOKEN`.

### Operator settings

There is no secret store, so secrets live in the `settings` table and are set only through the
CLI-only `admin` endpoint (see the comment at the top of
[`tgcloud/endpoints/admin.js`](tgcloud/endpoints/admin.js)). Don’t paste keys into commands
that end up in shell history; the file shows how to read one with `read -rs`.

## Forecast

A quantile linear model per horizon (+1, 2, 3, 6 and 24 hours), trained offline in Python and
exported as coefficients to `tgcloud/lib/forecast/model.js`, which the runtime evaluates in JS.
Retraining:

```bash
uv run --project scripts/train python scripts/train/fetch.py
```

```bash
uv run --project scripts/train python scripts/train/train.py
```

The backtest lands in `scripts/train/report.json`, and `test/forecast-vectors.json` checks that
the JS predictions match Python’s.

## Releasing a user-facing change

Add an entry to [`src/lib/changelog.ts`](src/lib/changelog.ts) for the in-app **What’s new**
card under More. The rules are in [docs/design.md](docs/design.md#whats-new).
