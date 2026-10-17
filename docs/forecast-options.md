# Forecast: keep the model, or use NEA’s outlook?

Status: decided and shipped (option b): NEA’s outlook plus the range, no model. Written 16 Oct 2026;
kept for the reasoning. The current design is in [README.md](../README.md#whats-ahead).

**Recommendation: option (b).** Show NEA’s official 24-hr PSI forecast for tomorrow whenever
NEA has issued one. Replace our model with a plain “likely to stay around X” range for the next
few hours, worked out from our own readings. Drop Open-Meteo and the Python training pipeline.

## 1. What NEA publishes

### The feed: `latesthazesituationupdate` (JSON)

haze.gov.sg’s “Haze Situation Update” box is filled in by the page’s own script from:

```
GET https://www.nea.gov.sg/api/advisory/latesthazesituationupdate/<unix-seconds>
```

- The last path segment only busts the cache. `/0`, `/1` and no segment at all return the same
  body. We’d call it with `Date.now()` like the site does. It needs no key, comes back
  `200 application/json`, `cache-control: no-cache`, about 8 KB. It also works without a browser
  user agent; we’d send our usual `USER_AGENT` from `lib/http.js` anyway.
- Response on 16 Oct 2026 at 18:31 SGT (HTML fields shortened):

  ```json
  {
    "AirQualityBlurb": "24-hr PSI Forecast: Unhealthy to Low Very Unhealthy",
    "HealthAdvisoryBlurb": "<strong>Healthy persons:&nbsp;</strong>If 24-hr PSI is Very Unhealthy, …",
    "BodyText": "<div><strong>Singapore, 15 October 2026</strong> &ndash; <strong>The 24-hr PSI forecast for 16 Oct 2026 is </strong><strong><span …>Unhealthy to Low Very Unhealthy</span></strong>. …</div> … (numbered paragraphs: situation, tomorrow, weekend, activity guidelines, masks)",
    "DateOfArticle": "2026-10-15T18:19:00+08:00",
    "BoldItalicLabel": "<b><i>Refer to the 1-hr PM2.5 for immediate activities, and the 24-hr PSI forecast to plan ahead.</b></i>",
    "ExpiryDateHazeDisplayDt": null,
    "ExpiryDateHazeDisplay": ""
  }
  ```

- **What it gives:** a **band range in words**, one value for the whole island. There are no PSI
  numbers and no per-region values. The words sometimes include sub-band qualifiers: “Low”,
  “Mid” and “High” (e.g. “High Moderate to Mid Unhealthy”), and the separator is either “to” or
  an en dash.
- **What it covers:** the **24-hr PSI** for the **next calendar day**. The date is in `BodyText`
  (“The 24-hr PSI forecast for 16 Oct 2026 is …”), not in its own field.
- **When it’s issued:** **daily at about 6 pm SGT during a haze episode.** I checked the
  matching advisory pages at
  `https://www.nea.gov.sg/media/news/advisories/index/haze-situation-update-<d>-<month>-2026`.
  Each page from 16 Sep to 15 Oct 2026 carries a “24-hr PSI Forecast: …” line. 1–15 Sep has
  none, and 16 Oct hadn’t been issued yet at 18:31. (Those URLs return 200 even when the page
  doesn’t exist, so “no forecast line” is the test, not the status code.) In the forecasts so far,
  “Moderate – Low Unhealthy” (16 Sep) climbs to “Unhealthy to Low Very Unhealthy” (9 and 15 Oct).
- **Outside an episode:** NEA most likely stops issuing. The endpoint then either keeps returning
  the last update, or sets `ExpiryDateHazeDisplay` (the site hides the box once that date has
  passed), or returns `null`. That’s an assumption, not something I observed. So we must check
  that the forecast date is today or tomorrow, as well as checking the expiry date.
- **It isn’t a documented API.** It’s the endpoint NEA’s own haze site uses, so its shape can
  change without notice. Parse it defensively and fall back to showing nothing.

### What isn’t there

- **data.gov.sg v2 real-time APIs:** `psi`, `pm25`, `twenty-four-hr-forecast`, `four-day-outlook`
  and `two-hr-forecast` all work, but they hold readings or *weather* forecasts only (e.g.
  `twenty-four-hr-forecast` says “Thundery Showers”, with wind and temperature). Guessed haze
  routes such as `/v2/real-time/api/haze-outlook` and `/psi-forecast` return
  `{"code":28,"name":"NOT_FOUND"}`. The catalogue has historical 24-hr PSI as CSV but no haze
  outlook dataset.
- **haze.gov.sg** has no feed of its own. `/api/airquality/jsondata/<t>` returns the past-24-hour
  chart series (PSI, PM2.5, PM10, gases), with no forecast. The hotspot, wind and haze-boundary
  layers are KML/PNG files.
- **“Weather and Haze Outlook”** on haze.gov.sg is a regional ASEAN outlook in prose (from ASMC),
  written into the page’s HTML. It has no band or number we could show.

## 2. How our forecast compares

What we have now (`tgcloud/lib/forecast/*`, `scripts/train/*`): a quantile linear model for each
horizon (+1, 2, 3, 6 and 24 h) that predicts the **island-wide 1-hour PSI** we calculate
ourselves. It runs once per NEA hour from `tick`, `/haze`, `/forecast` and `getDashboard`.

The backtest (`scripts/train/report.json`, model v4, trained 16 Oct) says:

| Horizon | Test MAE | Persistence MAE | Model vs “same as now” |
|---------|---------:|----------------:|------------------------|
| +1h     | 6.53     | 6.54            | the same               |
| +2h     | 10.98    | 10.90           | 0.7% worse             |
| +3h     | 14.97    | 14.82           | 1.0% worse             |
| +6h     | 25.43    | 24.72           | 2.9% worse             |
| +24h    | 28.54    | 29.16           | 2.1% better            |

- The test window is **8 days** (8–16 Oct, n = 192 hours, 176 for +24h), all inside one episode.
  The gaps above are noise at that size.
- Feature selection already kept only **time of day + Singapore rain**. All the Open-Meteo
  air-quality points upstream (Riau, Jambi, Palembang, Batam, Kalimantan) were dropped. What’s
  left is persistence with a small time-of-day nudge and an error band. The “biggest factor”
  sentence is explaining effects of about 1 PSI.
- Its 80% ranges are honest (test coverage 0.84–0.91). That calibrated range is the one useful
  part, and option (b) keeps it without the model.
- **It answers a different question from NEA.** Ours is the 1-hour PSI at a given hour. NEA’s
  is tomorrow’s 24-hr PSI band, the number the health advice is keyed to. They don’t compete
  head to head: NEA’s covers “plan tomorrow”, ours “the next few hours”, which is where
  persistence is hard to beat anyway.

## 3. Options

| | (a) Keep the model | (b) NEA outlook + persistence range | (c) NEA outlook only |
|---|---|---|---|
| Official? | No | Tomorrow: yes. Next hours: our calculation | Yes |
| Shown outside episodes | Always | Range always; NEA line only when issued | Nothing (section hidden) |
| Outside dependencies | Open-Meteo, Python/uv, retraining | NEA JSON only | NEA JSON only |
| Code | ~270 lines of JS + ~530 of Python + generated model + vectors test | ~60 lines (parse + range) | ~40 lines |
| Maintenance | Retrain each season; the backtest gets stale; Open-Meteo outages | Parser breaks if NEA changes the page | Same as (b) |
| Accuracy | ≈ persistence | Persistence (same) + NEA’s forecasters | NEA only |

**Why (b):** it’s as accurate as today for the next few hours, adds NEA’s own forecast for the
question users actually plan around, and drops a training pipeline that buys nothing measurable.
(c) leaves the Mini App with nothing ahead most of the year and loses the 1-hour view, which the
1-hr PM2.5 advice (“for immediate activities”) needs. (a) only makes sense if a longer backtest
over more episodes shows a real gain, and today’s numbers don’t.

## 4. Plan for (b)

### Server

1. **`tgcloud/lib/nea-outlook-parse.js`** (new, pure; add to the shared list in AGENTS.md):
   `parseOutlook(json)` → `{ text, fromBand, toBand, forDate, issuedAt, expires } | null`.
   - Take the band text from `AirQualityBlurb` after `"24-hr PSI Forecast:"`. Strip HTML and
     `&nbsp;`, and decode entities. If that fails, fall back to the underlined phrase in
     `BodyText`.
   - Take `forDate` from `BodyText` (`/forecast for (\d{1,2} \w{3} \d{4})/`), and `issuedAt`
     from `DateOfArticle`.
   - Map the words to our `PSI_BANDS` ids: split on “to” or an en dash, drop
     Low/Mid/High, and match labels case-insensitively. Keep NEA’s exact wording in `text` for
     display.
   - Return `null` when the date is missing, the forecast is for before today (SGT), or
     `ExpiryDateHazeDisplay` has passed.
   - Unit tests in `test/nea-outlook.test.js` with today’s body, an en-dash variant, “High
     Moderate to Mid Unhealthy”, a stale date and an expired one.
2. **`tgcloud/lib/nea-outlook.js`** (new, uses `sdk`): an on-demand fetch through the shared
   feed cache (`lib/feed-cache.js`, like `cameras` and `weather`), cached about 30 min in
   `state('nea_outlook')`, recording source `nea_outlook`. It’s issued once a day, so the tick
   doesn’t need it; fetch it from `getDashboard`, `/haze` and `/forecast`.
3. **`tgcloud/lib/forecast/range.js`** (new, pure): `persistenceRange(rows, now)` takes the
   last ~14 days of island-wide 1-hour PSI from the `readings` table (it’s never pruned). For
   h = 1, 3 and 6 it returns `{ h, lo, hi }`: the current value plus the 10th and 90th
   percentiles of h-hour changes. Clamp at 0. Return `null` when there are fewer than ~3 days of
   data. No model, no Open-Meteo, and it recalibrates itself as the episode changes. Drop +24h:
   NEA’s outlook covers tomorrow.
4. **`tgcloud/lib/forecast/run.js`** becomes a small function that reads readings and builds
   `{ issuedAt, now, steps: [{ h, t, lo, hi }], outlook }`, still cached per NEA hour in
   `state('forecast')`. Remove `forecast_attempt`, since there’s no outside call left to throttle.
   `store.js` gets a `readingsSince(hours)` helper (or `recentReadings(14 * 24)`).
5. **Delete** `tgcloud/lib/forecast/{features,inputs,predict,model}.js`,
   `test/forecast-vectors.json`, the vector part of `test/forecast.test.js` (replace it with
   range tests), and `scripts/train/` entirely. Open-Meteo goes too: the `openmeteo` source in
   `recordSource` and in `Sources.svelte`.
6. **`tgcloud/endpoints/tick.js`**: keep `runForecast(snap)`, which is now cheap, or drop it from
   the tick and build lazily. Change the `forecast:` summary line to `+1h lo–hi`.
7. **`tgcloud/lib/format.js`**:
   - `formatForecast`: NEA’s line first (“NEA forecast for tomorrow (Sat 17 Oct): Unhealthy to
     Low Very Unhealthy”), then “Next few hours, our calculation: likely 150–190 in 3 hours”.
     Remove `factorSentence` and `coverageNote`.
   - `formatHaze`: the 📈 line becomes NEA’s outlook when there is one, otherwise the +3h range.
   - Keep the caption tests in `test/card.test.js` under 1,024 characters.
8. **`tgcloud/handlers/message.js`**: change the `/forecast` help text to “tomorrow’s NEA
   forecast and the next few hours”, and its empty state.

### Mini App

9. **`src/components/ForecastSection.svelte`**: rename to “What’s ahead” (or keep “Haze
   forecast”).
   - Top row: “**Tomorrow: NEA forecast**”, with the 24-hr PSI as one or two `BandPill`s
     (from → to) and NEA’s wording. Issued time and a link to haze.gov.sg go in the `.note`.
     There’s no “our calculation” caption here, because it’s official.
   - Below it: “**Next few hours** · Our calculation, not official.” Rows +1h, +3h and +6h
     with a `lo–hi` range and the band words. Keep the chart’s 80% area, drop the median line
     and dots, and remove the “biggest factor” block and the model/trained-on meta line.
   - With no outlook (outside an episode), show only the range. With no range, show only the
     outlook. With neither, hide the section.
   - `src/lib/api.ts` `Forecast` type to match. Add fixture data in `src/dev/` for both, with and
     without an outlook, and a `?demo=worst` case (“High Very Unhealthy to Hazardous”, long
     text).
10. **`src/components/Sources.svelte`**: remove `openmeteo` and the stale `firms` row (nothing
    records it any more). Add `nea_outlook: { name: 'NEA haze update', role: 'Tomorrow’s 24-hr PSI forecast' }`.
11. **`src/lib/changelog.ts`**: a new entry (the 16 Oct forecast entry stays as history), e.g.
    *“NEA’s forecast for tomorrow”*: “During a haze episode, see NEA’s official 24-hour PSI
    forecast for tomorrow. For the next few hours we now show a simple likely range from
    recent readings (our calculation).”
12. Run the UI skills on the section before committing: `emil-design-eng`, `mobile-native`
    and `break-ui`.

### Docs

13. **AGENTS.md**: remove the Open-Meteo throttle bullet and the “model.js is generated” bullet.
    Add “NEA’s outlook is fetched on demand from nea.gov.sg’s undocumented
    `latesthazesituationupdate` JSON, issued about 6 pm only during episodes”. Update the shared
    and `sdk` module lists, and change the forecast wording in the “our own calculations”
    bullet to “the next-hours range”.
14. **README.md**: rewrite the intro line (“NEA’s 24-hour PSI forecast during haze episodes and
    a next-hours range”), the architecture sketch (`run the forecast (Open-Meteo inputs)` → `next-hours range from readings`),
    the `scripts/train/` row, and the whole “Forecast” section.
15. **docs/design.md**: the “Honest about the numbers” principle. Only NEA’s 24-hr PSI **and
    NEA’s forecast** are official; the next-hours range is ours and is captioned “Our
    calculation, not official.” Note that NEA’s outlook keeps NEA’s wording verbatim.
16. **`.github/workflows/tick.yml`** comment: drop “and the forecast” if the tick no longer runs it.

## 5. Cost and risks

- **Maintenance:** it goes from a seasonal retrain (Python env, Open-Meteo history, re-export,
  vector test) plus a live outside feed to **one parser** and a percentile function. If NEA
  changes the JSON, the outlook quietly disappears (source status turns red in Sources) and the
  range still shows.
- **The undocumented endpoint is the main risk.** Mitigations: parse defensively, check the
  date, and treat `null` as normal. Optionally email NEA or data.gov.sg asking for a supported
  feed.
- **Before building:** look at the endpoint’s response once the episode ends, to confirm how
  “no forecast” looks. Optionally score NEA’s bands against the actual next-day 24-hr PSI for
  16 Sep–16 Oct to check how often the actual landed inside the range.
