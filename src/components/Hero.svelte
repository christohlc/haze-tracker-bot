<script lang="ts">
  import { Tween } from 'svelte/motion';
  import { cubicOut } from 'svelte/easing';
  import { verdict } from '../../tgcloud/lib/advice.js';
  import { bandFloor, psiBand } from '../../tgcloud/lib/psi.js';
  import type { Snapshot } from '../lib/api';
  import { reducedMotion } from '../lib/motion';
  import { PERIODS, psiKey, type Period } from '../lib/period';
  import Segmented from './Segmented.svelte';

  let {
    snapshot,
    period = $bindable('3h'),
    group = 'general',
  }: { snapshot: Snapshot; period?: Period; group?: 'general' | 'vulnerable' } = $props();

  const worst = $derived(snapshot.worst[psiKey(period)]);
  const band = $derived(psiBand(worst?.value ?? null));
  // The short form of What to do's verdict (24-hr PSI and PM2.5, whichever is stricter), not of the
  // period shown, so the two never give different advice.
  const mask = $derived(verdict(snapshot.worst.psi24h?.value ?? null, snapshot.worst.pm25?.value ?? null, group)?.mask);
  // First open counts up once (rare, so it can take a little longer); period switches retarget quickly.
  // The count starts at the bottom of the band, so the number never reads lower than the band shown.
  const shown = new Tween(0, { easing: cubicOut });
  let first = true;
  $effect(() => {
    const target = worst?.value ?? 0;
    if (first) shown.set(bandFloor(target), { duration: 0 });
    const duration = reducedMotion() ? 0 : first ? 600 : 220;
    first = false;
    shown.set(target, { duration });
  });

</script>

<section class="hero sky-{band?.id ?? 'none'}" aria-labelledby="hero-title">
  <h2 id="hero-title" class="eyebrow">
    {PERIODS[period].eyebrow}{#if worst}<span class="where">&nbsp;· highest in {worst.name}</span>{/if}
  </h2>

  {#if worst}
    <div class="figure">
      <span class="value" aria-hidden="true">{Math.round(shown.current)}</span>
      <span class="unit" aria-hidden="true">PSI</span>
      <span class="visually-hidden" aria-live="polite">PSI {worst.value}, {band?.label}</span>
    </div>
    {#if band}
      <p class="band"><span class="dot" style:background="var(--band-{band.id})"></span>{band.label}</p>
    {/if}
  {:else}
    <div class="figure"><span class="value empty">–</span></div>
    <p class="missing">No reading from NEA for this period yet.</p>
  {/if}

  {#if mask}
    <p class="verdict"><strong>{mask.title}.</strong> {mask.text}</p>
  {/if}

  <div class="period">
    <Segmented
      label="PSI period"
      bind:value={period}
      options={(Object.keys(PERIODS) as Period[]).map((p) => ({ value: p, label: PERIODS[p].short }))}
    />
    <p class="caption">{PERIODS[period].caption}</p>
  </div>
</section>

<style>
  /* The card is a sky that clears or hazes with the band, like the logo. Ink is fixed per sky
     (not Telegram's text colour) so it always contrasts with the gradient; --ink-2 is checked
     at >= 4.5:1 against each sky's top, bottom and haze. */
  .hero {
    --sky-top: #8db8ea;
    --sky-bottom: #d9e6f2;
    --haze: rgba(255, 255, 255, 0.35);
    --ink: #0e1a26;
    --ink-2: rgba(14, 26, 38, 0.86);
    --control: rgba(255, 255, 255, 0.4);
    --control-thumb: rgba(255, 255, 255, 0.92);
    position: relative;
    display: grid;
    gap: 6px;
    padding: 18px 16px 16px;
    border-radius: var(--radius);
    overflow: hidden;
    isolation: isolate;
    color: var(--ink);
    background:
      radial-gradient(120% 60% at 20% 105%, var(--haze), transparent 70%),
      linear-gradient(180deg, var(--sky-top), var(--sky-bottom));
  }
  .sky-moderate { --sky-top: #a6c1db; --sky-bottom: #e6e2d3; --haze: rgba(240, 232, 214, 0.55); }
  .sky-unhealthy { --sky-top: #c3c0b2; --sky-bottom: #ebcd78; --haze: rgba(245, 226, 170, 0.6); }
  .sky-very_unhealthy {
    --sky-top: #b9946a; --sky-bottom: #e7ad5c; --haze: rgba(240, 205, 150, 0.55);
    --ink: #1e1206; --ink-2: rgba(30, 18, 6, 0.86);
  }
  .sky-hazardous {
    --sky-top: #4b2f45; --sky-bottom: #8a4a36; --haze: rgba(190, 120, 90, 0.15);
    --ink: #fbf3ea; --ink-2: rgba(251, 243, 234, 0.9);
    --control: rgba(0, 0, 0, 0.22); --control-thumb: rgba(255, 255, 255, 0.22);
  }

  :global([data-theme='dark']) .hero {
    --sky-top: #183553; --sky-bottom: #24496e; --haze: rgba(120, 170, 220, 0.18);
    --ink: #f3f6fa; --ink-2: rgba(243, 246, 250, 0.86);
    --control: rgba(0, 0, 0, 0.25); --control-thumb: rgba(255, 255, 255, 0.18);
  }
  :global([data-theme='dark']) .sky-moderate { --sky-top: #24303c; --sky-bottom: #3a4550; --haze: rgba(200, 190, 160, 0.14); }
  :global([data-theme='dark']) .sky-unhealthy { --sky-top: #2f2d24; --sky-bottom: #5a4818; --haze: rgba(226, 184, 74, 0.2); }
  :global([data-theme='dark']) .sky-very_unhealthy { --sky-top: #33241a; --sky-bottom: #6a3a19; --haze: rgba(230, 140, 70, 0.22); }
  :global([data-theme='dark']) .sky-hazardous { --sky-top: #251425; --sky-bottom: #4c1f35; --haze: rgba(200, 90, 120, 0.2); }

  .eyebrow {
    margin: 0;
    font-size: 0.8125rem;
    font-weight: 650;
    color: var(--ink-2);
  }
  .where {
    font-weight: 500;
  }
  .figure {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }
  .value {
    font-family: var(--font-display);
    font-size: clamp(4.5rem, 24vw, 6.5rem);
    font-weight: 800;
    line-height: 0.95;
    letter-spacing: -0.03em;
    font-variant-numeric: tabular-nums;
  }
  .value.empty {
    color: var(--ink-2);
  }
  .unit {
    font-family: var(--font-display);
    font-size: 1.125rem;
    font-weight: 700;
    color: var(--ink-2);
  }
  .band {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    font-family: var(--font-display);
    font-size: 1.25rem;
    font-weight: 750;
  }
  .dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--ink) 25%, transparent);
  }
  .missing {
    margin: 0;
    color: var(--ink-2);
  }
  .verdict {
    margin: 2px 0 10px;
    font-size: 0.9375rem;
    color: var(--ink-2);
  }
  .verdict strong {
    color: var(--ink);
    font-weight: 700;
  }
  .period {
    display: grid;
    gap: 8px;
  }
  .caption {
    margin: 0;
    font-size: 0.8125rem;
    color: var(--ink-2);
  }
</style>
