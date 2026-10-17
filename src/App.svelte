<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import Advice from './components/Advice.svelte';
  import AheadSection from './components/AheadSection.svelte';
  import AlertsCard from './components/AlertsCard.svelte';
  import BrandHeader from './components/BrandHeader.svelte';
  import CigCalc from './components/CigCalc.svelte';
  import Hero from './components/Hero.svelte';
  import HistoryChart from './components/HistoryChart.svelte';
  import LiveViews from './components/LiveViews.svelte';
  import NewsCard from './components/NewsCard.svelte';
  import RegionDetail from './components/RegionDetail.svelte';
  import RegionTable from './components/RegionTable.svelte';
  import Segmented from './components/Segmented.svelte';
  import ShareCard from './components/ShareCard.svelte';
  import Sources from './components/Sources.svelte';
  import WhatsNew from './components/WhatsNew.svelte';
  import WindRain from './components/WindRain.svelte';
  import { loadDashboard, loadWeather, type Dashboard, type RegionId, type WeatherResult } from './lib/api';
  import { LATEST_ID } from './lib/changelog';
  import type { Period } from './lib/period';
  import { getStored, inTelegram, setStored, showBackButton } from './lib/telegram';
  import { snapshotVerdict, type Group } from '../tgcloud/lib/advice.js';
  import { area } from './lib/area.svelte';
  import { getSeen, markSeen } from './lib/whats-new';

  type Tab = 'now' | 'outlook' | 'more';
  const TABS: { value: Tab; label: string }[] = [
    { value: 'now', label: 'Now' },
    { value: 'outlook', label: 'Outlook' },
    { value: 'more', label: 'More' },
  ];

  // The hidden game behind the header; loaded only once someone finds it.
  let ninja = $state(false);
  const loadNinja = () => import('./components/HazelnutNinja.svelte');
  // The haze map and its land outline are only fetched once Outlook is opened.
  const loadHazeMapCard = () => import('./components/HazeMap.svelte');

  const DevToggle = import.meta.env.DEV && !inTelegram ? import('./dev/DevDataToggle.svelte') : null;

  let data = $state<Dashboard | null>(null);
  let error = $state<string | null>(null);
  let period = $state<Period>('3h');
  // Who What to do advises; the hero's mask line is the same verdict's short form, so they agree.
  const GROUP_KEY = 'advice_group';
  let group = $state<Group>('general');
  const outside = $derived(data ? snapshotVerdict(data.snapshot, group, area.id) : null);
  getStored(GROUP_KEY).then((g) => g === 'vulnerable' && (group = g));
  function pickGroup(g: Group) {
    group = g;
    setStored(GROUP_KEY, g);
  }
  let loadedAt = 0;
  // Started alongside the dashboard rather than when its card mounts, so it isn't a second round trip.
  let weatherFirst = $state<Promise<WeatherResult> | null>(null);

  // Dev only: ?tab=outlook|more opens on that tab, for checking it in the preview.
  const devTab = import.meta.env.DEV ? new URLSearchParams(location.search).get('tab') : null;
  let tab = $state<Tab>(TABS.find((t) => t.value === devTab)?.value ?? 'now');
  // A tab mounts on its first visit and then stays mounted (just hidden), so its controls keep
  // their state, its cards rise in only once, and Live views fetches only once More is opened.
  let visited = $state<Record<Tab, boolean>>({ now: false, outlook: false, more: false });
  $effect(() => {
    visited[tab] = true;
  });
  let tabsAnchor = $state<HTMLElement>();
  let tabbar = $state<HTMLElement>();

  // Latest What's new id the user had seen when the app opened; undefined until storage answers.
  let seen = $state<string | null | undefined>(undefined);
  const behind = $derived(seen !== undefined && seen !== LATEST_ID);
  const unseen = $derived(behind && !visited.more);
  $effect(() => {
    if (visited.more && behind) markSeen();
  });

  // A region opened from Around the island, shown in place of the Now tab. Another tab closes it.
  // Back lands where the list was.
  let detail = $state<RegionId | null>(null);
  let listY = 0;
  async function openRegion(id: RegionId) {
    listY = window.scrollY;
    detail = id;
    await tick(); // the region is shown and the list hidden, so the page is its height
    tabsAnchor?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }
  async function closeRegion() {
    const was = detail;
    detail = null;
    await tick(); // the Now tab is laid out again
    window.scrollTo({ top: listY, behavior: 'instant' });
    // Focus goes back to the row that opened it.
    document.querySelector<HTMLElement>(`[data-region="${was}"]`)?.focus({ preventScroll: true });
  }
  $effect(() => {
    if (tab !== 'now') detail = null;
  });

  // Away from Now (or in a region), Telegram's back arrow returns to it, like a native screen.
  // With the game open it closes the game instead. One effect, so they never all hold the button.
  const away = $derived(tab !== 'now');
  $effect(() => {
    if (ninja) return showBackButton(() => (ninja = false));
    if (detail) return showBackButton(closeRegion);
    if (away) return showBackButton(() => (tab = 'now'));
  });

  // Start each tab at its top, keeping the header scrolled away if it already was.
  $effect(() => {
    tab;
    untrack(() => {
      if (!tabsAnchor || !tabbar) return;
      // The anchor sits right above the bar, so it's only higher than the bar once the bar is stuck.
      if (tabsAnchor.getBoundingClientRect().top < tabbar.getBoundingClientRect().top) {
        tabsAnchor.scrollIntoView({ block: 'start', behavior: 'instant' });
      }
    });
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
    getSeen().then((v) => (seen = v));
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
  <BrandHeader snapshot={data?.snapshot ?? null} onsecret={() => (ninja = true)} />

  {#if error && !data}
    <div class="card state">
      <p>{error}</p>
      <button type="button" class="primary" onclick={load}>Try again</button>
    </div>
  {:else if !data}
    <!-- Shaped like the loaded page (tab bar, then a hero-sized card), so nothing jumps when it arrives. -->
    <div class="skeleton" aria-busy="true" aria-label="Loading">
      <div class="sk tabs-sk"></div>
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
    <div class="tabs-anchor" bind:this={tabsAnchor}></div>
    <div class="tabbar" bind:this={tabbar}>
      <Segmented
        kind="tab"
        id="tab"
        label="Sections"
        bind:value={tab}
        controls={(t) => (visited[t] ? `panel-${t}` : undefined)}
        options={TABS.map((t) => (t.value === 'more' && unseen ? { ...t, dot: 'new updates' } : t))}
      />
    </div>
    {#if detail}
      <div class="sections" role="region" aria-labelledby="region-title">
        <RegionDetail snapshot={data.snapshot} history={data.history} region={detail} {group} onback={closeRegion} />
      </div>
    {/if}
    {#if visited.now}
      <div id="panel-now" class="sections" class:off={tab !== 'now' || detail != null} role="tabpanel" aria-labelledby="tab-now">
        <Hero snapshot={data.snapshot} bind:period mask={outside?.mask} range={data.ahead?.range ?? null} onahead={() => (tab = 'outlook')} />
        <RegionTable snapshot={data.snapshot} {period} onselect={openRegion} />
        <Advice snapshot={data.snapshot} v={outside} {group} onpick={pickGroup} />
        <AlertsCard />
        <ShareCard snapshot={data.snapshot} />
      </div>
    {/if}
    {#if visited.outlook}
      <div id="panel-outlook" class="sections" class:off={tab !== 'outlook'} role="tabpanel" aria-labelledby="tab-outlook">
        {#if data.ahead?.outlook || data.ahead?.range}<AheadSection ahead={data.ahead} psi24h={data.snapshot.worst.psi24h?.value ?? null} />{/if}
        <WindRain snapshot={data.snapshot} first={weatherFirst} />
        {#await loadHazeMapCard() then m}<m.default />{/await}
        <HistoryChart snapshot={data.snapshot} history={data.history} />
      </div>
    {/if}
    {#if visited.more}
      <div id="panel-more" class="sections" class:off={tab !== 'more'} role="tabpanel" aria-labelledby="tab-more">
        <LiveViews />
        {#if data.news}<NewsCard news={data.news} serverTime={data.serverTime} />{/if}
        <CigCalc snapshot={data.snapshot} />
        <WhatsNew {seen} />
        <Sources sources={data.sources} />
      </div>
    {/if}
  {/if}
</main>

{#if ninja}
  {#await loadNinja() then m}<m.default onclose={() => (ninja = false)} />{/await}
{/if}

{#if DevToggle}
  {#await DevToggle then m}<m.default />{/await}
{/if}

<style>
  main {
    max-width: 720px;
    margin: 0 auto;
    padding: calc(12px + var(--inset-top)) var(--pad-right) calc(24px + var(--inset-bottom)) var(--pad-left);
  }
  /* Scrolled to, the tab lands just below the stuck bar, which sits below the inset. */
  .tabs-anchor {
    scroll-margin-top: var(--inset-top);
  }
  .sections,
  .skeleton {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
  }
  .tabbar {
    position: sticky;
    top: var(--inset-top);
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
  /* Showing a tab fades it in. */
  .sections {
    animation: fade 150ms var(--ease-out);
  }
  /* Hidden tabs keep their layout rather than display: none, so their cards' rise doesn't
     replay on every visit and charts keep their measured width. */
  .sections.off {
    height: 0;
    overflow: hidden;
    visibility: hidden;
    animation: none;
  }
  .sections > :global(*) {
    animation: rise 280ms var(--ease-out) both;
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
  }
  .sk.tall {
    height: 300px; /* plus the card padding: about the hero’s height on a phone */
  }
  .skeleton .tabs-sk {
    height: 48px;
    margin: 6px 0;
    border-radius: 10px;
    background: var(--control);
  }
  .stale {
    margin-bottom: 12px;
    font-size: 0.875rem;
    color: var(--ink-2);
    box-shadow: inset 3px 0 0 var(--band-unhealthy);
  }
  @media (prefers-reduced-motion: reduce) {
    .sections > :global(*) {
      animation: fade 200ms ease both;
    }
  }
</style>
