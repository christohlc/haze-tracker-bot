<script lang="ts">
  import { outlookSpan } from '../../tgcloud/lib/outlook-parse.js';
  import { bandRanges, psiBand } from '../../tgcloud/lib/psi.js';
  import { RANGE_RECORD } from '../../tgcloud/lib/range.js';
  import type { Ahead } from '../lib/api';
  import { sgtDayMonth, sgtDayName, sgtHour } from '../lib/format';
  import { openLink } from '../lib/telegram';
  import BandPill from './BandPill.svelte';
  import PsiMeter from './PsiMeter.svelte';

  // `psi24h`: today's official 24-hr PSI (the highest region's), marked on NEA's forecast dial.
  let { ahead, psi24h = null }: { ahead: Ahead; psi24h?: number | null } = $props();

  const HAZE_SITE = 'https://www.haze.gov.sg/';

  const outlook = $derived(ahead.outlook);
  const range = $derived(ahead.range);
  const day = $derived(outlook ? sgtDayName(outlook.forDate) : '');

  const psiRange = ({ lo, hi }: { lo: number; hi: number }) => (lo === hi ? `${lo}` : `${lo}–${hi}`);
  // NEA's own numbers when it gives them; otherwise the span its band words cover.
  const span = $derived(outlook ? (outlook.psi ?? outlookSpan(outlook.text)) : null);
  const said = $derived(outlook ? (outlook.psi ? `${psiRange(outlook.psi)}, ${outlook.text}` : outlook.text) : '');

  // The first and last band a range crosses ("Unhealthy to Hazardous" reads as "through").
  const bandsIn = (lo: number, hi: number) => {
    const a = psiBand(lo);
    const b = psiBand(hi);
    return !a || !b ? [] : a === b ? [a] : [a, b];
  };

  // Range bars share one scale, at least 0–300 so a moderate day doesn't fill it.
  const max = $derived(range ? Math.max(300, Math.ceil(Math.max(range.now, ...range.steps.map((s) => s.hi)) / 100) * 100) : 300);
  const pct = (v: number) => (Math.min(Math.max(v, 0), max) / max) * 100;
  // Band colours as hard stops between `lo` and `hi`, so each colour sits exactly on its band.
  function stops(lo: number, hi: number, faded: boolean) {
    const at = (v: number) => (hi === lo ? 0 : ((Math.min(Math.max(v, lo), hi) - lo) / (hi - lo)) * 100);
    const parts = bandRanges().flatMap((b) => {
      const from = Math.max(b.from, lo);
      const to = Math.min(b.to, hi);
      if (from > to) return [];
      const c = faded ? `color-mix(in srgb, var(--band-${b.id}) 22%, transparent)` : `var(--band-${b.id})`;
      return [`${c} ${at(from).toFixed(2)}%`, `${c} ${at(to + 1).toFixed(2)}%`];
    });
    return `linear-gradient(90deg, ${parts.join(', ')})`;
  }
  const track = $derived(stops(0, max, true));

  function open(e: MouseEvent) {
    if (openLink(HAZE_SITE)) e.preventDefault();
  }
</script>

