<script lang="ts">
  import { onMount } from 'svelte';
  import Advice from './components/Advice.svelte';
  import AlertsCard from './components/AlertsCard.svelte';
  import BrandHeader from './components/BrandHeader.svelte';
  import CigCalc from './components/CigCalc.svelte';
  import Hero, { type Period } from './components/Hero.svelte';
  import HistoryChart from './components/HistoryChart.svelte';
  import RegionTable from './components/RegionTable.svelte';
  import Sources from './components/Sources.svelte';
  import { loadDashboard, type Dashboard } from './lib/api';
  import { inTelegram } from './lib/telegram';

  const DevToggle = import.meta.env.DEV && !inTelegram ? import('./dev/DevDataToggle.svelte') : null;

  let data = $state<Dashboard | null>(null);
  let error = $state<string | null>(null);
  let period = $state<Period>('3h');
  let loadedAt = 0;

  async function load() {
    try {
      data = await loadDashboard();
      error = null;
      loadedAt = Date.now();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Couldn’t load the latest readings.';
    }
  }

  onMount(() => {
    load();
    // Coming back to the app after a while: refresh quietly.
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - loadedAt > 10 * 60_000) load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  });
</script>

<main>
  <BrandHeader snapshot={data?.snapshot ?? null} />

  {#if error && !data}
    <div class="card state">
      <p>{error}</p>
      <button type="button" onclick={load}>Try again</button>
    </div>
  {:else if !data}
    <div class="skeleton" aria-busy="true" aria-label="Loading">
      <div class="card sk tall"></div>
      <div class="card sk"></div>
      <div class="card sk"></div>
    </div>
  {:else}
    {#if data.snapshot.stale}
      <div class="card stale" role="status">
        NEA hasn’t published a new reading recently, so these numbers may be out of date.
      </div>
    {/if}
    <div class="sections">
      <Hero snapshot={data.snapshot} bind:period />
      <AlertsCard />
      <RegionTable snapshot={data.snapshot} {period} />
      <CigCalc snapshot={data.snapshot} />
      <HistoryChart snapshot={data.snapshot} history={data.history} />
      <Advice snapshot={data.snapshot} />
      <Sources sources={data.sources} />
    </div>
  {/if}
</main>

{#if DevToggle}
  {#await DevToggle then m}<m.default />{/await}
{/if}

<style>
  main {
    max-width: 720px;
    margin: 0 auto;
    padding: calc(12px + var(--tg-content-safe-area-inset-top, 0px)) var(--gutter)
      calc(24px + var(--tg-safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)));
  }
  .sections,
  .skeleton {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
  }
  .sections > :global(*) {
    animation: rise 280ms var(--ease-out) both;
  }
  .sections > :global(*:nth-child(2)) { animation-delay: 40ms; }
  .sections > :global(*:nth-child(3)) { animation-delay: 80ms; }
  .sections > :global(*:nth-child(4)) { animation-delay: 120ms; }
  .sections > :global(*:nth-child(n + 5)) { animation-delay: 160ms; }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
  }
  .sk {
    height: 120px;
    background: var(--card);
    animation: pulse 1.2s ease-in-out infinite alternate;
  }
  .sk.tall {
    height: 220px;
  }
  @keyframes pulse {
    to {
      opacity: 0.55;
    }
  }
  .stale {
    margin-bottom: 12px;
    font-size: 0.875rem;
    color: var(--ink-2);
    box-shadow: inset 3px 0 0 var(--band-unhealthy);
  }
  .state {
    display: grid;
    gap: 12px;
    justify-items: start;
  }
  .state p {
    margin: 0;
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
  }
  .state button {
    transition: transform 120ms var(--ease-out);
  }
  .state button:active {
    transform: scale(0.97);
  }
  @media (prefers-reduced-motion: reduce) {
    .sections > :global(*) {
      animation: fade 200ms ease both;
    }
    @keyframes fade {
      from {
        opacity: 0;
      }
    }
    .sk {
      animation: none;
    }
  }
</style>
