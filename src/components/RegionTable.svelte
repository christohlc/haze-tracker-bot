<script lang="ts">
  import { psiBand } from '../../tgcloud/lib/psi.js';
  import type { Snapshot } from '../lib/api';
  import { area } from '../lib/area.svelte';
  import { fmt } from '../lib/format';
  import { PERIODS, psiKey, type Period } from '../lib/period';

  let { snapshot, period = '3h' }: { snapshot: Snapshot; period?: Period } = $props();

  const key = $derived(psiKey(period));
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
  <p class="note">{PERIODS[period].adj} PSI by NEA region. PM2.5 is the latest hourly reading.</p>

  <ul>
    {#each rows as r (r.id)}
      <li aria-current={area.id === r.id ? 'true' : undefined}>
        <span class="name">{r.name}</span>
        <span class="track" aria-hidden="true">
          {#if r.v != null}
            <!-- Clipped rather than scaled, so the rounded end keeps its shape at any length. -->
            <span class="bar" style:--fill="{(r.v / max) * 100}%" style:background="var(--band-{r.band?.id})"></span>
          {/if}
        </span>
        <span class="value num"><span class="visually-hidden">{PERIODS[period].adj} PSI </span>{fmt(r.v)}</span>
        <span class="detail">
          {#if area.id === r.id}<span class="mine">Your area</span> ·{/if}
          {r.band?.label ?? 'No reading'} ·
          <!-- The reading and its unit stay on one line. -->
          <span class="pm">PM2.5 <span class="num">{fmt(r.pm25)}</span>{#if r.pm25 != null}&nbsp;µg/m³{/if}</span>
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
  .mine {
    font-weight: 650;
    color: var(--ink);
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
    clip-path: inset(0 calc(100% - var(--fill)) 0 0 round 999px);
    transition: clip-path 220ms var(--ease-in-out);
  }
  .value {
    font-family: var(--font-display);
    font-size: 1.0625rem;
    font-weight: 750;
    text-align: right;
  }
  .detail {
    grid-column: 2 / -1;
    font-size: 0.8125rem;
    color: var(--muted);
  }
  .pm {
    white-space: nowrap;
  }
  @media (prefers-reduced-motion: reduce) {
    .bar {
      transition: none;
    }
  }
</style>
