# AGENTS.md

Orientation for AI coding assistants (and humans) working in this project.
This file is auto-loaded by Claude Code, Cursor, and similar tools — keep it short
and true. For the full SDK reference (db, Bot API, fetch), see
[docs/tgcloud-sdk.md](docs/tgcloud-sdk.md).

## What this project is

A **Telegram Mini App bot** running on Telegram's serverless platform. You write
JavaScript modules (database schema, shared library code, update handlers); the
platform runs them in a V8 isolate. The `tgcloud` CLI syncs this local project
with the bot's cloud environment — think `wrangler`/`vercel` + `drizzle-kit`.

There is no server to run locally and no `node_modules` to import from at runtime:
the only things available inside a module are the platform SDK and other modules
in this project.

## This bot: “I’m going hazelnuts!”

Singapore haze bot + Mini App. User-facing overview in [README.md](README.md); visual
and copy rules in [docs/design.md](docs/design.md). Things that aren't obvious from the code:

- **The 15-minute job is `endpoints/tick`**, run by `.github/workflows/tick.yml` (the
  platform has no scheduler). A Cloudflare Worker cron (`cron/`, deployed separately with wrangler,
  README#the-15-minute-tick) starts it through the workflow_dispatch API, because GitHub's
  `schedule` drops most runs; the `schedule` stays as a backstop. Keep the crons in
  `cron/wrangler.jsonc` and `tick.yml` in step. It refreshes NEA, then the news, then sends alerts.
  `tick` and `admin` call `requireCli(ctx)`: they're CLI-only, never Mini App endpoints.
  The repo is public (free Actions minutes); a weekly `keepalive` job in the same workflow
  stops GitHub's 60-day pause of scheduled workflows.
  NEA is refetched only until the current hour is published and news about hourly (every run
  while some PSI is above 100, for breaking news); the extra runs are for alerts a previous run
  didn't reach. `{"force":true}` refetches NEA and news regardless.
- **Alerts go out in batches of 25/s within a ~20 s budget** (`runBatched` in `lib/alert-rules.js`).
  Whoever isn't reached (budget, 429) keeps their old `lastBand` / unclaimed key and the next tick
  resumes. Breaking news gets the first 6 s after the news fetch, band alerts run until 12 s, so
  daily updates aren't starved. The run limit of
  `tgcloud run` isn't documented; tune `BUDGET_MS` in `lib/alerts.js`. Pacing needs
  `setTimeout`: the tick's `alerts.paced` says whether the runtime has it (if not, batches run
  back to back and a 429 ends the run).
