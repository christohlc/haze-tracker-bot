<script lang="ts">
  import { Tween } from 'svelte/motion';
  import { cubicOut } from 'svelte/easing';
  import { maskCard } from '../../tgcloud/lib/advice.js';
  import type { Snapshot } from '../lib/api';
  import { reducedMotion } from '../lib/motion';
  import BandPill from './BandPill.svelte';
  import Segmented from './Segmented.svelte';

  let { snapshot }: { snapshot: Snapshot } = $props();

  type Period = '1h' | '3h' | '24h';
  let period = $state<Period>('3h');

  const worst = $derived(snapshot.worst[`psi${period}`]);
  const mask = $derived(maskCard(worst?.value ?? null));
  // First open counts up once (rare, so it can take a little longer); period switches retarget quickly.
  const shown = new Tween(0, { easing: cubicOut });
  let first = true;
  $effect(() => {
    const target = worst?.value ?? 0;
    const duration = reducedMotion() ? 0 : first ? 600 : 220;
    first = false;
    shown.set(target, { duration });
  });

  const CAPTIONS: Record<Period, string> = {
    '1h': '1-hour PSI, worst region. Calculated here from the latest hourly PM2.5, not official.',
    '3h': 'Old-style 3-hour PSI, worst region. Average of the last 3 hourly PM2.5 readings, not official.',
    '24h': '24-hour PSI, worst region. NEA’s official figure.',
  };
</script>

<section class="card hero" aria-labelledby="hero-title">
  <div class="main">
    <h2 id="hero-title" class="eyebrow">PSI based on</h2>
    <Segmented
      label="PSI period"
      bind:value={period}
      options={[
        { value: '1h', label: '1-hour' },
        { value: '3h', label: '3-hour' },
        { value: '24h', label: '24-hour' },
      ]}
    />
    <div class="figure">
      {#if worst}
        <span class="value" aria-live="polite">{Math.round(shown.current)}</span>
        <BandPill value={worst.value} showLabel size="lg" />
      {:else}
        <span class="value empty">–</span>
        <span class="missing">No reading from NEA for this period yet.</span>
      {/if}
    </div>
    <p class="caption">
      {CAPTIONS[period]}
      {#if worst}<span class="where">Highest in {worst.name}.</span>{/if}
    </p>
  </div>

  {#if mask}
    <aside class="mask">
      <svg viewBox="0 0 64 64" width="56" height="56" aria-hidden="true">
        <circle cx="32" cy="18" r="10" fill="none" stroke="currentColor" stroke-width="2.5" />
        <path d="M23 20.5c3 3.5 15 3.5 18 0v-1.5H23z" fill="currentColor" />
        <path d="M32 28v18M32 34l-10 7M32 34l10 7M32 46l-7 12M32 46l7 12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" fill="none" />
      </svg>
      <div>
        <p class="mask-title">{mask.title}</p>
        <p class="note">{mask.text}</p>
      </div>
    </aside>
  {/if}
</section>

<style>
  .hero {
    display: grid;
    gap: 16px;
  }
  .main {
    display: grid;
    gap: 12px;
    align-content: start;
  }
  .eyebrow {
    margin: 0;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .figure {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px 14px;
  }
  .value {
    font-size: clamp(4rem, 22vw, 6rem);
    font-weight: 750;
    line-height: 0.95;
    letter-spacing: -0.045em;
  }
  .value.empty {
    color: var(--muted);
  }
  .missing {
    font-size: 0.9375rem;
    color: var(--ink-2);
  }
  .caption {
    margin: 0;
    font-size: 0.875rem;
    color: var(--ink-2);
  }
  .where {
    color: var(--ink);
    font-weight: 550;
  }
  .mask {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    border-radius: 12px;
    background: var(--control);
    color: var(--ink);
  }
  .mask p {
    margin: 0;
  }
  .mask-title {
    font-weight: 650;
  }
  @media (min-width: 560px) {
    .hero {
      grid-template-columns: 1fr 200px;
    }
    .mask {
      flex-direction: column;
      justify-content: center;
      text-align: center;
    }
  }
</style>
