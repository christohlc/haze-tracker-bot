<script lang="ts">
  import { onMount } from 'svelte';
  import { REGION_NAMES, REGIONS } from '../../tgcloud/lib/config.js';
  import { dayLong, dayShort, forecastLine, forecastName, forecastSmokeLine } from '../../tgcloud/lib/forecast-parse.js';
  import { clearDirection, smokeLine, windHeadline } from '../../tgcloud/lib/weather-parse.js';
  import { loadWeather, type Snapshot, type WeatherResult } from '../lib/api';
  import { STALE_MS, timeAgo } from '../lib/format';

  // `first` is the request App started with the dashboard; Try again makes a new one.
  let { snapshot, first = null }: { snapshot: Snapshot; first?: Promise<WeatherResult> | null } = $props();

  const listFmt = new Intl.ListFormat('en-GB', { type: 'conjunction' });

  let result = $state<WeatherResult | null>(null);
  let error = $state<string | null>(null);

  const weather = $derived(result?.weather ?? null);
  const wind = $derived(weather?.wind ?? null);
  // Only a clear direction gets an arrow; light or shifting winds would point somewhere arbitrary.
  const arrow = $derived(clearDirection(wind));
  const smoke = $derived(smokeLine(wind, snapshot.worst.psi24h?.value));
  const stale = $derived(!!weather && result!.serverTime - Date.parse(weather.takenAt) > STALE_MS);

  const forecast = $derived(result?.forecast ?? null);
  // Today's wind (from the 24-hour forecast) first, then each day of the 4-day outlook.
  const forecastDays = $derived(
    forecast ? [...(forecast.next24h ? [{ date: null, wind: forecast.next24h.wind }] : []), ...forecast.days] : [],
  );
  // NEA reissues the 4-day outlook twice a day, so a day-old copy means data.gov.sg hasn't answered since.
  const forecastStale = $derived(!!forecast && result!.serverTime - Date.parse(forecast.issuedAt) > 24 * 3_600_000);
  const forecastSummary = $derived(forecastLine(forecast, result?.serverTime));
  const forecastSmoke = $derived(forecastSmokeLine(forecast, snapshot.worst.psi24h?.value, result?.serverTime));

  async function load(pending?: Promise<WeatherResult> | null) {
    error = null;
    try {
      result = await (pending ?? loadWeather());
    } catch {
      error = 'Couldn’t load wind and rain. Check your connection and try again.';
    }
  }

  onMount(() => load(first));
</script>

