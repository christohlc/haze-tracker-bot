<script lang="ts">
  import { Tween } from 'svelte/motion';
  import { cubicOut } from 'svelte/easing';
  import { bandFloor, psiBand } from '../../tgcloud/lib/psi.js';
  import { readingsFor } from '../../tgcloud/lib/snapshot.js';
  import { psiRangeText } from '../../tgcloud/lib/outlook-parse.js';
  import type { Range, RegionId, Snapshot } from '../lib/api';
  import { bandStops } from '../lib/bands';
  import { area, canLocate, locateArea, pickArea } from '../lib/area.svelte';
  import { ambient, reducedMotion } from '../lib/motion';
  import { PERIOD_ORDER, PERIODS, psiKey, type Period } from '../lib/period';
  import Segmented from './Segmented.svelte';

  // `mask` is the short form of What to do's verdict (24-hr PSI and PM2.5, whichever is stricter),
  // not of the period shown, so the two never give different advice.
  // `range`: our next-hours range (island-wide 1-hour PSI), shown as a strip; `onahead` opens Outlook.
  let {
    snapshot,
    period = $bindable('3h'),
    mask,
    range = null,
    onahead,
  }: {
    snapshot: Snapshot;
    period?: Period;
    mask?: { title: string; text: string } | null;
    range?: Range | null;
    onahead?: () => void;
  } = $props();

  const worst = $derived(snapshot.worst[psiKey(period)]);
  // The user's area if they picked one, else the highest region.
  const readings = $derived(readingsFor(snapshot, area.id));
  const mine = $derived(readings.area);
  const head = $derived(readings[psiKey(period)]);
  const band = $derived(psiBand(head?.value ?? null));

  let locating = $state(false);
  let locateFailed = $state(false);
  async function onArea(e: Event & { currentTarget: HTMLSelectElement }) {
    const v = e.currentTarget.value;
    locateFailed = false;
    if (v !== 'locate') return pickArea(v === 'highest' ? null : (v as RegionId));
    e.currentTarget.value = area.id ?? 'highest';
    locating = true;
    const id = await locateArea();
    locating = false;
    if (id) pickArea(id);
    else locateFailed = true;
  }
  // First open counts up once (rare, so it can take a little longer); period switches retarget quickly.
  // The count starts at the bottom of the band, so the number never reads lower than the band shown.
  const shown = new Tween(0, { easing: cubicOut });
  let first = true;
  $effect(() => {
    const target = head?.value ?? 0;
    if (first) shown.set(bandFloor(target), { duration: 0 });
    const duration = reducedMotion() ? 0 : first ? 600 : 220;
    first = false;
    shown.set(target, { duration });
  });

</script>

