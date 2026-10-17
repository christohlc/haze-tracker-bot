<script lang="ts">
  import { snapshotVerdict, type Group } from '../../tgcloud/lib/advice.js';
  import { psiBand } from '../../tgcloud/lib/psi.js';
  import type { HourRow, RegionId, Snapshot } from '../lib/api';
  import { fmt } from '../lib/format';
  import { PERIODS, psiKey, type Period } from '../lib/period';
  import BandPill from './BandPill.svelte';
  import HistoryChart from './HistoryChart.svelte';

  // One region, opened from Around the island. Telegram's back arrow closes it too (App.svelte).
  let {
    snapshot,
    history,
    region,
    group,
    onback,
  }: { snapshot: Snapshot; history: HourRow[]; region: RegionId; group: Group; onback: () => void } = $props();

  const r = $derived(snapshot.regions.find((x) => x.id === region));
  const v = $derived(snapshotVerdict(snapshot, group, region));
  const PERIOD_ORDER = Object.keys(PERIODS) as Period[];

  // Opening moves focus to the region's name, so a screen reader starts here.
  let title = $state<HTMLElement>();
  $effect(() => title?.focus({ preventScroll: true }));
</script>

<button type="button" class="back" onclick={onback}>
  <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M7.5 2.5 4 6l3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg>
  Around the island
</button>

{#if r}
  <section class="card" aria-labelledby="region-title">
    <h2 id="region-title" class="section-title" tabindex="-1" bind:this={title}>{r.name}</h2>
    <dl class="stats" aria-label="PSI">
      {#each PERIOD_ORDER as p (p)}
        {@const value = r[psiKey(p)]}
        <div>
          <dt>{PERIODS[p].short}{p === '24h' ? ' · NEA' : ''}</dt>
          <dd><BandPill {value} size="lg" /></dd>
          <dd class="band">{psiBand(value)?.label ?? 'No reading'}</dd>
        </div>
      {/each}
    </dl>
    <p class="note">
      {#if r.pm25 != null}PM2.5 <span class="num">{fmt(r.pm25)}</span>&nbsp;µg/m³ in the latest hour.{:else}No PM2.5 reading in the latest hour.{/if} The 1- and 3-hour
      PSI are our calculation, not official.
    </p>
    {#if v}
      <p class="verdict"><strong>{v.headline}</strong>{#if v.detail}{' '}{v.detail}{/if}</p>
    {/if}
  </section>

  <HistoryChart {snapshot} {history} {region} openDays={7} />
{:else}
  <div class="card"><p class="note">No readings for this region right now.</p></div>
{/if}

<style>
  .back {
    justify-self: start;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 44px;
    margin: -6px 0 -6px -4px;
    padding: 0 4px;
    border: 0;
    background: none;
    color: var(--link);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
    transition: transform 120ms var(--ease-out);
  }
  .back:active {
    transform: scale(0.97);
  }
  #region-title:focus {
    outline: none;
  }
  .stats {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    margin: 12px 0;
  }
  .stats div {
    display: grid;
    align-content: start;
    gap: 2px;
    min-width: 0;
    padding: 10px;
    border-radius: 12px;
    background: var(--control);
  }
  dt {
    font-size: 0.75rem;
    color: var(--muted);
  }
  dd {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0;
  }
  .band {
    font-size: 0.8125rem;
    color: var(--ink-2);
    overflow-wrap: anywhere;
  }
  .verdict {
    margin: 10px 0 0;
  }
  p {
    margin: 0;
  }
</style>
