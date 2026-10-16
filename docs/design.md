# Design

How the Mini App and the bot should look, read and behave. The reasoning behind the current
look is in [ui-audit.md](ui-audit.md); this file holds the rules that came out of it. When
code and this file disagree, fix one of them.

## Product stance

- **Answer first.** The first thing on screen answers “is it bad, and what do I do?”: the PSI,
  its band and a verdict (“Mask up.”). Detail comes after that.
- **Its own product.** The data and maths are the same as the public Haze Tracker SG site, but
  the Mini App shouldn’t look like a copy of it. The name, palette, sky hero and region bars are
  what set it apart; keep them.
- **Telegram-native.** Follow Telegram’s theme, use the MainButton for the main action, add
  haptics on selections and saves, and let alerts arrive in the chat. Use what a website can’t.
- **Honest about the numbers.** Only NEA’s 24-hour PSI is official. The 1-hour and 3-hour PSI
  are calculated from PM2.5, and the forecast comes from a model. Wherever they appear, the copy
  says so in a short caption (“Our calculation, not official.”).

## Brand

- **Name:** “I’m going hazelnuts!” (with a curly apostrophe). It appears in the header, `/help`
  and the welcome picture.
- **Logo:** a hazelnut in haze ([`public/logo.svg`](../public/logo.svg)); the BotFather
  picture is in [`brand/`](../brand/).
- **Colours:** shell brown `--brand-shell` (#8a5a2e light, #c88b4f dark) and haze amber
  `--brand-haze` (#e2b84a). Outside Telegram the accent is shell brown. Inside Telegram,
  `--accent` follows the user’s theme button colour.
- **Tone:** plain and calm, with a light joke now and then (the name, the cigarette count).
  Never make a joke about health advice.

## Tokens

Every colour, radius and easing is a CSS custom property in [`src/app.css`](../src/app.css).
Components use the tokens and never hard-code a hex value. The one exception is the hero sky,
which is described below.

| Group | Tokens | Notes |
|---|---|---|
| Surfaces | `--page`, `--card`, `--hairline` | Telegram `--tg-theme-*` first, our fallback second |
| Text | `--ink`, `--ink-2`, `--muted` | `--muted` only for notes and captions |
| Action | `--accent`, `--accent-ink`, `--link` | |
| PSI bands | `--band-<id>`, `--band-<id>-ink` | `good`, `moderate`, `unhealthy`, `very_unhealthy`, `hazardous`. Ordinal, checked for colour blindness |
| Regions | `--region-north` … `--region-south` | Fixed order matching `REGIONS`. Never cycled or reassigned |
| Status | `--status-good`, `--status-critical` | Feed health, errors, “Stop all alerts” |
| Shape | `--radius` 16px, `--gutter` 16px | |
| Motion | `--ease-out`, `--ease-in-out`, `--ease-drawer` | `--ease-drawer` for bottom sheets |
| Overlay | `--scrim` | Behind modal sheets |

Dark mode sets `:root[data-theme='dark']`. `src/lib/telegram.ts` takes the scheme from Telegram
or, outside Telegram, from the OS. A new colour token needs both a light and a dark value.

## Type

- **Display** (`--font-display`, a rounded system stack): the wordmark, section titles and big
  numbers. Weight 650–800, slightly tight letter-spacing.
- **Body:** the system UI font, 100%/1.45.
- **Numbers that change or sit in columns** use `.num` (tabular figures).
- Sizes: notes and captions 0.8125rem; body 1rem; section titles 1.0625rem; the hero number
  `clamp(4.5rem, 24vw, 6.5rem)`.
- Inputs are 16px so iOS doesn’t zoom in on focus.

## Layout

- One column, at most 720px wide, with 16px gutters and 12px between cards. Padding respects
  Telegram’s safe-area insets.
- Each section is a `.card` with a `.section-title`, an optional `.note` and its content.
- Section order: header, hero, alerts, regions, cigarettes, forecast, history, advice, news, sources.
  [ui-audit.md](ui-audit.md) proposes moving advice and the forecast up; that change is still
  open.
- Tap targets are at least 44px. Segmented controls and chips switch on `pointerdown` so they
  respond straight away.

## The hero sky

The hero card is a sky that clears or turns hazy with the band: blue for good, then grey-cream,
amber, smoky orange, and dusky purple for hazardous. Each band has its own dark-mode sky. Its
text colours are fixed per sky rather than taken from the Telegram theme, so they always
contrast with the gradient. `--ink-2` has to stay at 4.5:1 or better against the top and bottom
of the sky and the haze. Check that again whenever a sky colour changes.

## Motion

- Short and purposeful: cards rise 8px over 280ms with a small stagger. The hero number counts
  up once on first load (600ms) and moves quickly when the period changes (220ms). Buttons
  scale to 0.97 when pressed.
- Use `--ease-out` for things entering and `--ease-in-out` for things moving on screen.
- Every animation has a `prefers-reduced-motion` fallback, either a plain fade or nothing. In
  JS, check `reducedMotion()` from `src/lib/motion.ts`.

## Copy

- Use sentence case, curly quotes and apostrophes, and en dashes for ranges (“60–80”).
- Times are in SGT, e.g. “updated 3 pm SGT”.
- Errors say what happened and what to try next: “Couldn’t load the latest readings.” plus
  a Try again button.
- Bot messages use Telegram HTML. Keep them short enough to read in a notification. Commands
  in `/help` follow the pattern “/command: what it does”.

## States

Every section handles loading, empty and failed states. To check them outside Telegram, use
the dev toolbar (`?demo=worst|empty|error|loading`). Those last two hide every card, so Live
views also takes `?cams=error|loading` for its own. The worst-case data has long names,
missing readings and extreme values, so use it before shipping a layout change.

## Summary card

The picture that `/haze`, alerts and the Mini App’s share button send
([`tgcloud/lib/card/summary.js`](../tgcloud/lib/card/summary.js)). It’s ours, not a copy of a
newspaper graphic:

- **Colour means one thing:** each region’s card is filled with its 24-hour PSI band colour, on a
  quiet off-white page with the island in light grey. No region colours, no second palette for
  PM2.5, so the severity of each region reads at a glance.
- **Answer first:** logo and name, then the band in big type and “24-hr PSI up to N in Region”.
- **One card per region**, placed roughly where the region is: name, the 24-hour PSI as the big
  number, the band in words, and the 1-hour PM2.5 as plain text.
- **One legend row** of band chips (“Card colour: 24-hr PSI band”), ranges from `PSI_BANDS`.
- Both numbers are NEA’s, so no “our calculation” note; the 3-hour PSI stays out of the picture.
  Missing readings show “–” on a grey card; a stale snapshot gets the amber note.
- The card is always light (it’s shared into other people’s chats), and its colours mirror the
  light-theme tokens. Change one, change both. Check layout changes against the worst-case data.

## What’s new

User-facing changes are listed in [`src/lib/changelog.ts`](../src/lib/changelog.ts), newest
first, and shown in a sheet opened from the header. Entries are written for users, not
developers:

- A title of a few words saying what someone can now do (“Turn on alerts from here”).
- One or two sentences of detail. No file names, model versions or “refactor”.
- Behind-the-scenes changes get an entry only when users would notice them (e.g. a better
  forecast).

Each entry needs a new, unique `id`. The latest entry’s `id` is saved in Telegram `CloudStorage` (`localStorage` outside Telegram)
once the sheet has been opened. Until then, the header button shows a dot.