<section class="hero sky-{band?.id ?? 'none'}" aria-labelledby="hero-title">
  <div class="drift" aria-hidden="true" use:ambient>
    <span class="sun"></span>
    <span class="bank low"></span>
    <span class="bank high"></span>
  </div>
  <div class="top">
    <h2 id="hero-title" class="eyebrow">{PERIODS[period].eyebrow}</h2>
    <label class="area" class:busy={locating}>
      {#if mine}
        <svg class="pin" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z" fill="currentColor" /></svg>
      {/if}
      <span>{locating ? 'Finding you…' : mine ? mine.name : `Highest${worst ? `: ${worst.name}` : ''}`}</span>
      <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg>
      <select aria-label="Area to show" value={area.id ?? 'highest'} onchange={onArea} disabled={locating}>
        <option value="highest">Highest region</option>
        {#each snapshot.regions as r (r.id)}<option value={r.id}>{r.name}</option>{/each}
        {#if canLocate}<option value="locate">Use my location</option>{/if}
      </select>
    </label>
  </div>
  {#if locateFailed}
    <p class="aside" role="status">Couldn’t get your location. Pick your area from the list instead.</p>
  {:else if mine && worst && worst.region !== mine.id}
    <p class="aside">Highest: {worst.name} <span class="num">{worst.value}</span></p>
  {/if}

  {#if head}
    <div class="figure">
      <span class="value" aria-hidden="true">{Math.round(shown.current)}</span>
      <span class="unit" aria-hidden="true">PSI</span>
      <span class="visually-hidden" aria-live="polite">PSI {head.value}{mine ? ` in ${mine.name}` : ''}, {band?.label}</span>
    </div>
    {#if band}
      <p class="band"><span class="dot" style:background="var(--band-{band.id})"></span>{band.label}</p>
    {/if}
  {:else}
    <div class="figure"><span class="value empty">–</span></div>
    <p class="missing">
      {mine ? `No reading for ${mine.name} for this period yet. Pick another area, or the highest.` : 'No reading from NEA for this period yet.'}
    </p>
  {/if}

  {#if range}
    <!-- Tapping it opens What’s ahead, where the ranges are explained. -->
    <button type="button" class="ahead" onclick={onahead}>
      <span class="ahead-title">Next hours · island-wide 1-hour PSI, our estimate<span class="visually-hidden">. Opens What’s ahead.</span></span>
      <span class="ahead-steps" style:--steps={range.steps.length}>
        {#each range.steps as s (s.h)}
          <span class="step">
            <span class="step-in">in {s.h} hr</span>
            <span class="num step-range">{psiRangeText(s)}</span>
            <span class="step-bar" style:background={bandStops(s.lo, s.hi)} aria-hidden="true"></span>
          </span>
        {/each}
      </span>
    </button>
  {/if}

  {#if mask}
    <p class="verdict"><strong>{mask.title}.</strong> {mask.text}</p>
  {/if}

  <div class="period">
    <Segmented
      label="PSI period"
      bind:value={period}
      options={PERIOD_ORDER.map((p) => ({ value: p, label: PERIODS[p].short }))}
    />
    <p class="caption">{PERIODS[period].caption}</p>
  </div>
</section>

<style>
  /* The card is a sky that clears or hazes with the band, like the logo. Ink is fixed per sky
     (not Telegram's text colour) so it always contrasts with the gradient; --ink-2 is checked
     at >= 4.5:1 against each sky's top, bottom and haze. The drifting banks are light haze where
     the ink is dark and dark smoke where it's light, so they only ever add contrast. */
  .hero {
    --sky-top: #8db8ea;
    --sky-bottom: #d9e6f2;
    --haze: rgba(255, 255, 255, 0.35);
    --bank: rgba(255, 255, 255, 0.85);
    --haze-density: 0.25;
    --sun: 0;
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
    transition:
      --sky-top 280ms var(--ease-in-out),
      --sky-bottom 280ms var(--ease-in-out),
      --haze 280ms var(--ease-in-out);
  }
  .sky-good { --sun: 1; }
  .sky-moderate { --sky-top: #a6c1db; --sky-bottom: #e6e2d3; --haze: rgba(240, 232, 214, 0.55); --bank: rgba(240, 232, 214, 0.9); --haze-density: 0.4; }
  .sky-unhealthy { --sky-top: #c3c0b2; --sky-bottom: #ebcd78; --haze: rgba(245, 226, 170, 0.6); --bank: rgba(245, 226, 170, 0.9); --haze-density: 0.5; }
  .sky-very_unhealthy {
    --sky-top: #b9946a; --sky-bottom: #e7ad5c; --haze: rgba(240, 205, 150, 0.55);
    --bank: rgba(240, 205, 150, 0.9); --haze-density: 0.6;
    --ink: #1e1206; --ink-2: rgba(30, 18, 6, 0.86);
  }
  .sky-hazardous {
    --sky-top: #4b2f45; --sky-bottom: #8a4a36; --haze: rgba(190, 120, 90, 0.15);
    --bank: rgba(40, 20, 25, 0.7); --haze-density: 0.75;
    --ink: #fbf3ea; --ink-2: rgba(251, 243, 234, 0.9);
    --control: rgba(0, 0, 0, 0.22); --control-thumb: rgba(255, 255, 255, 0.22);
  }

  :global([data-theme='dark']) .hero {
    --sky-top: #183553; --sky-bottom: #24496e; --haze: rgba(120, 170, 220, 0.18);
    --bank: rgba(8, 20, 35, 0.7); --haze-density: 0.3; --sun: 0;
    --ink: #f3f6fa; --ink-2: rgba(243, 246, 250, 0.86);
    --control: rgba(0, 0, 0, 0.25); --control-thumb: rgba(255, 255, 255, 0.18);
  }
  :global([data-theme='dark']) .sky-moderate { --sky-top: #24303c; --sky-bottom: #3a4550; --haze: rgba(200, 190, 160, 0.14); --bank: rgba(12, 14, 16, 0.7); --haze-density: 0.45; }
  :global([data-theme='dark']) .sky-unhealthy { --sky-top: #2f2d24; --sky-bottom: #5a4818; --haze: rgba(226, 184, 74, 0.2); --bank: rgba(30, 22, 5, 0.7); --haze-density: 0.55; }
  :global([data-theme='dark']) .sky-very_unhealthy { --sky-top: #33241a; --sky-bottom: #6a3a19; --haze: rgba(230, 140, 70, 0.22); --bank: rgba(35, 15, 5, 0.7); --haze-density: 0.65; }
  :global([data-theme='dark']) .sky-hazardous { --sky-top: #251425; --sky-bottom: #4c1f35; --haze: rgba(200, 90, 120, 0.2); --bank: rgba(25, 5, 15, 0.75); --haze-density: 0.75; }

  /* Behind everything in the card (the area pill's own backdrop sits at -1). Haze banks drift
     on slow loops, thicker as the band rises; a clear day gets a breathing sun, never at night. */
  .drift {
    position: absolute;
    inset: 0;
    z-index: -2;
    pointer-events: none;
  }
  .bank {
    position: absolute;
    width: 130%;
    height: 70%;
    background: radial-gradient(closest-side, var(--bank), transparent);
    opacity: var(--haze-density);
    transition: opacity 280ms var(--ease-in-out);
  }
  .low {
    left: -45%;
    bottom: -25%;
    animation: drift-low 28s ease-in-out infinite alternate;
  }
  .high {
    right: -50%;
    top: 5%;
    animation: drift-high 40s ease-in-out infinite alternate;
  }
  @keyframes drift-low {
    to {
      transform: translate3d(30%, -6%, 0);
    }
  }
  @keyframes drift-high {
    to {
      transform: translate3d(-28%, 5%, 0);
    }
  }
  .sun {
    position: absolute;
    top: -35%;
    right: -25%;
    width: 85%;
    aspect-ratio: 1;
    background: radial-gradient(closest-side, rgba(255, 247, 214, 0.75), transparent);
    opacity: var(--sun);
    transition: opacity 280ms var(--ease-in-out);
    animation: glow 6s ease-in-out infinite alternate;
  }
  @keyframes glow {
    from {
      transform: scale(0.85);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .hero {
      transition: none;
    }
    .bank,
    .sun {
      animation: none;
    }
  }

  .eyebrow {
    margin: 0;
    font-size: 0.8125rem;
    font-weight: 650;
    color: var(--ink-2);
  }
  .top {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    column-gap: 8px;
    /* The pill's 44px hit area overlaps the line above and below rather than spacing them out. */
    margin: -8px 0;
  }
  .area {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-height: 44px;
    padding: 0 12px;
    font-size: 0.8125rem;
    font-weight: 650;
    color: var(--ink);
    max-width: 100%;
    white-space: nowrap;
    user-select: none;
    -webkit-user-select: none;
    transition: transform 120ms var(--ease-out);
  }
  /* The visible pill is 30px tall, centred in the 44px hit area. */
  .area::before {
    content: '';
    position: absolute;
    inset: 7px 0;
    z-index: -1;
    border-radius: 999px;
    background: var(--control);
  }
  .area:active:not(.busy) {
    transform: scale(0.97);
  }
  @media (prefers-reduced-motion: reduce) {
    .area {
      transition: none;
    }
  }
  .area select {
    position: absolute;
    inset: 0;
    width: 100%;
    opacity: 0;
    cursor: pointer;
  }
  .area:has(select:focus-visible)::before {
    outline: 2px solid var(--ink);
    outline-offset: 1px;
  }
  .area > span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .pin,
  .area > svg {
    flex: none;
  }
  .aside {
    margin: 0;
    font-size: 0.8125rem;
    color: var(--ink-2);
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
  /* Our next-hours range: three small steps, each a number over a band-coloured bar. */
  .ahead {
    display: grid;
    gap: 6px;
    width: 100%;
    margin: 4px 0 10px;
    padding: 10px 12px;
    border: 0;
    border-radius: 14px;
    background: color-mix(in srgb, var(--ink) 8%, transparent);
    color: var(--ink);
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition: transform 120ms var(--ease-out);
  }
  .ahead:active {
    transform: scale(0.97);
  }
  .ahead-title {
    font-size: 0.75rem;
    color: var(--ink-2);
  }
  .ahead-steps {
    display: grid;
    grid-template-columns: repeat(var(--steps), minmax(0, 1fr));
    gap: 10px;
  }
  .step {
    display: grid;
    gap: 2px;
    min-width: 0;
  }
  .step-in {
    font-size: 0.75rem;
    color: var(--ink-2);
  }
  .step-range {
    font-weight: 700;
    white-space: nowrap;
  }
  .step-bar {
    height: 4px;
    border-radius: 999px;
  }
  @media (prefers-reduced-motion: reduce) {
    .ahead {
      transition: none;
    }
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
