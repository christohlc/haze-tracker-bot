<script lang="ts">
  import { advice } from '../../tgcloud/lib/advice.js';
  import type { Snapshot } from '../lib/api';
  import BandPill from './BandPill.svelte';

  let { snapshot }: { snapshot: Snapshot } = $props();
  const psi24 = $derived(snapshot.worst.psi24h);
  const pm = $derived(snapshot.worst.pm25);
  const a = $derived(advice(psi24?.value ?? null, pm?.value ?? null));
</script>

<section class="card" aria-labelledby="advice-title">
  <h2 id="advice-title" class="section-title">What to do</h2>
  <p class="note">
    Following NEA: use the 1-hour PM2.5 for what you do right now, and the 24-hour PSI
    {#if psi24}(currently <BandPill value={psi24.value} />){/if} to plan ahead.
  </p>

  {#if a.rightNow}
    <div class="now">
      <p class="now-head">Right now · Band {a.rightNow.band} ({a.rightNow.label})</p>
      <p>{a.rightNow.text}</p>
      {#if pm}<p class="note">Highest region: {pm.name}, {pm.value} µg/m³</p>{/if}
    </div>
  {/if}

  {#if a.groups}
    <dl>
      <div><dt>Healthy adults</dt><dd>{a.groups.healthy}</dd></div>
      <div><dt>Elderly, pregnant women, children</dt><dd>{a.groups.vulnerable}</dd></div>
      <div><dt>Chronic lung or heart disease</dt><dd>{a.groups.chronic}</dd></div>
    </dl>
  {/if}

  <ul>
    <li>If you must be outside for long, wear a well-fitted N95. Surgical masks don’t filter fine particles.</li>
    <li>Keep windows closed; run air-con on recirculate or a HEPA air purifier.</li>
    <li>See a doctor if you get breathing difficulty or chest pain.</li>
    <li>Check <a href="https://www.haze.gov.sg" target="_blank" rel="noopener">haze.gov.sg</a> for official advisories.</li>
  </ul>
</section>

<style>
  .now {
    margin: 14px 0;
    padding: 12px;
    border-radius: 12px;
    background: var(--control);
  }
  .now p {
    margin: 0;
  }
  .now-head {
    font-weight: 650;
    margin-bottom: 2px !important;
  }
  dl {
    display: grid;
    gap: 0;
    margin: 0;
  }
  dl div {
    padding: 10px 0;
    border-top: 1px solid var(--hairline);
  }
  dl div:first-child {
    border-top: 0;
  }
  dt {
    font-weight: 600;
  }
  dd {
    margin: 2px 0 0;
    color: var(--ink-2);
  }
  ul {
    margin: 12px 0 0;
    padding-left: 1.1em;
    color: var(--ink-2);
    font-size: 0.875rem;
  }
  li + li {
    margin-top: 4px;
  }
  a {
    color: var(--link);
  }
</style>
