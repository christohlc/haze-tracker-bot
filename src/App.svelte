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
  import ShareCard from './components/ShareCard.svelte';
  import Sources from './components/Sources.svelte';
  import TabBar from './components/TabBar.svelte';
  import type { TabIconName } from './components/TabIcon.svelte';
  import WhatsNew from './components/WhatsNew.svelte';
  import WindRain from './components/WindRain.svelte';
  import { loadDashboard, loadWeather, type Dashboard, type RegionId, type WeatherResult } from './lib/api';
  import { cachedDashboard, saveDashboard } from './lib/cache';
  import { LATEST_ID } from './lib/changelog';
  import { readingTime } from './lib/format';
  import type { Period } from './lib/period';
  import { getStored, impactHaptic, inTelegram, setStored, showBackButton } from './lib/telegram';
  import { snapshotVerdict, type Group } from '../tgcloud/lib/advice.js';
  import { STALE_NOTE } from '../tgcloud/lib/snapshot.js';
  import { area } from './lib/area.svelte';
  import { getSeen, markSeen } from './lib/whats-new';

  type Tab = 'now' | 'outlook' | 'more';
  // Icons (TabIcon): live, a dot sending out waves; a gauge, since Outlook leads with the
  // forecast meter; a grid.
  const TABS: { value: Tab; label: string; icon: TabIconName }[] = [
    { value: 'now', label: 'Now', icon: 'live' },
    { value: 'outlook', label: 'Outlook', icon: 'gauge' },
    { value: 'more', label: 'More', icon: 'grid' },
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
  // The region's page pushes in from the right, like an iOS screen; back brings Now in from the
  // left (`popped`, until the next tab switch, which fades as usual). Plain CSS, so it plays in
  // every web view.
  let popped = $state(false);
  async function openRegion(id: RegionId) {
    listY = window.scrollY;
    detail = id;
    await tick(); // the region is shown and the list hidden, so the page is its height
    tabsAnchor?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }
  async function closeRegion() {
    const was = detail;
    if (!was) return;
    impactHaptic();
    popped = true;
    detail = null;
    await tick(); // the Now tab is laid out again
    window.scrollTo({ top: listY, behavior: 'instant' });
    // Focus goes back to the row that opened it.
    document.querySelector<HTMLElement>(`[data-region="${was}"]`)?.focus({ preventScroll: true });
  }
  $effect(() => {
    if (tab !== 'now') {
      detail = null;
      popped = false;
    }
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
      if (!tabsAnchor) return;
      // Scrolled past the anchor (the top of the tabs, under Telegram's buttons): back to it.
      if (tabsAnchor.getBoundingClientRect().top < parseFloat(getComputedStyle(tabsAnchor).scrollMarginTop)) {
        tabsAnchor.scrollIntoView({ block: 'start', behavior: 'instant' });
      }
    });
  });

  // A load that fails keeps what's on screen, or the last readings saved on this device, and
  // says so (`showingSaved`); the error screen is only for a first load with nothing saved.
  const showingSaved = $derived(error != null && data != null);
  let loading = $state(false);
  async function load() {
    if (loading) return;
    loading = true;
    try {
      data = await loadDashboard();
      error = null;
      loadedAt = Date.now();
      saveDashboard(data);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Couldn’t load the latest readings.';
      data ??= cachedDashboard();
    } finally {
      loading = false;
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
    // Back online after a failed load: try again straight away.
    const onOnline = () => showingSaved && load();
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
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
    <!-- Shaped like the loaded page (a hero-sized card first), so nothing jumps when it arrives. -->
    <div class="skeleton" aria-busy="true" aria-label="Loading">
      <div class="card sk tall"></div>
      <div class="card sk"></div>
      <div class="card sk"></div>
    </div>
  {:else}
    {#if showingSaved}
      <div class="card stale offline" role="status">
        <span>
          {navigator.onLine ? 'Couldn’t refresh.' : 'You’re offline.'} Showing NEA’s readings from {readingTime(data.snapshot.asOf)}.
        </span>
        <button type="button" onclick={load} disabled={loading}>{loading ? 'Trying…' : 'Try again'}</button>
      </div>
    {:else if data.snapshot.stale}
      <div class="card stale" role="status">
        {STALE_NOTE}
      </div>
    {/if}
    <div class="tabs-anchor" bind:this={tabsAnchor}></div>
    {#if detail}
      <div class="sections push" role="region" aria-labelledby="region-title">
        <RegionDetail snapshot={data.snapshot} history={data.history} region={detail} {group} onback={closeRegion} />
      </div>
    {/if}
    {#if visited.now}
      <div id="panel-now" class="sections" class:pop={popped} class:off={tab !== 'now' || detail != null} role="tabpanel" aria-labelledby="tab-now">
        <Hero snapshot={data.snapshot} bind:period mask={outside?.mask} range={data.ahead?.range ?? null} onahead={() => (tab = 'outlook')} />
        <RegionTable snapshot={data.snapshot} {period} onselect={openRegion} />
        <Advice snapshot={data.snapshot} v={outside} {group} onpick={pickGroup} />
        <AlertsCard {group} />
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
    <TabBar
      id="tab"
      label="Sections"
      bind:value={tab}
      hidden={ninja}
      controls={(t) => (visited[t] ? `panel-${t}` : undefined)}
      options={TABS.map((t) => (t.value === 'more' && unseen ? { ...t, dot: 'new updates' } : t))}
    />
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
    overflow-x: clip; /* a page sliding in never scrolls the app sideways */
    padding: calc(12px + var(--inset-top)) var(--pad-right) calc(24px + var(--inset-bottom)) var(--pad-left);
  }
  /* Scrolled to, the tab starts just below Telegram's buttons. */
  .tabs-anchor {
    scroll-margin-top: var(--inset-top);
  }
  .sections,
  .skeleton {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
  }
  /* Showing a tab fades it in. */
  .sections {
    animation: fade 150ms var(--ease-out);
  }
  /* Into a region and back (above). The page moves as one, so the region's cards don't rise too.
     Before .off, which must win over .pop. */
  .sections.push {
    animation: push 260ms var(--ease-push);
  }
  .sections.push > :global(*) {
    animation: none;
  }
  .sections.pop {
    animation: pop 260ms var(--ease-push);
  }
  @keyframes push {
    from {
      opacity: 0;
      transform: translateX(20%);
    }
  }
  @keyframes pop {
    from {
      opacity: 0;
      transform: translateX(-20%);
    }
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
  .stale {
    margin-bottom: 12px;
    font-size: 0.875rem;
    color: var(--ink-2);
    box-shadow: inset 3px 0 0 var(--band-unhealthy);
  }
  .offline {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .offline button {
    flex: none;
    min-height: 44px;
    padding: 0 14px;
    border: 1px solid var(--hairline);
    border-radius: 999px;
    background: none;
    color: var(--ink);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
    transition: transform 120ms var(--ease-out);
  }
  .offline button:active:not(:disabled) {
    transform: scale(0.97);
  }
  @media (prefers-reduced-motion: reduce) {
    .sections > :global(*) {
      animation: fade 200ms ease both;
    }
    .sections.push,
    .sections.pop:not(.off) {
      animation: fade 200ms ease;
    }
  }
</style>
