<script lang="ts">
  import { cigarettes } from '../../tgcloud/lib/cigs.js';
  import type { Snapshot } from '../lib/api';
  import { fmt } from '../lib/format';

  let { snapshot }: { snapshot: Snapshot } = $props();

  let place = $state<string>('island');
  let outdoorPct = $state(100);

  const pm = $derived.by(() => {
    const r = snapshot.regions.find((x) => x.id === place);
    return r ? { now: r.pm25, mean24h: r.pm25Mean24h } : snapshot.island;
  });
  const c = $derived(cigarettes(pm, outdoorPct / 100));
  const placeName = $derived(snapshot.regions.find((x) => x.id === place)?.name ?? 'Island-wide average');
</script>

<section class="card" aria-labelledby="cigs-title">
  <h2 id="cigs-title" class="section-title">Cigarette equivalent</h2>
  <p class="note">
    Rule of thumb from Berkeley Earth: breathing 22 µg/m³ of PM2.5 over 24 hours is roughly one cigarette. An
    illustration of exposure, not a medical measurement.
  </p>

  <div class="controls">
    <label class="field">
      <span>Region</span>
      <select bind:value={place}>
        <option value="island">Island-wide average</option>
        {#each snapshot.regions as r (r.id)}
          <option value={r.id}>{r.name}</option>
        {/each}
      </select>
    </label>
    <label class="field">
      <span>Time outdoors <b class="num">{outdoorPct}%</b></span>
      <input type="range" min="0" max="100" step="5" bind:value={outdoorPct} />
    </label>
  </div>

  <div class="result">
    <p class="big"><span class="num-big num">{fmt(c.past24h, 1)}</span> cigarettes over the past 24 hours</p>
    <p class="note">{placeName}, {outdoorPct}% of the time outdoors</p>
  </div>

  <div class="tiles">
    <div class="tile">
      <span class="tile-value num">{fmt(c.lastHour, 2)}</span>
      <span class="tile-label">in the last hour</span>
    </div>
    <div class="tile">
      <span class="tile-value num">{fmt(c.perDayAtCurrent, 1)}</span>
      <span class="tile-label">per day if this hour’s level continued</span>
    </div>
  </div>

  <p class="note foot">
    Assumes indoor air has 40% of outdoor PM2.5, so 0% outdoors still counts some.
  </p>
</section>

<style>
  .controls {
    display: grid;
    gap: 12px;
    margin: 14px 0;
  }
  .field {
    display: grid;
    gap: 6px;
    font-size: 0.875rem;
    color: var(--ink-2);
  }
  .field b {
    color: var(--ink);
    font-weight: 600;
  }
  select {
    min-height: 44px;
    padding: 0 10px;
    border: 0;
    border-radius: 10px;
    background: var(--control);
    color: var(--ink);
    font: inherit;
    font-size: 16px;
  }
  input[type='range'] {
    width: 100%;
    accent-color: var(--accent);
    touch-action: pan-y;
  }
  .result p {
    margin: 0;
  }
  .big {
    font-size: 1rem;
    color: var(--ink-2);
  }
  /* Big numbers in the display face; .num keeps them from jittering as the slider moves. */
  .num-big,
  .tile-value {
    font-family: var(--font-display);
  }
  .num-big {
    display: block;
    font-size: 3rem;
    font-weight: 750;
    letter-spacing: -0.035em;
    line-height: 1.05;
    color: var(--ink);
  }
  .tiles {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-top: 14px;
  }
  .tile {
    display: grid;
    align-content: start;
    gap: 2px;
    padding: 12px;
    border-radius: 12px;
    background: var(--control);
  }
  .tile-value {
    font-size: 1.5rem;
    font-weight: 700;
    letter-spacing: -0.02em;
  }
  .tile-label {
    font-size: 0.8125rem;
    color: var(--ink-2);
  }
  .foot {
    margin-top: 12px;
  }
  @media (min-width: 560px) {
    .controls {
      grid-template-columns: 1fr 1fr;
    }
  }
</style>
