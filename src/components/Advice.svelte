<script lang="ts">
  import { onMount } from 'svelte';
  import { verdict } from '../../tgcloud/lib/advice.js';
  import type { Snapshot } from '../lib/api';
  import { reducedMotion } from '../lib/motion';
  import { getStored, setStored } from '../lib/telegram';
  import BandPill from './BandPill.svelte';
  import Segmented from './Segmented.svelte';

  type Group = 'general' | 'vulnerable';
  const GROUPS: { value: Group; label: string }[] = [
    { value: 'general', label: 'General public' },
    { value: 'vulnerable', label: 'Vulnerable people' },
  ];
  const TREND = { rising: { arrow: '↑', word: 'Rising' }, easing: { arrow: '↓', word: 'Easing' }, steady: { arrow: '→', word: 'Steady' } };
  const GROUP_KEY = 'advice_group';

  let { snapshot }: { snapshot: Snapshot } = $props();
  const psi24 = $derived(snapshot.worst.psi24h);
  const pm = $derived(snapshot.worst.pm25);
  const trend = $derived(pm?.trend ?? null);

  let group = $state<Group>('general');
  const v = $derived(verdict(psi24?.value ?? null, pm?.value ?? null, group));
  onMount(() => {
    getStored(GROUP_KEY).then((g) => g === 'vulnerable' && (group = g));
  });

  // Picked by the user: remember it, and fade the answer back in so the change registers.
  let answer = $state<HTMLElement>();
  function pickGroup(g: Group) {
    group = g;
    setStored(GROUP_KEY, g);
    if (!reducedMotion()) answer?.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: 150, easing: 'ease-out' });
  }
</script>

<section class="card" aria-labelledby="advice-title">
  <h2 id="advice-title" class="section-title">What to do</h2>

  {#if v}
    <div class="verdict">
      <div class="verdict-head">
        <p class="eyebrow">Outside, right now</p>
        {#if trend && pm}
          <p class="trend trend-{trend}"><span aria-hidden="true">{TREND[trend].arrow}</span> {TREND[trend].word} in {pm.name}</p>
        {/if}
      </div>
      <div bind:this={answer}>
        <p class="headline">{v.headline}</p>
        {#if v.detail}<p class="detail">{v.detail}</p>{/if}
      </div>
      <Segmented label="Advice for" options={GROUPS} bind:value={() => group, pickGroup} />
      {#if group === 'vulnerable'}
        <p class="note">The elderly, pregnant women, children, and people with chronic lung or heart disease.</p>
      {/if}
      <p class="note">
        The stricter of NEA’s advice for the last hour’s PM2.5{#if pm}&nbsp;({pm.value} µg/m³ in {pm.name}, the highest){/if}
        and the official 24-hour PSI{#if psi24}&nbsp;<BandPill value={psi24.value} />{/if}, simplified; haze.gov.sg is
        official.{#if trend}&nbsp;Rising or easing compares the last hour with three hours before: our calculation.{/if}
      </p>
    </div>
  {:else}
    <p class="note empty">No readings from NEA right now, so no advice from us. Check haze.gov.sg.</p>
  {/if}

  <ul>
    <li>If you must be outside for long, wear a well-fitted N95. Surgical masks don’t filter fine particles.</li>
    <li>Keep windows closed; run air-con on recirculate or a HEPA air purifier.</li>
    <li>See a doctor if you get breathing difficulty or chest pain.</li>
    <li>Check <a href="https://www.haze.gov.sg" target="_blank" rel="noopener">haze.gov.sg</a> for official advisories.</li>
  </ul>
</section>

<style>
  .verdict {
    margin: 10px 0 16px;
    display: grid;
    gap: 10px;
  }
  .verdict-head p,
  .headline {
    margin: 0;
  }
  .verdict-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    flex-wrap: wrap;
  }
  .eyebrow,
  .trend {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--ink-2);
  }
  .trend {
    white-space: nowrap;
  }
  .trend-rising {
    color: var(--status-critical);
  }
  .headline {
    font-family: var(--font-display);
    font-size: 1.375rem;
    font-weight: 700;
    letter-spacing: -0.01em;
    line-height: 1.2;
    text-wrap: balance;
  }
  .detail {
    margin: 4px 0 0;
    color: var(--ink-2);
  }
  .verdict .note {
    margin: 0;
  }
  .empty {
    margin: 8px 0 0;
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
