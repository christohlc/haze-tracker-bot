<script lang="ts">
  import { onMount } from 'svelte';
  import { REGION_NAMES, REGIONS } from '../../tgcloud/lib/config.js';
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
      <button type="button" onclick={() => load()}>Try again</button>
    </div>
  {:else if !result}
    <div class="wind" aria-busy="true" aria-label="Loading wind and rain">
      <div class="compass sk"></div>
      <div class="lines"><div class="bar sk"></div><div class="bar short sk"></div></div>
    </div>
  {:else if !weather}
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
      NEA weather stations · {timeAgo(weather.takenAt, result.serverTime)}{#if stale}{' · '}<span class="stale">May be out of date</span>{/if}
    </p>
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
  .stale {
    color: var(--status-critical);
  }
  .empty {
    margin-top: 12px;
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
