<script lang="ts">
  import { onMount } from 'svelte';
  import Advice from './components/Advice.svelte';
  import AlertsCard from './components/AlertsCard.svelte';
  import BrandHeader from './components/BrandHeader.svelte';
  import CigCalc from './components/CigCalc.svelte';
  import ForecastSection from './components/ForecastSection.svelte';
  import Hero from './components/Hero.svelte';
  import HistoryChart from './components/HistoryChart.svelte';
  import LiveViews from './components/LiveViews.svelte';
  import NewsCard from './components/NewsCard.svelte';
  import RegionTable from './components/RegionTable.svelte';
  import Segmented from './components/Segmented.svelte';
  import ShareCard from './components/ShareCard.svelte';
  import Sources from './components/Sources.svelte';
  import WhatsNew from './components/WhatsNew.svelte';
  import WindRain from './components/WindRain.svelte';
  import { loadDashboard, loadWeather, type Dashboard, type WeatherResult } from './lib/api';
  import { LATEST_ID } from './lib/changelog';
  import type { Period } from './lib/period';
  import { inTelegram, showBackButton } from './lib/telegram';
  import { getSeen, markSeen, newCount } from './lib/whats-new';

  type Tab = 'now' | 'outlook' | 'more';
  const TABS: Tab[] = ['now', 'outlook', 'more'];

  const DevToggle = import.meta.env.DEV && !inTelegram ? import('./dev/DevDataToggle.svelte') : null;

  let data = $state<Dashboard | null>(null);
  let error = $state<string | null>(null);
  let period = $state<Period>('3h');
  let loadedAt = 0;
  // Started alongside the dashboard rather than when its card mounts, so it isn't a second round trip.
  let weatherFirst = $state<Promise<WeatherResult> | null>(null);

  // Dev only: ?tab=outlook|more opens on that tab, for checking it in the preview.
  const devTab = import.meta.env.DEV ? new URLSearchParams(location.search).get('tab') : null;
  const firstTab: Tab = TABS.includes(devTab as Tab) ? (devTab as Tab) : 'now';
  let tab = $state<Tab>(firstTab);
  // A tab mounts on its first visit and then stays mounted (hidden), so its controls keep their
  // state and Live views fetches only once More is opened.
  let visited = $state<Record<Tab, boolean>>({ now: false, outlook: false, more: false });
  // Tabs whose cards have already risen in; showing them again just fades the panel.
  let settled = $state<Record<Tab, boolean>>({ now: false, outlook: false, more: false });
  let shown: Tab = firstTab;
  let barTop = $state<HTMLElement>();

  // Latest What's new id the user has seen; undefined until storage answers.
  let seen = $state<string | null | undefined>(undefined);
  // Entries that were new when More was opened, so they keep their "New" label there.
  let fresh = $state(0);
  const unseen = $derived(seen !== undefined && seen !== LATEST_ID);

  $effect(() => {
    visited[tab] = true;
    if (tab === 'more' && seen !== undefined && seen !== LATEST_ID) {
      fresh = newCount(seen);
      seen = LATEST_ID;
      markSeen();
    }
  });

  // Away from Now, Telegram's back arrow returns to it, like a native screen.
  $effect(() => {
    if (tab !== 'now') return showBackButton(() => (tab = 'now'));
  });

  $effect(() => {
    if (tab === shown || !barTop) return;
    settled[shown] = true;
    shown = tab;
    // Start the new tab at its top, keeping the header scrolled away if it already was.
    const y = barTop.getBoundingClientRect().top + window.scrollY;
    if (window.scrollY > y) window.scrollTo({ top: y, behavior: 'instant' });
  });

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
    getSeen().then((v) => {
      if (seen === undefined) seen = v;
    });
    weatherFirst = loadWeather();
    weatherFirst.catch(() => {}); // the card shows the error
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
    <div bind:this={barTop}></div>
    <div class="tabbar">
      <Segmented
        kind="tab"
        label="Sections"
        bind:value={tab}
        controls={(t) => `panel-${t}`}
        options={[
          { value: 'now', label: 'Now' },
          { value: 'outlook', label: 'Outlook' },
          { value: 'more', label: 'More', dot: unseen },
        ]}
      />
    </div>
    {#if visited.now}
      <div id="panel-now" class="sections" class:settled={settled.now} role="tabpanel" aria-label="Now" hidden={tab !== 'now'}>
        <Hero snapshot={data.snapshot} bind:period />
        <RegionTable snapshot={data.snapshot} {period} />
        <Advice snapshot={data.snapshot} />
        <AlertsCard />
        <ShareCard snapshot={data.snapshot} />
      </div>
    {/if}
    {#if visited.outlook}
      <div id="panel-outlook" class="sections" class:settled={settled.outlook} role="tabpanel" aria-label="Outlook" hidden={tab !== 'outlook'}>
        {#if data.forecast}<ForecastSection forecast={data.forecast} history={data.history} />{/if}
        <WindRain snapshot={data.snapshot} first={weatherFirst} />
        <HistoryChart snapshot={data.snapshot} history={data.history} />
      </div>
    {/if}
    {#if visited.more}
      <div id="panel-more" class="sections" class:settled={settled.more} role="tabpanel" aria-label="More" hidden={tab !== 'more'}>
        <LiveViews />
        {#if data.news}<NewsCard news={data.news} serverTime={data.serverTime} />{/if}
        <CigCalc snapshot={data.snapshot} />
        <WhatsNew {fresh} />
        <Sources sources={data.sources} />
      </div>
    {/if}
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
  .tabbar {
    position: sticky;
    top: var(--tg-content-safe-area-inset-top, 0px);
    z-index: 2;
    margin: 0 calc(-1 * var(--gutter)) 12px;
    padding: 6px var(--gutter);
    background: var(--page);
  }
  /* Cards scrolling under the stuck bar fade out instead of being cut off by a hard edge. */
  .tabbar::after {
    content: '';
    position: absolute;
    inset: 100% 0 auto;
    height: 10px;
    background: linear-gradient(var(--page), transparent);
    pointer-events: none;
  }
  .sections[hidden] {
    display: none;
  }
  .sections > :global(*) {
    animation: rise 280ms var(--ease-out) both;
  }
  /* Coming back to a tab: its cards have already risen in once, so the panel just fades. */
  .sections.settled {
    animation: fade 150ms var(--ease-out);
  }
  .sections.settled > :global(*) {
    animation: none;
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
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
    .sections.settled {
      animation: none;
    }
    .sk {
      animation: none;
    }
  }
</style>
