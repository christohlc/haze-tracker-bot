# Mini App UI audit

Audited 2026-10-16 against the public site <https://haze-tracker.pages.dev/> at phone width
(375 px), light and dark. Goal: the Mini App should look and feel like its own product, not a
copy of that site.

## The reference site, in short

- **Layout:** one long column of white cards on a light grey page. Order: headline → "Use my
  location" → PSI hero → By region → Cigarette equivalent → Haze forecast (table + chart) → Past
  24 hours chart → What to do → Data sources → credits.
- **Headline:** "How Much Haze Have You Smoked Today? - Latest Haze Updates", site name "Haze
  Tracker SG".
- **Hero:** eyebrow "PSI BASED ON", a 1-hour / 3-hour / 24-hour segmented control (3-hour
  default), a huge heavy grotesk number, an orange band pill ("Very unhealthy"), a caption, and a
  stick-figure-in-a-mask illustration with "Mask up".
- **Data presentation:** a 5-column region table (PM2.5 | 1h | 3h | 24h PSI) with a divider and
  coloured pills; a cigarette calculator (region select, outdoors slider, big number + two tiles);
  multi-line charts; a forecast table with 80 % ranges; advice list by group; source status list
  with green dots.
- **Visual style:** neutral greys, white cards, 16 px radius, heavy geometric sans, saturated
  orange/yellow band pills, black selected segment.

## Where the Mini App overlaps (before this round)

| Element | Reference | Mini App |
|---|---|---|
| Name | "Haze Tracker SG" | "Haze Tracker SG" (page title) |
| Headline | "How much haze have you smoked today?" | Same sentence as the `h1` |
| Section order | hero, regions, cigarettes, (forecast), history, advice, sources | Same, minus forecast |
| Hero | "PSI based on" + 1h/3h/24h segmented + big number + band pill | Same structure, same 3-hour default, same eyebrow text |
| Illustration | Stick figure wearing a mask, "Mask up" | Same stick figure and copy |
| Region data | 5-column table, PM2.5 uncoloured left of a divider | Same table, same divider, same explanatory note |
| Cigarette calculator | Berkeley Earth 22 µg/m³ rule, region select, % outdoors slider, 2 tiles | Same controls, same tiles, same footnote |
| History | Scale PM2.5/PSI, average 1/3/24 h, 5 region lines | Same controls and lines |
| Advice / sources | NEA advisory groups, feeds with Working dots | Same structure |
| Look | Grey page, white 16 px cards, heavy sans numerals | Same |

In short, the bot is the same page re-skinned with Telegram colours. Nothing on screen says
"Telegram bot", and nothing shows the alerts or the logo's hazelnut identity.

## Problems found

### Bugs
- **Dark mode never applied outside Telegram.** `telegram-web-app.js` reports
  `colorScheme = 'light'` in a plain browser, and `applyScheme()` trusted it over
  `prefers-color-scheme`. It also didn't follow OS scheme changes. *(Fixed this round.)*
- The hero count-up passes through lower numbers while the band pill already shows the final
  band, so the first frame can read "129 Very unhealthy". Minor; the number tween could start
  from the band's lower bound, or the pill could follow the tweened value.

### Telegram Mini App fit
- Safe areas: top uses `--tg-content-safe-area-inset-top`, bottom uses
  `--tg-safe-area-inset-bottom` / `env()`. Good. Left/right insets (landscape, notches) aren't
  applied.
- themeParams: page/card/text/hint/button/link colours map to Telegram's theme. Good. The band
  and chart colours are fixed per scheme, which is right. Header and background colours are set
  to `secondary_bg_color`.
- Not used: **MainButton** (obvious home for "Get haze alerts"), **BackButton** (no detail
  views yet), **SettingsButton**, `HapticFeedback` beyond segmented selection, `CloudStorage`
  (could remember the user's region / period).
- `/subscribe` and `/alerts` exist in the bot but are invisible in the app.

### Accessibility and touch
- Segmented buttons were 32 px tall, below the 44 px touch guideline. *(Fixed this round.)*
- Region table pills shrink to 12 px text at ≤360 px; five dense columns are hard to scan on a
  phone. *(Replaced this round.)*
- The hero number has `aria-live="polite"` on a tweened value, so screen readers may announce
  intermediate numbers. Better: live-region the final value only.
- Band meaning relies on pill colour plus label; fine. Chart lines rely on colour alone (legend
  helps, but no direct labels).
- No visible focus styles on custom controls beyond browser defaults.

### General UX
- The page is long and flat: six equal-weight cards. The first screen spends most of its height
  on a control and an illustration rather than the answer ("Is it bad? What should I do?").
- Lots of explanatory paragraphs in grey; good for trust, heavy for a glanceable bot.
- Sources is always expanded at the bottom; most users don't need it.

## Ways to differentiate, ranked

1. **Brand identity** — new name "I'm going hazelnuts!", hazelnut palette from the logo
   (shell brown, clear-sky blue, haze amber), rounded display numerals, wordmark header with a
   live "updated" line instead of the reference's headline. *(Done this round.)*
2. **"Sky" hero** — the hero card is a sky that clears or hazes with the band (blue → amber →
   smoky brown → purple), echoing the logo, with the verdict ("Mask up") in the card instead
   of the stick figure, and the period as chips at the bottom. *(Done this round.)*
3. **Region list tied to the hero** — one PSI per region for the period picked in the hero,
   shown as band-coloured bars, PM2.5 as secondary text, instead of the 5-column table.
   *(Done this round.)*
4. **Alerts in the app** — a "Get haze alerts" Telegram **MainButton** that subscribes in one
   tap (needs a `subscribe` endpoint), and an alerts status chip in the header. This is the
   biggest thing the website can't do. *(Round 2; needs backend.)*
5. **Forecast in the hero** — a "next 6 hours" strip under the number, rather than a separate
   table like the reference. *(Done: our next-hours range sits under the reading and opens
   Outlook.)*
6. **Telegram-native structure** — section headers outside cards (Telegram settings style),
   collapsible Data sources, BackButton for detail views (e.g. tap a region for its own chart),
   haptics on slider and region taps, remember region/period in `CloudStorage`.
   *(Collapsible Data sources, BackButton from the Outlook/More tabs, and tapping a region for
   its own view with a 7-day chart and a selection haptic: done.)*
7. **Re-order** — Now → Forecast → Regions → What to do → Cigarettes → History → Sources, so
   advice sits near the answer. *(Wait for the forecast merge; it touches the same lines of
   `App.svelte`.)* *(Superseded: the cards are now in Now / Outlook / More tabs, with advice
   on Now; see docs/design.md#layout.)*
8. **Reframe the cigarette calculator** — keep the joke, change the presentation (e.g. a row of
   cigarette glyphs filling up, share-to-chat button via `switchInlineQuery`).

## Round 1 (this branch)

- `src/app.css`: brand tokens (`--brand-*`), rounded display font stack, hazelnut accent when
  not in Telegram.
- `src/lib/telegram.ts`: dark mode follows the OS outside Telegram.
- `src/components/BrandHeader.svelte` (new): logo, wordmark, live status line.
- `src/components/Hero.svelte`: sky card, verdict, chips; `period` is bindable.
- `src/components/RegionTable.svelte`: bar list for the selected period.
- `src/components/Segmented.svelte`: 44 px tap targets.
- `src/App.svelte`: header swap and shared `period` only; section order unchanged for an easy
  merge with the forecast work.