<section class="card" aria-labelledby="ahead-title">
  <h2 id="ahead-title" class="section-title">What’s ahead</h2>

  {#if outlook}
    <h3 class="subhead">{day[0].toUpperCase()}{day.slice(1)} · NEA forecast</h3>
    {#if span}
      <PsiMeter lo={span.lo} hi={span.hi} words={said} now={psi24h}>
        {#if outlook.psi}<span class="num forecast">{psiRange(outlook.psi)}</span>{/if}
        <BandPill bandId={outlook.from} showLabel />
        {#if outlook.to !== outlook.from}<span class="to">to</span> <BandPill bandId={outlook.to} showLabel />{/if}
      </PsiMeter>
    {/if}
    <p class="note">
      24-hr PSI, in NEA’s words “{said}”{#if span && psi24h != null}; the tick marks today’s official 24-hr PSI{/if}. Issued {sgtDayMonth(outlook.issuedAt)}, {sgtHour(outlook.issuedAt, true)} SGT.
      <a href={HAZE_SITE} target="_blank" rel="noopener noreferrer" onclick={open}>More at haze.gov.sg</a>
    </p>
  {/if}

  {#if range}
    <h3 class="subhead">Next few hours</h3>
    <p class="note">
      Our calculation, not official. The island-wide 1-hour PSI is <span class="num">{range.now}</span> now; each range
      is how far it moved over the same hours in the past two weeks.
    </p>
    <ol class="steps" aria-label="Likely island-wide 1-hour PSI" style:--now="{pct(range.now)}%">
      {#each range.steps as s (s.h)}
        <li>
          <span class="in">{s.h} {s.h === 1 ? 'hour' : 'hours'} <span class="when">{sgtHour(s.t)} SGT</span></span>
          <span class="num range">{s.lo === s.hi ? s.lo : `${s.lo}–${s.hi}`}</span>
          <span class="track" style:background={track} aria-hidden="true">
            <span class="span" style:left="min({pct(s.lo)}%, calc(100% - 6px))" style:width="max(6px, {pct(s.hi) - pct(s.lo)}%)" style:background={stops(s.lo, s.hi, false)}></span>
          </span>
          <span class="band-text">
            {#each bandsIn(s.lo, s.hi) as b, i (b.id)}{#if i}{' '}to{' '}{/if}<span class="dot" style:background="var(--band-{b.id})"></span>{b.label}{/each}
          </span>
        </li>
      {/each}
    </ol>
    <p class="legend"><span class="now-key" aria-hidden="true"></span> now <span class="num">{range.now}</span> · scale 0–{max}</p>
    <p class="note meta">{RANGE_RECORD}</p>
  {/if}
</section>

<style>
  p {
    margin: 0;
  }
  .subhead {
    margin-top: 12px;
  }
  .subhead + .note {
    margin-top: 2px;
  }
  .to {
    color: var(--ink-2);
  }
  .forecast {
    font-weight: 650;
    white-space: nowrap;
  }
  /* An inline link, but with a finger-sized hit area. */
  .note a {
    display: inline-block;
    margin: -10px 0;
    padding: 10px 0;
    color: var(--link);
    white-space: nowrap;
    touch-action: manipulation;
    -webkit-touch-callout: none;
    transition: opacity 100ms var(--ease-out);
  }
  .note a:active {
    opacity: 0.6;
  }
  .steps {
    margin: 10px 0 0;
    padding: 0;
    list-style: none;
  }
  .steps li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: baseline;
    gap: 6px 12px;
    padding: 10px 0;
    border-top: 1px solid var(--hairline);
  }
  .in {
    font-weight: 550;
  }
  .when {
    margin-left: 4px;
    font-weight: 400;
    color: var(--muted);
    font-size: 0.8125rem;
  }
  /* A range is one value: never "412–" on one line and "1000" on the next. */
  .range {
    font-weight: 650;
    white-space: nowrap;
    text-align: right;
  }
  .track {
    grid-column: 1 / -1;
    position: relative;
    height: 10px;
    border-radius: 999px;
  }
  /* Where the 1-hour PSI is now, through every row. */
  .track::after {
    content: '';
    position: absolute;
    left: var(--now);
    top: -3px;
    bottom: -3px;
    width: 2px;
    margin-left: -1px;
    border-radius: 1px;
    background: var(--ink);
    box-shadow: 0 0 0 1px var(--card);
    z-index: 1;
  }
  .span {
    position: absolute;
    top: 0;
    bottom: 0;
    border-radius: 999px;
    box-shadow: 0 0 0 1.5px var(--card);
  }
  .band-text {
    grid-column: 1 / -1;
    font-size: 0.75rem;
    color: var(--ink-2);
  }
  .dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    margin-right: 4px;
    border-radius: 50%;
    vertical-align: 0;
  }
  .legend {
    margin-top: 2px;
    font-size: 0.75rem;
    color: var(--muted);
  }
  .now-key {
    display: inline-block;
    width: 2px;
    height: 10px;
    margin-right: 2px;
    vertical-align: -1px;
    border-radius: 1px;
    background: var(--ink);
  }
  .meta {
    margin-top: 8px;
  }
</style>
