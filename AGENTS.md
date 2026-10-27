# AGENTS.md

Orientation for AI coding assistants (and humans) working in this project.
This file is auto-loaded by Claude Code, Cursor, and similar tools — keep it short
and true: rules that cost something when missed, and pointers. How the parts work is in
[docs/architecture.md](docs/architecture.md); the SDK (db, Bot API, fetch, endpoints) is in
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
and copy rules in [docs/design.md](docs/design.md). A 15-minute tick (`endpoints/tick`, started
by `.github/workflows/tick.yml` and a Cloudflare Worker in `cron/`) refetches NEA and the news
and sends alerts; /haze, the Mini App and inline mode answer from what's stored.

**Read the section of [docs/architecture.md](docs/architecture.md) for the area you're
changing first**: the tick and NEA refetch, ops alerts, alerts (batching, areas, alert level,
quiet nights), breaking news, on-demand feeds (cameras, weather, haze map), what's ahead, shared
modules, the pictures, groups, secrets and admin, our numbers vs NEA's, start sources, inline
mode, the Mini App.

### Rules

- **Run `npx tgcloud migrate` before pushing** a build that reads a new column or table.
  Deploying never touches the database, and the queries fail until it's migrated.
- **People act on these numbers.** Only the 24-hour PSI and NEA's forecast are official; our
  1-hour and 3-hour PSI, the next-hours range and the smoke lines must keep saying they're ours.
- **Alerts must resume, never repeat.** A chat not reached (budget, 429) keeps its old
  `lastBand` / unclaimed key so the next tick picks it up; anything new that sends needs a claim.
- **Breaking news goes out with no one approving it.** For a misfire, add the headline to
  `test/breaking.test.js`, then tighten `lib/breaking-rules.js`. Kill switch: `admin`
  `breaking_pause`.
- **Keep NEA / data.gov.sg requests claimed once across isolates** (`claimEvery`); its rate
  limit is the one that reaches users. Cameras, weather, the haze map and the forecast are
  fetched only when the Mini App asks, never by the tick.
- **Modules shared with the front-end and tests stay pure**: no `sdk` import, direct or via
  `store`, and no DB. The list is in docs/architecture.md#shared-and-runtime-only-modules.
- **Generated files aren't edited by hand**: `tgcloud/lib/card/glyphs.js` and `art.js`
  (`npm run card:assets`), `src/lib/coast.ts` (`scripts/hazemap/coast.mjs`),
  `tgcloud/lib/psi-history.js` (`npm run psi:history`, **rerun before a deploy**).
- **Secrets live in the `settings` DB table**, set only via `endpoints/admin` from the CLI.
  Never commit or echo a key. The Actions logs are public: never print a chat id or key there.
  Ops alerts go to `ops_chat_id`, never to users.
- **`tick` and `admin` are CLI-only** (`requireCli(ctx)`), never Mini App endpoints.
- **Keep the crons in `cron/wrangler.jsonc` and `tick.yml` in step.**
- **After changing `COMMANDS`** (`lib/chat-rules.js`) rerun `admin` `{ action: 'commands' }`.
- **Outside Telegram**, `npm run dev` serves fixture data (`src/dev/`), with a
  `?demo=worst|empty|error|loading` toggle. Use it to check UI changes in the preview.
