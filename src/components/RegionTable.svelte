<script lang="ts">
  import type { Snapshot } from '../lib/api';
  import { fmt } from '../lib/format';
  import BandPill from './BandPill.svelte';

  let { snapshot }: { snapshot: Snapshot } = $props();
</script>

<section class="card" aria-labelledby="regions-title">
  <h2 id="regions-title" class="section-title">By region</h2>
  <p class="note">
    PM2.5 is the raw latest hourly reading in µg/m³, so it isn’t coloured. 1h and 3h PSI are calculated from PM2.5;
    24h PSI is NEA’s official figure.
  </p>

  <table>
    <thead>
      <tr>
        <th scope="col">Region</th>
        <th scope="col" class="r">PM2.5</th>
        <th scope="col" class="c divider">1h</th>
        <th scope="col" class="c">3h</th>
        <th scope="col" class="c">24h</th>
      </tr>
    </thead>
    <tbody>
      {#each snapshot.regions as r (r.id)}
        <tr>
          <th scope="row">{r.name}</th>
          <td class="r num">{fmt(r.pm25)}</td>
          <td class="c divider"><BandPill value={r.psi1h} /></td>
          <td class="c"><BandPill value={r.psi3h} /></td>
          <td class="c"><BandPill value={r.psi24h} /></td>
        </tr>
      {/each}
    </tbody>
  </table>
</section>

<style>
  table {
    width: 100%;
    margin-top: 12px;
    border-collapse: collapse;
    font-size: 0.9375rem;
  }
  th,
  td {
    padding: 9px 2px;
    border-top: 1px solid var(--hairline);
    text-align: left;
    font-weight: 400;
  }
  thead th {
    border-top: 0;
    padding-top: 0;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--muted);
  }
  tbody th {
    font-weight: 550;
  }
  .r {
    text-align: right;
    padding-right: 8px;
  }
  .c {
    text-align: center;
  }
  .divider {
    border-left: 1px solid var(--hairline);
  }
</style>
