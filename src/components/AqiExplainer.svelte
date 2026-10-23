<script lang="ts">
  import { pm25ToUsAqi } from '../../tgcloud/lib/aqi.js';
  import { psiBand } from '../../tgcloud/lib/psi.js';
  import type { Snapshot } from '../lib/api';
  import { area } from '../lib/area.svelte';
  import BandPill from './BandPill.svelte';

  let { snapshot }: { snapshot: Snapshot } = $props();

  // One region for every row, so the numbers describe the same air: the user's area, else the
  // region with the highest PM2.5 last hour.
  const region = $derived(snapshot.regions.find((r) => r.id === (area.id ?? snapshot.worst.pm25?.region)) ?? null);
  const us = $derived(pm25ToUsAqi(region?.pm25));
</script>

<section class="card" aria-labelledby="aqi-title">
  <h2 id="aqi-title" class="section-title">Why other apps show a higher number</h2>
  <p class="note">
    IQAir, AQICN and many weather apps use the US AQI, not Singapore’s PSI. Both run from 0 to 500, but the US scale
    rates the same air as worse, and those apps go by the last hour or so rather than a 24-hour average.
  </p>

  {#if region && us}
    <p class="lead">Last hour in {region.name}: PM2.5 <b class="num">{Math.round(region.pm25 ?? 0)}</b> µg/m³</p>
    <dl>
      <div class="row">
        <dt>US AQI <span class="sub">IQAir, AQICN</span></dt>
        <dd><b class="num">{us.aqi}{us.beyond ? '+' : ''}</b> <span class="label">{us.label}</span></dd>
      </div>
      <!-- The pill already tells a screen reader its band, so the visible label is hidden from it. -->
      <div class="row">
        <dt>Our 1-hr PSI <span class="sub">same hour, NEA’s scale</span></dt>
        <dd><BandPill value={region.psi1h} /> <span class="label" aria-hidden="true">{psiBand(region.psi1h)?.label ?? ''}</span></dd>
      </div>
      <div class="row">
        <dt>Official 24-hr PSI <span class="sub">NEA</span></dt>
        <dd>
          <BandPill value={region.psi24h} />
          <span class="label" aria-hidden={region.psi24h != null}>{psiBand(region.psi24h)?.label ?? 'No reading'}</span>
        </dd>
      </div>
    </dl>
  {:else}
    <p class="note empty">No PM2.5 reading{region ? ` for ${region.name}` : ''} from NEA right now, so nothing to compare.</p>
  {/if}

  <p class="note foot">
    Those apps also use their own sensors and averaging, so their number won’t match exactly. The advice here follows
    NEA’s bands, Singapore’s official ones.
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
  dd b {
    font-family: var(--font-display);
    font-size: 1.125rem;
    font-weight: 700;
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