- **Breaking news is sent automatically, with no one approving it.** `lib/breaking-rules.js`
  picks a story when its headline has a topic (schools closing / HBL, outdoor activities or sports
  called off, free masks, MOM advisories), mentions haze (headline or description), is under 6 h
  old, and has no denial, maybe (“if”, “could”, “considering”), reopening, question mark,
  feature/explainer word (“what to know”, “takes a toll”, “commentary”) or other country in it. Only while some PSI is above 100, one event per topic per SGT day, at most 3 a
  day. The official 24-hour PSI rising into Very unhealthy or Hazardous is an event too, once per
  band per SGT day. Events live in `state('breaking')` for 48 h and are sent for 12 h (claims
  `breaking:<id>:<chat>`). Kill switch: `admin` `breaking_pause` / `breaking_cancel` (a cancel
  can lose a race with a running tick's write; check `status`); `breaking_test` sends one to a
  single chat. When a misfire is reported, add the headline to `test/breaking.test.js` and
  tighten the rules. **Run `npx tgcloud migrate` before pushing** a build that reads
  `breaking_alerts`, or the alert queries fail.
- **Camera pictures (`endpoints/getCameras`) are fetched only when the Mini App asks**, cached
  for 60 s in `state('cameras')`, never by the tick. Since 30 June 2026 LTA runs only the 8
  checkpoint and Sentosa cameras; names come from `CAMERAS` in `lib/cameras-parse.js`.
- **Wind and rain (`endpoints/getWeather`) is fetched the same way**: only when the Mini App asks,
  cached for 5 min in `state('weather')`. It reads NEA's station feeds, and the “coming from Sumatra”
  line (`smokeLine` in `lib/weather-parse.js`) is our reading, not NEA's.
- **What's ahead (`lib/ahead.js`) has no model.** NEA's 24-hr PSI forecast comes from the
  undocumented JSON behind haze.gov.sg (`lib/outlook.js`, cached 30 min in `state('outlook')`,
  fetched only by /haze, /forecast and the dashboard). NEA issues it about 6 pm, during haze
  episodes only, so null is the usual answer. The next-hours range (`lib/range.js`) is worked out
  from the last 14 days of `readings` and needs at least 72 hours; the tick stores only today and
  yesterday, so after a fresh start or a gap fill it with `admin` `{ action: 'backfill', days: 14 }`
  (one NEA request per day, 1 s apart, ~20 s budget; rerun until `remaining` is empty). The runtime
  may lack `setTimeout`: then it waits with `Atomics.wait`, or, if that's missing too, fetches at most
  5 days per run back to back (`paced: false` in the result), so rerun a minute later.
- **Some `tgcloud/lib/` modules are shared with the front-end and tests**
  (`psi`, `cigs`, `advice`, `alert-settings`, `alert-rules`, `breaking-rules`, `format`, `snapshot`,
  `outlook-parse`, `range`, `html`, `time`, `news-parse`, `cameras-parse`, `weather-parse`, `chat-rules`,
  `card/geometry|png|raster|summary|glyphs|art`). Keep these pure: no `sdk` import, no DB, so
  Vite and `node --test` can load them. Modules that touch `sdk`, directly or via `store`, are
  `store`, `nea`, `refresh`, `alerts`, `breaking`, `subscriptions`, `cli-only`, `outlook`, `ahead`,
  `news`, `cameras`, `weather`, `bot-errors`, `messages`, `card/send`, `http`, `feed-cache`, `groups`,
  `buttons`.
- **The summary picture (`tgcloud/lib/card/`) is drawn in plain JS**: the runtime has no canvas,
  fonts or zlib, so `png.js` has its own deflate and `glyphs.js` / `art.js` are pre-rendered
  bitmaps **generated** by `npm run card:assets` (fonts in `scripts/card/fonts/`, island outline
  in `scripts/card/singapore.svg`). Don't edit them by hand. `card/send` uploads it once per
  snapshot and reuses Telegram's file id (state `card`); if the photo fails, the text goes instead.
  Check a layout change with `node scripts/card/preview.mjs <dir>`.
- **The bot works in groups** (`lib/chat-rules.js`, `lib/groups.js`). A group subscribes as one
  chat; only its admins (`getChatMember`) may change alerts. Alerts go to the forum topic `/subscribe`
  was sent in (`subscribers.thread_id`; cleared if the topic is deleted), and a group upgraded to a
  supergroup takes its subscription along (`migrate_to_chat_id`). In groups most commands are
  **ephemeral** (Bot API 10.2+, `COMMANDS` in `chat-rules.js`): the command and the bot's reply are
  seen only by the sender, and the reply must go within 15 s. The menus are set by `admin`
  `{ action: 'commands' }`; rerun it after changing `COMMANDS` (which /help is built from too).
  Answers go through `answer` in `lib/messages.js`, which falls back down `answerTargets` when
  Telegram refuses an ephemeral send. web_app buttons don't work in groups, so the dashboard
  button there is a t.me link (main Mini App if set in BotFather; getMe is cached per isolate). **Run `npx tgcloud migrate` before pushing**
  a build that reads `thread_id`.
- **Secrets live in the `settings` DB table**, set only via `endpoints/admin` from the
  CLI. Never commit or echo a key.
- **1-hour and 3-hour PSI and the next-hours range are our own calculations**, not NEA's.
  Copy must keep saying so; only the 24-hour PSI and NEA's forecast are official.
- **Outside Telegram**, `npm run dev` serves fixture data (`src/dev/`), with a
  `?demo=worst|empty|error|loading` toggle. Use it to check UI changes in the preview.
- **User-facing changes get a “What’s new” entry** in `src/lib/changelog.ts`
  (rules: docs/design.md#whats-new). The exception is the hidden Hazelnut Ninja game
  (tap the header; `src/lib/ninja.ts`, docs/design.md#easter-egg), which stays a secret.
- **New or changed UI gets a pass with the UI skills** before it's committed:
  `emil-design-eng` (polish, motion) and `mobile-native` (touch, safe areas), plus
  `break-ui` for components that show data. Keep the result consistent with docs/design.md.
- Checks: `npm test` and `npm run check`. Deploy: `npm run deploy` (+ `npx tgcloud
  migrate` after schema changes).

## Layout

Everything the platform runs lives in the **`tgcloud/`** folder. The rest of the
project root is yours (a mini-app front-end, config, docs).

| Path                  | What it is                                                        |
|-----------------------|-------------------------------------------------------------------|
| `tgcloud/schema.js`   | Database schema — tables as **named exports**. One file.          |
| `tgcloud/lib/`        | Shared modules. Subdirectories allowed (`lib/internal/util.js`).  |
| `tgcloud/handlers/`   | Update handlers, **one level only**. Names match Telegram Bot API update types (`message`, `callback_query`, …). |
| `tgcloud/endpoints/`  | Functions the Mini App calls (`POST /api/<name>`), **one level only**. |
| `tgcloud.jsonc`       | Project config. Its `"static"` block names the build folder hosted as the Mini App. |
| `docs/`               | Reference docs (this project's, for you). Not deployed.           |
| `.tgcloud/`           | CLI state (credentials, snapshot, cached layout). **Never edit or read from here** — it's gitignored machine state. |

Only `.js` files under `tgcloud/` (`schema.js`, `lib/`, `handlers/`, `endpoints/`) are deployed
as code, plus — when `tgcloud.jsonc` names one — the front-end's build folder as
the Mini App's static files. Everything else (Markdown, config, `.tgcloud/`, the
front-end's sources) is local-only. Module names are relative to `tgcloud/`: the
file `tgcloud/handlers/message.js` is the module `handlers/message`.

## Mini App front-end

If the project root holds a front-end (Vite, React, Vue, …), its **build output**
is deployed next to the bot and served as the Mini App at
`https://app<app_id>.tgcloud.ai/` — `push` prints the exact URL.

- `tgcloud.jsonc` → `{ "static": { "source": "dist" } }` — `source` names the
  build folder; the other keys of the `static` object are the serving config
  (e.g. `"spa": true` serves `index.html` for unknown extension-less paths —
  client-side routing; `immutable`, `headers`, `redirects`). `tgcloud init` writes
  the file when it recognizes the front-end; after that it's a normal project
  file. JSON with comments and trailing commas (a project may use a strict-JSON
  `tgcloud.json` instead — never both). `"static": "dist"` is accepted as a
  shorthand for `{ "source": "dist" }`.
  `"static": false` removes the deployed site on the next push.
- **Build before you push.** `push` uploads the folder as it is on disk; it never
  runs the build. `npm run deploy` (build + push) is the safe default.
- The front-end is ordinary browser code with npm packages — none of the
  `tgcloud/` module rules apply to it, and `tgcloud/` modules can't import it.
  It talks to the bot's code only through **endpoints** (below).
- The site is served from the host root, so the bundler's default `base` (`/`)
  is right. Don't add `X-Frame-Options` or a restrictive `frame-ancestors`:
  Telegram Web opens Mini Apps in an iframe.

## Endpoints — the Mini App's server side

`tgcloud/endpoints/<name>.js` is called by the Mini App as `POST /api/<name>` on
the same host as the static site. Use it for anything the front-end can't do
itself: the database, the Bot API, secrets.

- `export default async function (input, ctx)` — `input` is the JSON body (an
  object); the return value goes back as JSON.
- `ctx.initData` is the Mini App's init data **verified by the platform** (same
  shape as `Telegram.WebApp.initDataUnsafe`): `ctx.initData.user` is the caller.
  There is no `ctx.user`. Invalid init data → `401`, the endpoint never runs.
- Refuse with `throw new EndpointError('Out of stock', { code: 'OUT_OF_STOCK' })`
  (`import { EndpointError } from 'sdk'`) → `400`, the Mini App gets
  `description` + `parameters`. Any other exception → generic `500`; never
  rely on its message reaching the client.
- Front-end call: `Telegram.WebApp.Serverless.call('<name>', input, (err, result) => …)`
  from the official `telegram-web-app.js` — it sends the init data; `err` has
  `message` (description), `type` (`'ENDPOINT_ERROR'` for your `EndpointError`)
  and `parameters`. Don't hand-roll `fetch` + init data.
- Names: letters, digits, `_`, not starting with a digit (`getProfile`).
  Scaffold with `npx tgcloud add endpoints/<name>`; test with
  `npx tgcloud run endpoints/<name> '{}' --ctx '{ initData: { user: { id: 1 } } }'`.

## Module system — the rules that bite

- **Import project modules by relative path WITH the `.js` extension; import
  the SDK by name.** (from `tgcloud/handlers/message.js`:)
  - ✅ `import { users } from '../schema.js'`
  - ✅ `import { addItem } from '../lib/cart.js'`
  - ✅ `import { db, api, fetch } from 'sdk'` / `import { eq, sql } from 'sdk/db'`
  - ❌ `import { users } from '../schema'` → a relative import must end in `.js`
  - ❌ `import x from '../../src/x.js'` → nothing outside `tgcloud/` is reachable
  - A module's *name* is its path inside `tgcloud/` without `.js` (`lib/cart`);
    `tgcloud run` takes it, and `from 'lib/cart'` (no extension) also resolves —
    but write relative imports.
- **No filesystem, no npm packages** at runtime. Only `sdk` (and its submodules
  like `sdk/db`) and your own project modules exist.
- A handler module's `export default` is what the platform invokes, with the
  update's **payload** as the first argument — for `handlers/message` that's the
  `Message` (i.e. `update.message`), for `handlers/callback_query` the
  `CallbackQuery`, and so on. The full `Update` (with `update_id`) is on the
  second argument: `ctx.update`. An endpoint's `export default` gets
  `(input, ctx)` — see *Endpoints* above.

## Platform SDK (`import … from 'sdk'`)

- **`db`** — the database (query builder + schema DSL). Full API: [docs/tgcloud-sdk.md](docs/tgcloud-sdk.md).
- **`api`** — the Telegram Bot API. `api.<method>({...})` (e.g. `api.sendMessage`,
  `api.getMe`) returns the **unwrapped** result and **throws `BotApiError`** on
  failure (`import { BotApiError } from 'sdk'`; it has `.code`/`.description`/`.parameters`).
- **`fetch`** — outbound HTTP, web-`fetch`-like (`res.status/ok`, `res.json()`,
  `res.text()`, streaming via `for await`, redirects followed).
- **`EndpointError`** — the one way an endpoint refuses a call (see *Endpoints*).

## Database — the rules that bite

Full API in [docs/tgcloud-sdk.md](docs/tgcloud-sdk.md). The non-obvious parts:

- **Every DB call is async — always `await`.** `.all()`, `.get()`, `.values()`,
  `.run()`, `db.$count()` and the raw `db.run/all/get` all return Promises.
- **No foreign keys.** `.references()` and `foreignKey()` **throw at declaration**
  — the runtime runs with FKs off, so they'd be silently inert. Enforce integrity
  in application code (delete children before parents, etc.).
- **Drops happen only via `.deprecated('reason')`** on a column/table/index.
  Deleting the declaration does *not* drop anything.
- **Type changes aren't automatic** — do them by hand with `db.run(...)`.

## Deploy & migrate workflow

**Deploying never touches the database.** Schema sync is a separate, explicit step.

The CLI is a local dev-dependency, so run it with `npx tgcloud <command>` (or use
the `npm run` scripts in package.json — e.g. `npm run deploy`):

```
npx tgcloud status     # what changed locally vs the cloud
npx tgcloud push       # deploy modules (and the static build) to the cloud
npx tgcloud migrate    # apply tgcloud/schema.js changes to the database (interactive)
npx tgcloud run <module> [args]   # execute a handler or endpoint server-side
npx tgcloud pull       # bring the local project in line with the cloud
npx tgcloud login      # link this project to a bot
npx tgcloud webhook    # show the bot's webhook and whether it matches your handlers
```

After you change `tgcloud/schema.js`, `push` reports what the DB *would* change but applies
nothing — run `npx tgcloud migrate` to actually apply it.

The platform manages the bot's webhook for you, derived from your deployed
`handlers/*`, and refreshes it on `push`. If it ever drifts — e.g. someone called
`setWebhook` with the raw bot token — `npx tgcloud webhook` shows the mismatch and
`npx tgcloud webhook sync` repairs it.