- **User-facing changes get a “What’s new” entry** in `src/lib/changelog.ts`
  (rules: docs/design.md#whats-new). The exception is the hidden Hazelnut Ninja game
  (tap the header; `src/lib/ninja.ts`, docs/design.md#easter-egg), which stays a secret.
- **New or changed UI gets a pass with the UI skills** before it's committed:
  `emil-design-eng` (polish, motion) and `mobile-native` (touch, safe areas), plus
  `break-ui` for components that show data. Keep the result consistent with docs/design.md.
- **Reviews follow [REVIEW.md](REVIEW.md)**: what failure looks like here, which paths are high
  risk and get which reviews, and how findings are reported. PRs use `.github/pull_request_template.md`.
- Checks: `npm test`, `npm run check` and `npm run build` (CI runs all three). Deploy: `npm run deploy` (+ `npx tgcloud
  migrate` after schema changes; + `npx wrangler@4 deploy --config cron/wrangler.jsonc` after
  changing `cron/`, which `npm run deploy` doesn't touch). `npm run deploy` refuses
  (`scripts/deploy-guard.mjs`) unless on a clean `main` level with `origin/main`, since `push`
  uploads whatever is on disk; never run `tgcloud push` directly. Emergency override: `DEPLOY_FORCE=1`.
  tgcloud deploys the nearest folder with a `.tgcloud/`, so a worktree needs its own (`mkdir .tgcloud`,
  then `npx tgcloud login` there) or it would deploy the main checkout; the guard refuses until it has one.

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
| `cron/`               | Cloudflare Worker that starts the tick workflow. Not part of the bot; deployed with wrangler. |
| `docs/`               | Reference docs (this project's, for you). Not deployed.           |
| `.tgcloud/`           | CLI state (credentials, snapshot, cached layout). **Never edit or read from here** — it's gitignored machine state. |

Only `.js` files under `tgcloud/` (`schema.js`, `lib/`, `handlers/`, `endpoints/`) are deployed
as code, plus — when `tgcloud.jsonc` names one — the front-end's build folder as
the Mini App's static files. Everything else (Markdown, config, `.tgcloud/`, the
front-end's sources) is local-only. Module names are relative to `tgcloud/`: the
file `tgcloud/handlers/message.js` is the module `handlers/message`.

## Mini App front-end

The front-end's **build output** (`"static"` in `tgcloud.jsonc`) is served as the Mini App at
`https://app<app_id>.tgcloud.ai/`. It's ordinary browser code with npm packages — none of the
`tgcloud/` module rules apply to it, and `tgcloud/` modules can't import it. The other keys of
`"static"` are serving config (`spa`, `immutable`, `headers`, `redirects`); `"static": false`
removes the site on the next push.

- **Build before you push.** `push` uploads the folder as it is on disk; it never runs the
  build. Use `npm run deploy`.
- Don't add `X-Frame-Options` or a restrictive `frame-ancestors`: Telegram Web opens Mini Apps
  in an iframe.
- It talks to the bot only through **endpoints**: `tgcloud/endpoints/<name>.js`, called with
  `Telegram.WebApp.Serverless.call('<name>', input, cb)` (never a hand-rolled `fetch`).
  `ctx.initData.user` is the verified caller (there is no `ctx.user`). Refuse with
  `throw new EndpointError(...)` → `400`; any other exception is a generic `500`, so never rely
  on its message reaching the client. Details: docs/tgcloud-sdk.md#endpoints-endpoints.

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
- **Not every web global exists.** There is no `URL` (split links with `HTTPS_LINK` in
  `lib/html.js`), and `setTimeout` may be missing. Node has both, so tests won't catch it: delete
  the global in the test, as `test/hazemap-parse.test.js` does for the wind picture.
- A handler module's `export default` is what the platform invokes, with the
  update's **payload** as the first argument — for `handlers/message` that's the
  `Message` (i.e. `update.message`), for `handlers/callback_query` the
  `CallbackQuery`, and so on. The full `Update` (with `update_id`) is on the
  second argument: `ctx.update`. An endpoint's `export default` gets
  `(input, ctx)` — see *Mini App front-end* above.

## Platform SDK (`import … from 'sdk'`)

- **`db`** — the database (query builder + schema DSL). Full API: [docs/tgcloud-sdk.md](docs/tgcloud-sdk.md).
- **`api`** — the Telegram Bot API. `api.<method>({...})` (e.g. `api.sendMessage`,
  `api.getMe`) returns the **unwrapped** result and **throws `BotApiError`** on
  failure (`import { BotApiError } from 'sdk'`; it has `.code`/`.description`/`.parameters`).
- **`fetch`** — outbound HTTP, web-`fetch`-like (`res.status/ok`, `res.json()`,
  `res.text()`, streaming via `for await`, redirects followed).
- **`EndpointError`** — the one way an endpoint refuses a call (see *Mini App front-end*).

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
