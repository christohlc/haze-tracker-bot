<script lang="ts">
  import { onMount } from 'svelte';
  import { REGIONS } from '../../tgcloud/lib/config.js';
  import { compassName, smokeLine } from '../../tgcloud/lib/weather-parse.js';
  import { loadWeather, type Snapshot, type WeatherResult } from '../lib/api';
  import { timeAgo } from '../lib/format';

  let { snapshot }: { snapshot: Snapshot } = $props();

  const REGION_NAMES = Object.fromEntries(REGIONS.map((r) => [r.id, r.name]));
  const STALE_MS = 30 * 60_000;
  const list = new Intl.ListFormat('en-GB', { type: 'conjunction' });

  let result = $state<WeatherResult | null>(null);
  let error = $state<string | null>(null);

  const w = $derived(result?.weather ?? null);
  const wind = $derived(w?.wind ?? null);
  // Only a clear direction gets an arrow; light or shifting winds would point somewhere arbitrary.
  const arrow = $derived(wind?.steady && wind.from != null ? wind.from : null);
  const smoke = $derived(smokeLine(wind, snapshot.worst.psi24h?.value));
  const stale = $derived(!!w && !!result && result.serverTime - Date.parse(w.takenAt) > STALE_MS);

  async function load() {
    error = null;
    try {
      result = await loadWeather();
    } catch {
      error = 'Couldn’t load wind and rain. Check your connection and try again.';
    }
  }

  onMount(load);
</script>

<section class="card" aria-labelledby="wx-title">
  <h2 id="wx-title" class="section-title">Wind and rain</h2>
  <p class="note">Our reading of NEA’s wind data. It shows where the air comes from, not what’s in it.</p>

  {#if error}
    <div class="state">
      <p class="error" role="alert">{error}</p>
      <button type="button" onclick={load}>Try again</button>
    </div>
  {:else if !result}
    <div class="wind" aria-busy="true" aria-label="Loading wind and rain">
      <div class="compass sk"></div>
      <div class="lines"><div class="bar sk"></div><div class="bar short sk"></div></div>
    </div>
  {:else if !w}
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
            {arrow != null ? `From the ${compassName(arrow)}` : wind.kmh < 5 ? 'Light winds' : 'Shifting winds'}
            · <span class="num">{wind.kmh}</span> km/h
          </p>
          {#if smoke}<p class="text">{smoke}</p>{/if}
        </div>
      </div>
    {/if}

    {#if w.rain}
      <p class="text rain">
        {#if !w.rain.raining.length}
          No rain anywhere right now.
        {:else}
          {w.rain.raining.length === REGIONS.length
            ? 'Raining now across the island.'
            : `Raining now in the ${list.format(w.rain.raining.map((id) => REGION_NAMES[id]))}.`}
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
      NEA weather stations · {timeAgo(w.takenAt, result.serverTime)}{#if stale}{' · '}<span class="stale">May be out of date</span>{/if}
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
    transition:
      transform 280ms var(--ease-out),
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
  .sk {
    animation: pulse 1.2s ease-in-out infinite alternate;
  }
  @keyframes pulse {
    to {
      opacity: 0.55;
    }
  }
  .state {
    display: grid;
    gap: 12px;
    justify-items: start;
    margin-top: 12px;
  }
  .error {
    font-size: 0.875rem;
    color: var(--status-critical);
  }
  .state button {
    min-height: 40px;
    padding: 0 16px;
    border: 0;
    border-radius: 10px;
    background: var(--accent);
    color: var(--accent-ink);
    font: inherit;
    font-weight: 600;
    touch-action: manipulation;
    user-select: none;
    -webkit-user-select: none;
    transition: transform 120ms var(--ease-out);
  }
  .state button:active {
    transform: scale(0.97);
  }
  @media (prefers-reduced-motion: reduce) {
    .arrow,
    .state button {
      transition: none;
    }
    .sk {
      animation: none;
    }
  }
</style>
