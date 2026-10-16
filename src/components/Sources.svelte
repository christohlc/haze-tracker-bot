<script lang="ts">
  import { PUBLISHERS } from '../../tgcloud/lib/news-parse.js';
  import type { SourceStatus } from '../lib/api';
  import { sgtClock } from '../lib/format';

  let { sources }: { sources: SourceStatus[] } = $props();

  const NAMES: Record<string, { name: string; role: string }> = {
    nea_pm25: { name: 'NEA PM2.5 readings', role: 'Hourly readings by region, history and everything calculated from PM2.5' },
    nea_psi: { name: 'NEA PSI', role: 'Official 24-hour PSI by region' },
    openmeteo: { name: 'Open-Meteo', role: 'Weather forecast inputs for the haze forecast' },
    ...Object.fromEntries(Object.entries(PUBLISHERS).map(([id, p]) => [`news_${id}`, { name: p.name, role: 'Haze headlines' }])),
    lta_cameras: { name: 'LTA traffic cameras', role: 'Live views from Woodlands, Tuas and Sentosa' },
    firms: { name: 'NASA FIRMS', role: 'Satellite fire detections for the forecast' },
  };
</script>

<section class="card" aria-labelledby="sources-title">
  <h2 id="sources-title" class="section-title">Data sources</h2>
  <p class="note">Which feeds are working right now, and what each one contributes.</p>
  {#if !sources.length}
    <p class="note empty">No feeds have reported yet. They’re checked every hour.</p>
  {/if}
  <ul>
    {#each sources as s (s.source)}
      {@const meta = NAMES[s.source] ?? { name: s.source, role: '' }}
      {@const ok = !s.lastError}
      <li>
        <div class="head">
          <span class="name">{meta.name}</span>
          <span class="status">
            <span class="dot" style:background={ok ? 'var(--status-good)' : 'var(--status-critical)'}></span>
            {ok ? 'Working' : 'Failing'}
          </span>
        </div>
        <p class="note">{meta.role}</p>
        <p class="note">
          {#if ok && s.lastOkAt}Checked {sgtClock(s.lastOkAt)} SGT{/if}
          {#if !ok}{s.lastError}{s.lastOkAt ? ` · last worked ${sgtClock(s.lastOkAt)} SGT` : ''}{/if}
        </p>
      </li>
    {/each}
  </ul>
  <p class="note credit">
    Data: NEA via data.gov.sg. 1-hour and 3-hour PSI are calculated here and aren’t official. Not medical advice.
  </p>
</section>

<style>
  ul {
    margin: 12px 0 0;
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
  .empty {
    margin-top: 12px;
  }
  .credit {
    margin-top: 12px;
  }
</style>
