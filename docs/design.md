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
- **Telegram-native.** Follow Telegram’s theme and its back button, add
  haptics on selections and saves, and let alerts arrive in the chat. Use what a website can’t.
- **Honest about the numbers.** Only NEA’s 24-hour PSI and NEA’s own forecast are official,
  and the forecast keeps NEA’s wording. The 1-hour and 3-hour PSI are calculated from PM2.5, and
  the next-hours range from past readings. Wherever they appear, the copy says so in a short
  caption (“Our calculation, not official.”).

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
Components use the tokens and never hard-code a hex value. The exceptions are the game's nut
art (see *Easter egg*) and the hero sky,
which is described below.

| Group | Tokens | Notes |
|---|---|---|
| Surfaces | `--page`, `--card`, `--hairline` | Telegram `--tg-theme-*` first, our fallback second |
| Text | `--ink`, `--ink-2`, `--muted` | `--muted` only for notes and captions |
| Action | `--accent`, `--accent-ink`, `--link` | |
| PSI bands | `--band-<id>`, `--band-<id>-ink` | `good`, `moderate`, `unhealthy`, `very_unhealthy`, `hazardous`. Ordinal, checked for colour blindness |
| Regions | `--region-north` … `--region-south` | Fixed order matching `REGIONS`. Never cycled or reassigned |
| Status | `--status-good`, `--status-critical` | Feed health, errors, “Stop all alerts” |
| Haze map | `--map-sea`, `--map-land`, `--map-coast`, `--map-label`, `--haze-moderate`, `--haze-dense`, `--map-fire` | Haze hues follow NEA’s map (orange moderate, brown-red dense) so they read the same as haze.gov.sg |
| Shape | `--radius` 16px, `--gutter` 16px | |
| Motion | `--ease-out`, `--ease-in-out`, `--ease-push` | `--ease-push` only for a view a tap pushes in (a region's page) |

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
  Telegram’s safe-area insets through `--inset-top` / `--inset-bottom`.
- On phones the app asks Telegram for full screen when it opens (`requestFullscreen`, Bot API
  8.0+), whichever button opened it. Telegram’s close and menu buttons then float over the top
  of the page, which `--inset-top` leaves room for, and a strip in the page colour covers that
  band so cards don't scroll visibly behind them. Side padding (`--pad-left` / `--pad-right`) adds the notch in landscape.
  Desktop clients keep their window.
- Each section is a `.card` with a `.section-title`, an optional `.note` and its content.
- A floating tab bar at the bottom (`TabBar`), within thumb reach, splits the cards into three
  tabs: a frosted-glass pill (`backdrop-filter`, opaque without it or under reduced
  transparency) above the home indicator (`--inset-bottom`). The page leaves room for it under
  the last card, and it steps aside while the game is open (slides down and fades, 200ms).
  Like a native tab bar, touches on it never scroll the page (`touch-action: none`), and while a
  finger is on it Telegram's swipe-down-to-minimise is off, so a drag that drifts still holds.
  Its labels are 0.6875rem, under an icon, like a native tab bar. Telegram’s MainButton isn’t used, so the bottom
  edge is the bar’s alone: “Get haze alerts” is a button in the Alerts card.
  - **Now:** hero, regions, advice, alerts, share. The hero's area pill (a native select over a
    pill) picks the region the hero, advice and alerts follow, and Around the island lists it first on a
    tinted row tagged “Your area”; until someone picks, it's the highest.
  - **Outlook:** what’s ahead, wind and rain, where it’s coming from (NEA’s regional haze map), history.
  - **More:** live views, news, cigarettes, what’s new, sources (collapsed).
- A tab mounts the first time it’s opened and then stays mounted, hidden (laid out at zero
  height rather than `display: none`), so its controls keep their state, its cards rise in only
  once, charts keep their width, and Live views loads its pictures only once More is opened.
  The tab bar takes arrow keys, Home and End, and a finger can slide along it. Switching keeps the
  header scrolled away if it already was. Away from Now, Telegram’s back arrow returns to Now.
- Tap targets are at least 44px. Segmented controls and the tab bar switch on `pointerdown` for a mouse, and on
  lift for a finger, so a scroll that starts on one doesn’t change it; `:active` gives the press
  feedback straight away.
- On/off settings are drawn switches, not checkboxes. Saving one shows the change at once and undoes
  it if the save fails; the controls lock while it saves but don’t dim. “Stop all alerts” asks first
  (Telegram’s own confirm dialog).

