# REVIEW.md

How to review a change to this bot, for `/code-review`, a fresh-context subagent, or a person.
Rules are in [AGENTS.md](AGENTS.md), how the parts work in
[docs/architecture.md](docs/architecture.md); this file is what to look for and how to report
it. Keep it short: it's read on every review.

## What failure looks like here

People act on this bot during a haze: they close windows, keep children in, call off a run.
A review is mostly about these, roughly in this order:

- **An alert goes wrong.** Sent twice (a claim key missing or written before the send), to the
  wrong chat or topic, for the wrong area, below a chat's `min_band`, with sound during quiet
  nights, or not at all and not resumed by the next tick (`lastBand` / the claim advanced for a
  chat that wasn't reached).
- **Breaking news fires when it shouldn't.** A headline that's speculation, a denial, a
  reopening, a feature or about another country gets through `lib/breaking-rules.js`. Every
  rule change needs the headline in `test/breaking.test.js`.
- **It lies.** Our own numbers (1-hour and 3-hour PSI, the next-hours range, the smoke lines)
  shown as NEA's, a stale reading shown as current, or “worst since” said when it isn't.
- **It breaks in the runtime but not in Node.** A `sdk` import (direct or via `store`) in a
  module the front-end or tests load; `URL`, or `setTimeout` without a fallback; a relative
  import without `.js`; an un-awaited DB call.
- **It ships before the database is ready.** A build reads a new column or table and the PR
  doesn't say `npx tgcloud migrate` comes first.
- **It costs the rate limit.** A new NEA or data.gov.sg request that isn't claimed once across
  isolates (`claimEvery`), or that the tick makes when only the Mini App needs it.
- **It leaks.** A key, token or chat id in code, a log line (the Actions logs are public) or
  an error that reaches a user. Ops messages go to `ops_chat_id`, never to users.
- **The tick overruns.** New work inside the tick without a `deadline`, or that pushes alerts
  past `BUDGET_MS`.

Also check the change does what its PR says, and on a bug fix, that it fixes the cause, not
the symptom.

## Risk tiers

Set by what the change touches, not by who (or what) wrote it.

| Tier | Paths | Review |
|---|---|---|
| High | `tgcloud/lib/alerts.js`, `alert-rules.js`, `breaking.js`, `breaking-rules.js`, `subscriptions.js`, `groups.js`, `tgcloud/schema.js`, `tgcloud/endpoints/tick.js`, `admin.js`, `.github/workflows/`, `cron/`, `scripts/deploy-guard.mjs`, `tgcloud.jsonc` | `/code-review`, `/security-review`, `/simplify`; the author reads the test output and says how to revert |
| Medium | Other `tgcloud/` code, the Mini App (`src/`) | `/code-review` and `/simplify`; UI also gets the UI skills (AGENTS.md) |
| Low | Docs, copy, `src/lib/changelog.ts`, tests only, generated files after a regenerate | Green CI |

A PR is the tier of its riskiest file.

## Skip

Generated files: `tgcloud/lib/card/glyphs.js`, `tgcloud/lib/card/art.js`,
`tgcloud/lib/psi-history.js`, `src/lib/coast.ts`, `package-lock.json`. Review the generator
or its input instead.

## How to report

- Start with a count: “3 findings (1 important)” or “Nothing to fix.” Say so plainly when it's
  clean; a clean review is a good result, not a failed one.
- Every finding names a file and line, and a concrete way it goes wrong (input or state →
  wrong result). No guesses from a name; if you didn't read the code, don't report it.
- Tag each one **Important** (would ship a bug from the list above), **Nit**, or
  **Pre-existing** (true, but not introduced by this change). At most 3 nits; drop style-only
  findings, CI and the type check catch those.
- Name the class of bug, so every instance is fixed, not only the one you saw.

## Rounds

Re-review only what changed since the last round, and don't repeat a finding that was
answered. After three rounds with Important findings, stop and question the approach instead
of patching again. Every finding gets an answer: fixed, or why not.

When the same finding keeps coming back, fix it at the source: a test, a rule in this file,
or AGENTS.md.
