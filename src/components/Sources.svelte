<script lang="ts">
  import { PUBLISHERS } from '../../tgcloud/lib/news-parse.js';
  import type { SourceStatus } from '../lib/api';
  import { sgtClock } from '../lib/format';

  let { sources }: { sources: SourceStatus[] } = $props();

  const NAMES: Record<string, { name: string; role: string }> = {
    nea_pm25: { name: 'NEA PM2.5 readings', role: 'Hourly readings by region, history and everything calculated from PM2.5' },
    nea_psi: { name: 'NEA PSI', role: 'Official 24-hour PSI by region' },
    nea_outlook: { name: 'NEA haze update', role: 'NEA’s 24-hr PSI forecast, during haze episodes' },
    ...Object.fromEntries(Object.entries(PUBLISHERS).map(([id, p]) => [`news_${id}`, { name: p.name, role: 'Haze headlines' }])),
    nea_weather: { name: 'NEA weather stations', role: 'Wind and rain' },
    nea_forecast24h: { name: 'NEA 24-hour forecast', role: 'Today’s wind forecast' },
    nea_forecast4day: { name: 'NEA 4-day outlook', role: 'Wind forecast for the next 4 days' },
    nea_hazemap: { name: 'NEA regional haze map', role: 'Hotspots, haze areas, wind about 760 m up and NEA’s haze outlook, from haze.gov.sg' },
    lta_cameras: { name: 'LTA traffic cameras', role: 'Live views from Woodlands, Tuas and Sentosa' },
  };
  // Feeds we no longer use keep their old rows in the database.
  const RETIRED = ['openmeteo', 'firms'];
  const known = $derived(sources.filter((s) => !RETIRED.includes(s.source)));
  const failing = $derived(known.filter((s) => s.lastError).length);
</script>

{#snippet status(ok: boolean, text: string)}
  <span class="status">
    <span class="dot" style:background={ok ? 'var(--status-good)' : 'var(--status-critical)'}></span>
    {text}
  </span>
{/snippet}

<section class="card" aria-labelledby="sources-title">
  <h2 id="sources-title" class="section-title">Data sources</h2>
  {#if !known.length}
    <p class="note">No feeds have reported yet. They’re checked every hour.</p>
  {:else}
    <details>
      <summary>
        {@render status(!failing, failing ? `${failing} of ${known.length} feeds failing` : 'All feeds working')}
        <span class="more" aria-hidden="true"><span class="show">Details</span><span class="hide">Hide</span></span>
      </summary>
      <ul>
        {#each known as s (s.source)}
          {@const meta = NAMES[s.source] ?? { name: s.source, role: '' }}
          {@const ok = !s.lastError}
          <li>
            <div class="head">
              <span class="name">{meta.name}</span>
              {@render status(ok, ok ? 'Working' : 'Failing')}
            </div>
            <p class="note">{meta.role}</p>
            <p class="note">
              {#if ok && s.lastOkAt}Checked {sgtClock(s.lastOkAt)} SGT{/if}
              {#if !ok}{s.lastError}{s.lastOkAt ? ` · last worked ${sgtClock(s.lastOkAt)} SGT` : ''}{/if}
            </p>
          </li>
        {/each}
      </ul>
    </details>
  {/if}
  <p class="note credit">
    Data: NEA via data.gov.sg. 1-hour and 3-hour PSI are calculated here and aren’t official. Not medical advice.
  </p>
</section>

<style>
  ul {
    margin: 8px 0 0;
    padding: 0;
    list-style: none;
  }
  li {
    padding: 10px 0;
    border-top: 1px solid var(--hairline);
  }
  li:first-child {
    border-top: 0;
  }
  .head {
    display: flex;
    justify-content: space-between;
    gap: 12px;
  }
  .name {
    min-width: 0;
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  li .note {
    overflow-wrap: anywhere;
  }
  .status {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.875rem;
    color: var(--ink-2);
    white-space: nowrap;
    flex-shrink: 0;
  }
  .dot {
    flex-shrink: 0;
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }
  summary {
    justify-content: space-between;
    gap: 12px;
    list-style: none;
  }
  summary::-webkit-details-marker {
    display: none;
  }
  summary .status {
    color: var(--ink);
    font-size: 0.9375rem;
  }
  .hide,
  details[open] .show {
    display: none;
  }
  details[open] .hide {
    display: inline;
  }
  .credit {
    margin-top: 12px;
  }
</style>