## The hero sky

The hero card is a sky that clears or turns hazy with the band: blue for good, then grey-cream,
amber, smoky orange, and dusky purple for hazardous. Each band has its own dark-mode sky. Its
text colours are fixed per sky rather than taken from the Telegram theme, so they always
contrast with the gradient. `--ink-2` has to stay at 4.5:1 or better against the top and bottom
of the sky and the haze. Check that again whenever a sky colour changes.

The number, band and sky follow the period picked (1, 3 or 24 hours). The verdict line under
them (“Mask up.”) doesn’t: it’s the short form of What to do’s answer (`verdict()` in
`tgcloud/lib/advice.js`, the stricter of NEA’s 24-hour PSI and 1-hour PM2.5 advice, for the group
picked there), so the app never gives two different answers on what to do. The 😷 line in bot
messages is the same short form, for the general public.

## Motion

- Short and purposeful: cards rise 8px over 280ms with a small stagger, the first time a tab is
  shown; showing a tab fades it in (150ms). The hero number counts
  up once on first load (600ms, from the bottom of its band, so it never reads lower than the band shown) and moves quickly when the period changes (220ms). In Around the island, rows slide to their new places when the area changes (220ms). Buttons
  scale to 0.97 when pressed.
- The tab bar's thumb is a lens: pressed, it swells to 1.12 (160ms `--ease-out`) with a lit rim,
  like iOS's tab bar; dragged sideways it follows the finger and switches on lift (also if the
  system cancels the touch), with a rubber band past either end (a fifth of the finger's travel);
  released, it settles in 200ms. A tap slides it to the tab (200ms `--ease-in-out`); a keyboard switch jumps.
  It's frosted glass and a scale, not refraction: Telegram on iOS runs WebKit, which can't bend
  the page behind it. Reduced motion: no swell or slide.
- The hero sky is alive but calm: two haze banks drift on slow loops (28 s and 40 s), more
  opaque as the band rises (`--haze-density`), and a clear day gets a breathing sun (never in
  the dark theme). The banks are light haze behind dark ink and dark smoke behind light ink, so
  they never lower the contrast above. A band change fades the sky (280ms; the colours are
  `@property`-registered in `app.css`). Loading skeletons shimmer instead of pulsing.
- The history chart's lines draw in once (600ms, 60ms apart), the first time the chart is in
  view (`use:reveal`, so it doesn't play below the fold), then a ring pulses on the highest
  reading of the newest hour (none when no region has it; hidden while scrubbing). Changing the
  span, scale or average redraws without replaying, unless it passes through an empty span; a
  region's chart draws each time the region is opened, since that's a new view. The pulse is
  HTML over the chart, so its loop composites instead of repainting the SVG. Reduced motion:
  the lines and dot appear at once.
- The haze map's fires glow like embers (opacity, 3 s) and a ring spreads from Singapore. They’re
  separate SVG/HTML layers over the map, so the loops never repaint the coast, haze or NEA’s
  wind picture. That picture is a raster, so nothing animates along its arrows. The Wind and rain
  dial streams in the arrow's direction, faster in a stronger wind (4 s to 1.5 s a pass), only
  when the direction is clear; rain falls on the dial while it’s raining anywhere. Reduced
  motion: all of these stay still or hidden.
- Opening a region from Around the island pushes its page in from the right (a fifth of its width and a fade,
  260ms `--ease-push`, which moves the moment the finger lifts, like an iOS push); back brings
  the Now tab in from the left. The page moves as one, so the region's cards don't rise as well.
  Plain CSS rather than a View Transition, which Telegram's iOS web view didn't play. Reduced
  motion: a fade.
- Haptics: a selection tick on picks (tabs, rows, the area); a light impact on other taps
  that move to another view (the Next hours strip, closing a region with either back control);
  success or error after a save. Never unprompted.
- Looping animations go on an element with `use:ambient` (`src/lib/motion.ts`), which pauses
  them while it’s off screen, the page is hidden or Telegram has the app in the background.
  Loops animate `transform` and `opacity` only. A steady flow (streaks, rain, shimmer) is `linear`;
  a breathing or drifting loop is plain `ease-in-out`, since the curve tokens are for UI.
  Loading skeletons are the exception: they’re gone within seconds, so their shimmer doesn’t
  need pausing.
- Use `--ease-out` for things entering and `--ease-in-out` for things moving on screen, except
  a view a tap pushes in, which uses `--ease-push` so it moves the moment the finger lifts.
- Every animation has a `prefers-reduced-motion` fallback, either a plain fade or nothing. In
  JS, check `reducedMotion()` from `src/lib/motion.ts`.

## Copy

- Use sentence case, curly quotes and apostrophes, and en dashes for ranges (“60–80”).
- Times are in SGT, e.g. “updated 3 pm SGT”: minutes only when they aren’t :00 (`sgtHour`).
- Say the answer, then stop. Each fact once per message or card; a number’s label says whose it is
  (“Our 3-hr PSI”, “Official 24-hr PSI”), and how it’s worked out goes in the Mini App’s notes, not
  in chat. A note under a section is one or two short sentences.
- Bot messages, pictures and labels write “3-hr” / “24-hr PSI”; Mini App sentences may spell out
  “24-hour”.
- Errors say what happened and what to try next: “Couldn’t load the latest readings.” plus
  a Try again button (so the text doesn’t also say “try again”).
- Bot messages use Telegram HTML. Keep them short enough to read in a notification. Commands
  in `/help` follow the pattern “/command: what it does”.
- Breaking news (`formatBreaking` in `tgcloud/lib/format.js`): “🚨 Breaking:” plus the
  publisher’s headline as it is, the publisher and a “Read the story” link (with the story’s
  large preview above), then the official 24-hour PSI. It says the bot picked the story itself.
  The PSI version says “Official 24-hr PSI now Hazardous”: only NEA’s 24-hour PSI is ever
  called official.
- `/haze`, the daily update and the card caption (`formatHaze`) tell the picture’s story with
  NEA’s numbers only: the official 24-hr PSI, one line per band, worst first, saying where each
  applies (“🟠 Very unhealthy in West · 24-hr PSI 228”, “🟡 Unhealthy elsewhere · 129–186”; the
  chat’s area leads), then the last hour’s PM2.5 band by place with the time, then the advice,
  NEA’s forecast and the cigarette count. Never one band for the whole island; “elsewhere” only
  when every region has a reading, “⚪️ No reading in North” when one hasn’t, “too” on a band the
  chat’s area shares, and “;” between PM2.5 bands. The share caption is the same PSI lines, and
  inline mode’s result says “Singapore haze update” with the same words (`bandWords`).
  One closing note; the table (with our 1h/3h) only in the text version.
- Advice lines (`adviceLines`) go in one order in every message, each with its own emoji:
  👉 Outside now, 🧓 Vulnerable people (only when their advice is stricter), 😷 the short form.
- Band alerts (`formatBandAlert`) name the chat’s area (“Haze in East down to Unhealthy”), say
  “Our 3-hr PSI” and add the official 24-hr PSI, the number on the picture above them (left out
  when a folded official crossing already gives the same number). An official
  24-hour PSI crossing due to the same chat in the same tick leads that alert instead of going
  as a second message.

## States

Every section handles loading, empty and failed states. To check them outside Telegram, use
the dev toolbar (`?demo=worst|empty|error|loading`). Those last two hide every card, so a card's
own states take `?card=<card>:<state>`, comma-separated: `cameras:error|loading` for Live views and
`weather:error|loading|partial|forecast` for Wind and rain, `hazemap:error|loading|none|old` for the haze map, `ahead:range|outlook` for one half of What’s ahead. `?tab=outlook|more` opens on that tab. The
worst-case data has long names, missing readings and extreme values, so use it before shipping a
layout change.

## What’s ahead

- **NEA’s forecast** is a half-dial of the PSI bands, after haze.gov.sg’s meter (`PsiMeter.svelte`). NEA’s range is full strength over a faded dial (`meterSpan`): its numbers when it gives them (since 16 Oct 2026, “150 - 230 Unhealthy to Very Unhealthy”), shown beside the pills, else the span its words cover (a third of a band for Low, Mid or High), never under 12 PSI wide. Only the band words go inside “NEA’s words” quotes; the numbers sit outside them. A tick marks today’s official 24-hour PSI (labelled “today”, not “now”, which is our 1-hour PSI), and its label tucks under an end of the dial when it's near one. The pills sit under the dial, so large text never covers it.
- **The next few hours** are colour bars on one 0–300+ scale: faded band segments, the likely span at full strength with hard stops at band edges, and a “now” line through every row. The band names sit under each bar, with dots, so colour never stands alone.
- Neither animates. People revisit the Outlook tab, and the tab already rises in once.

## Summary card

The picture that `/haze`, alerts and the Mini App’s share button send
([`tgcloud/lib/card/summary.js`](../tgcloud/lib/card/summary.js)). It’s ours, not a copy of a
newspaper graphic:

- **The hero sky** for the worst 24-hour PSI band is the background, with the island as a soft
  light silhouette. Text on the sky uses that sky’s fixed ink, as in the hero.
- **Severity at a glance:** each region’s card is filled with its own 24-hour PSI band colour and
  outlined in white, so it stands off a sky of a similar colour. No region colours: colour only
  ever means a band.
- **No band for the whole island.** Logo, name and time, then Singapore’s flag (drawn, `drawFlag`) and “Singapore haze update” as the title; each
  region’s card carries its own band, and the caption says where each band applies (as the
  newspapers’ graphics do). A single headline band read as island-wide when only one region had it.
- **One card per region**, centred on NEA’s reference point for it (`REGIONS`), nudged so the
  cards don’t overlap and the row sits balanced over the island: name, the 24-hour PSI as the big
  number and the band in words. Under a white rule, a footer gives the last hour’s PM2.5
  (“1-hr PM2.5: 123”, no unit) in its own band’s colour (`PM25_BAND`: the PSI palette’s green,
  yellow and orange for the same severity, a red for Very high), as ST’s and CNA’s graphics do.
- **Two legend rows** of band chips: “24-hr PSI band” and “1-hr PM2.5 band”, ranges from `PSI_BANDS` and `PM25_BANDS`.
- Both numbers are NEA’s, so no “our calculation” note; the 3-hour PSI stays out of the picture.
  Missing readings show “–” on a grey card; a stale snapshot gets the amber note.
- The card is always light (it’s shared into other people’s chats), and its colours mirror the
  light-theme tokens. Change one, change both. Check layout changes against the worst-case data.

## Forecast card

The picture `/forecast` sends ([`tgcloud/lib/card/forecast.js`](../tgcloud/lib/card/forecast.js)):
the Mini App’s What’s ahead, drawn on the summary card’s sky with the same header, palette and
fonts (`backdrop` in `summary.js`), but no island: the panels would hide nearly all of it.

- **NEA’s forecast** is the half-dial: bands faded, NEA’s range at full colour (its numbers when it
  gives them, else the span its words cover: `meterSpan`, as in the app), its numbers in the bowl, a tick and “today N” for
  today’s official 24-hour PSI, and the bands it named as pills underneath. NEA’s words stay in a
  line of their own.
- **Next few hours** is one bar per step on one shared scale, the likely span in band colours over
  a faded track, a “now” line through every bar, and the band names under each bar so colour
  never stands alone. It always says “our calculation, not official”.
- Either half can be missing; the height fits what’s there. The caption carries the same facts
  in text (the range on one line), since a picture has no alt text.
- `/forecast` sends it, and so does the daily update, as a second message after the haze card
  (only while NEA has a forecast out or our range reaches past Moderate, not on clear days). If
  haze starts later in a chat’s 3-hour daily window, the picture can follow on its own.
- Check layout changes with `node scripts/card/preview.mjs`, which writes the forecast cases too.

## What’s new

User-facing changes are listed in [`src/lib/changelog.ts`](../src/lib/changelog.ts), newest
first, and shown as a card in the More tab (the latest three, older ones under “Earlier
updates”). Entries are written for users, not developers:

- A title of a few words saying what someone can now do (“Turn on alerts from here”).
- One or two sentences of detail. No file names, model versions or “refactor”.
- Behind-the-scenes changes get an entry only when users would notice them (e.g. a better
  forecast).

Each entry needs a new, unique `id`. The latest entry’s `id` is saved in Telegram `CloudStorage`
(`localStorage` outside Telegram) once the More tab has been opened. Until then, the More tab
shows a dot, and entries added since the last visit get a “New” label.

## Easter egg

Tapping the header’s logo or name opens **Hazelnut Ninja** (`src/components/HazelnutNinja.svelte`,
engine in `src/lib/ninja.ts`, ported from GameKit UI’s Fruit Ninja, MIT): slice hazelnuts, dodge
haze clouds, 60 seconds. It’s a secret, so it has **no What’s new entry** and isn't mentioned in
`/help`. The nuts copy the logo's colours; the field, blade and text follow the tokens. The code
loads only when the game is opened.
