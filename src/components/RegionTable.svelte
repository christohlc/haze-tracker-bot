<script lang="ts">
  import { psiBand } from '../../tgcloud/lib/psi.js';
  import type { Snapshot } from '../lib/api';
  import { fmt } from '../lib/format';
  import type { Period } from './Hero.svelte';

  let { snapshot, period = '3h' }: { snapshot: Snapshot; period?: Period } = $props();

  const PERIOD_LABEL: Record<Period, string> = { '1h': '1-hour', '3h': '3-hour', '24h': '24-hour' };
  const key = $derived(`psi${period}` as const);
  const rows = $derived(
    snapshot.regions.map((r) => {
      const v = r[key];
      return { ...r, v, band: psiBand(v) };
    }),
  );
  // Bars share one scale: at least 200 so a moderate day doesn't look alarming.
  const max = $derived(Math.max(200, ...rows.map((r) => r.v ?? 0)));
</script>

<section class="card" aria-labelledby="regions-title">
  <h2 id="regions-title" class="section-title">Around the island</h2>
  <p class="note">{PERIOD_LABEL[period]} PSI by NEA region. PM2.5 is the latest hourly reading.</p>

  <ul>
    {#each rows as r (r.id)}
      <li>
        <span class="name">{r.name}</span>
        <span class="track" aria-hidden="true">
          {#if r.v != null}
            <span class="bar" style:width="{(r.v / max) * 100}%" style:background="var(--band-{r.band?.id})"></span>
          {/if}
        </span>
        <span class="value num">{fmt(r.v)}</span>
        <span class="sub">
          {r.band?.label ?? 'No reading'} · PM2.5 <span class="num">{fmt(r.pm25)}</span> µg/m³
        </span>
      </li>
    {/each}
  </ul>
</section>

<style>
  ul {
    margin: 12px 0 0;
    padding: 0;
    list-style: none;
  }
  li {
    display: grid;
    grid-template-columns: 4.75rem minmax(0, 1fr) 3ch;
    align-items: center;
    column-gap: 10px;
    padding: 8px 0;
  }
  li + li {
    border-top: 1px solid var(--hairline);
  }
  .name {
    font-weight: 600;
  }
  .track {
    height: 10px;
    border-radius: 999px;
    background: var(--control);
    overflow: hidden;
  }
  .bar {
    display: block;
    height: 100%;
    border-radius: inherit;
    transition: width 300ms var(--ease-out);
  }
  .value {
    font-family: var(--font-display);
    font-size: 1.0625rem;
    font-weight: 750;
    text-align: right;
  }
  .sub {
    grid-column: 2 / -1;
    font-size: 0.8125rem;
    color: var(--muted);
  }
  @media (prefers-reduced-motion: reduce) {
    .bar {
      transition: none;
    }
  }
</style>