<section class="card" aria-labelledby="wx-title">
  <h2 id="wx-title" class="section-title">Wind and rain</h2>
  <p class="note">Our reading of NEA’s wind data. It shows where the air comes from, not what’s in it.</p>

  {#if error}
    <div class="state">
      <p class="error" role="alert">{error}</p>
      <button type="button" class="primary" onclick={() => load()}>Try again</button>
    </div>
  {:else if !result}
    <div class="wind" aria-busy="true" aria-label="Loading wind and rain">
      <div class="compass sk"></div>
      <div class="lines"><div class="bar sk"></div><div class="bar short sk"></div></div>
    </div>
  {:else}
  {#if !weather}
    <p class="note empty">NEA’s weather stations aren’t reporting right now.</p>
  {:else}
    {#if wind}
      <div class="wind">
        <div class="compass" aria-hidden="true">
          <span class="n">N</span>
          {#if arrow != null}
            <!-- Points the way the wind is blowing, so it's the opposite of where it comes from. -->
            <svg class="arrow" viewBox="0 0 24 24" style="--deg: {arrow + 180}deg">
              <path d="M12 3 L18 15 L12 12.5 L6 15 Z" />
            </svg>
          {:else}
            <span class="calm"></span>
          {/if}
        </div>
        <div class="lines">
          <p class="headline">
            {windHeadline(wind)}
            · <span class="num">{wind.kmh}</span> km/h
          </p>
          {#if smoke}<p class="text">{smoke}</p>{/if}
        </div>
      </div>
    {/if}

    {#if weather.rain}
      <p class="text rain">
        {#if !weather.rain.raining.length}
          No rain anywhere right now.
        {:else}
          {weather.rain.raining.length === REGIONS.length
            ? 'Raining now across the island.'
            : `Raining now in the ${listFmt.format(weather.rain.raining.map((id) => REGION_NAMES[id]))}.`}
          Rain helps wash haze out of the air.
        {/if}
      </p>
    {:else}
      <p class="note rain">NEA’s rain gauges aren’t reporting right now.</p>
    {/if}
    {#if !wind}
      <p class="note">NEA’s wind stations aren’t reporting right now.</p>
    {/if}

    <p class="note meta">
      NEA weather stations · {timeAgo(weather.takenAt, result!.serverTime)}{#if stale}{' · '}<span class="stale-note"><span class="status-dot stale" aria-hidden="true"></span>May be out of date</span>{/if}
    </p>
  {/if}

  {#if forecast && forecastDays.length}
    <div class="forecast">
      <h3 class="sub-title">Coming days</h3>
      {#if forecastSummary}<p class="text">{forecastSummary}</p>{/if}
      <ol class="days" style="--n: {forecastDays.length}">
        {#each forecastDays as d (d.date ?? 'today')}
          <li class="day" aria-label="{dayLong(d.date)}: {forecastName(d.wind) === 'variable' ? 'variable winds' : `from the ${forecastName(d.wind)}`}">
            <span class="day-name" aria-hidden="true">{dayShort(d.date)}</span>
            <span class="mini" aria-hidden="true">
              {#if d.wind.from != null}
                <svg class="mini-arrow" viewBox="0 0 24 24" style="--deg: {d.wind.from + 180}deg">
                  <path d="M12 3 L18 15 L12 12.5 L6 15 Z" />
                </svg>
              {:else}
                <span class="calm small"></span>
              {/if}
            </span>
            <span class="day-code" aria-hidden="true">{d.wind.from == null ? 'Varies' : d.wind.code}</span>
          </li>
        {/each}
      </ol>
      {#if forecastSmoke}<p class="text">{forecastSmoke}</p>{/if}
      <p class="note">
        NEA forecast · issued {timeAgo(forecast.issuedAt, result!.serverTime)}{#if forecastStale}{' · '}<span class="stale-note"><span class="status-dot stale" aria-hidden="true"></span>May be out of date</span>{/if}
      </p>
    </div>
  {/if}
  {/if}
</section>

<style>
  .wind {
    display: grid;
    grid-template-columns: 56px minmax(0, 1fr);
    gap: 14px;
    align-items: start;
    margin-top: 12px;
  }
  .compass {
    position: relative;
    display: grid;
    place-items: center;
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: var(--control);
  }
  .n {
    position: absolute;
    top: 3px;
    font-size: 0.625rem;
    font-weight: 700;
    line-height: 1;
    color: var(--muted);
  }
  .arrow {
    width: 30px;
    height: 30px;
    fill: var(--accent);
    transform: rotate(var(--deg));
    /* Entering eases out; turning to a new direction later is movement on screen. */
    transition:
      transform 280ms var(--ease-in-out),
      opacity 280ms var(--ease-out);
  }
  /* Settles into place from a little short of its angle, rather than sweeping round from north. */
  @starting-style {
    .arrow {
      opacity: 0;
      transform: rotate(calc(var(--deg) - 30deg));
    }
  }
  .calm {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--muted);
  }
  .lines {
    display: grid;
    gap: 4px;
    min-width: 0;
  }
  p {
    margin: 0;
  }
  .headline {
    font-weight: 600;
    color: var(--ink);
  }
  .text {
    color: var(--ink-2);
  }
  .rain {
    margin-top: 12px;
  }
  .meta {
    margin-top: 10px;
  }
  .empty {
    margin-top: 12px;
  }
  .forecast {
    display: grid;
    gap: 8px;
    margin-top: 14px;
    padding-top: 14px;
    border-top: 1px solid var(--hairline);
  }
  .sub-title {
    margin: 0;
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--ink);
  }
  .days {
    display: grid;
    grid-template-columns: repeat(var(--n), minmax(0, 1fr));
    /* One or two days shouldn't stretch into wide slabs. */
    max-width: calc(var(--n) * 76px);
    gap: 6px;
    margin: 2px 0;
    padding: 0;
    list-style: none;
  }
  .day {
    display: grid;
    justify-items: center;
    gap: 4px;
    padding: 8px 2px;
    border-radius: 12px;
    background: var(--control);
  }
  .day-name {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--ink-2);
  }
  .mini {
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
  }
  .mini-arrow {
    width: 20px;
    height: 20px;
    fill: var(--accent);
    transform: rotate(var(--deg));
  }
  .calm.small {
    width: 7px;
    height: 7px;
  }
  .day-code {
    overflow-wrap: anywhere;
    text-align: center;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--ink);
    font-variant-numeric: tabular-nums;
  }
  .bar {
    height: 14px;
    border-radius: 7px;
    background: var(--control);
  }
  .bar.short {
    width: 60%;
  }
  .state {
    margin-top: 12px;
  }
  @media (prefers-reduced-motion: reduce) {
    .arrow {
      transition: none;
    }
  }
</style>
