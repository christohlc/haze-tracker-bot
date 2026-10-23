<script lang="ts">
  import { pm25ToUsAqi } from '../../tgcloud/lib/aqi.js';
  import { psiBand } from '../../tgcloud/lib/psi.js';
  import { readingsFor } from '../../tgcloud/lib/snapshot.js';
  import type { Snapshot } from '../lib/api';
  import { area } from '../lib/area.svelte';
  import BandPill from './BandPill.svelte';

  let { snapshot }: { snapshot: Snapshot } = $props();

  // One region for every row, so the numbers describe the same air: the user's area, else the
  // region with the highest PM2.5 last hour.
  const readings = $derived(readingsFor(snapshot, area.id));
  const region = $derived(readings.area ?? snapshot.regions.find((r) => r.id === readings.pm25?.region));
  const us = $derived(pm25ToUsAqi(region?.pm25));
</script>

<!-- The pill already tells a screen reader its band, so the visible label is hidden from it. -->
{#snippet psiRow(title: string, sub: string, value: number | null)}
  <div class="row">
    <dt>{title} <span class="sub">{sub}</span></dt>
    <dd>
      <BandPill {value} />
      <span class="label" aria-hidden={value != null}>{psiBand(value)?.label ?? 'No reading'}</span>
    </dd>
  </div>
{/snippet}

<section class="card" aria-labelledby="aqi-title">
  <h2 id="aqi-title" class="section-title">Why other apps show a higher number</h2>
  <p class="note">
    IQAir, AQICN and some other apps use the US AQI, not Singapore’s PSI. It rates the same air as worse, and they show
    the last hour or so, not a 24-hour average.
  </p>

  {#if region && us}
    <p class="lead">Last hour in {region.name}: PM2.5 <b class="num">{Math.round(region.pm25!)}</b> µg/m³</p>
    <dl>
      <div class="row">
        <dt>US AQI <span class="sub">IQAir and AQICN’s scale, our conversion</span></dt>
        <dd><BandPill text={`${us.aqi}${us.beyond ? '+' : ''}`} /> <span class="label">{us.label}</span></dd>
      </div>
      {@render psiRow('Our 1-hr PSI', 'same hour, our calculation', region.psi1h)}
      {@render psiRow('Official 24-hr PSI', 'NEA', region.psi24h)}
    </dl>
  {:else}
    <p class="note empty">No PM2.5 reading{region ? ` for ${region.name}` : ''} from NEA right now, so nothing to compare.</p>
  {/if}

  <p class="note foot">
    Compare their number with the 1-hour reading; NEA’s 24-hour PSI moves more slowly. Their sensors and averaging
    differ, so it won’t match exactly. The advice here follows NEA’s official bands.
  </p>
</section>

<style>
  .lead {
    margin: 14px 0 4px;
    color: var(--ink-2);
  }
  .lead b {
    color: var(--ink);
  }
  dl {
    margin: 0;
  }
  .row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    padding: 10px 0;
    border-top: 1px solid var(--hairline);
  }
  .row:first-child {
    border-top: 0;
  }
  dt {
    display: grid;
    min-width: 0;
    font-weight: 600;
  }
  .sub {
    font-weight: 400;
    font-size: 0.8125rem;
    color: var(--muted);
  }
  dd {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    align-items: center;
    gap: 2px 8px;
    margin: 0;
    text-align: right;
  }
  .label {
    font-size: 0.875rem;
    color: var(--ink-2);
  }
  .empty {
    margin-top: 14px;
  }
  .foot {
    margin-top: 12px;
  }
</style>
