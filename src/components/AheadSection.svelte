<script lang="ts">
  import { psiBand } from '../../tgcloud/lib/psi.js';
  import { RANGE_RECORD } from '../../tgcloud/lib/range.js';
  import { sgtDayName } from '../../tgcloud/lib/time.js';
  import type { Ahead } from '../lib/api';
  import { sgtDayMonth, sgtHour } from '../lib/format';
  import { openLink } from '../lib/telegram';
  import BandPill from './BandPill.svelte';

  let { ahead }: { ahead: Ahead } = $props();

  const HAZE_SITE = 'https://www.haze.gov.sg/';

  const outlook = $derived(ahead.outlook);
  const range = $derived(ahead.range);
  const day = $derived(outlook ? sgtDayName(outlook.forDate) : '');

  const rangeBand = (lo: number, hi: number) => {
    const a = psiBand(lo)?.label;
    const b = psiBand(hi)?.label;
    return a === b ? a : `${a} to ${b}`;
  };

  function open(e: MouseEvent) {
    if (openLink(HAZE_SITE)) e.preventDefault();
  }
</script>

<section class="card" aria-labelledby="ahead-title">
  <h2 id="ahead-title" class="section-title">What’s ahead</h2>

  {#if outlook}
    <h3 class="sub">{day[0].toUpperCase()}{day.slice(1)} · NEA forecast</h3>
    <p class="bands">
      <BandPill bandId={outlook.from} size="lg" />
      {#if outlook.to !== outlook.from}
        <!-- "to" wraps with the second band, never alone at the end of a line. -->
        <span class="pair"><span class="to">to</span> <BandPill bandId={outlook.to} size="lg" /></span>
      {/if}
    </p>
    <p class="note">
      24-hr PSI, in NEA’s words “{outlook.text}”. Issued {sgtDayMonth(outlook.issuedAt)}, {sgtHour(outlook.issuedAt, true)} SGT.
      <a href={HAZE_SITE} target="_blank" rel="noopener noreferrer" onclick={open}>More at haze.gov.sg</a>
    </p>
  {/if}

  {#if range}
    <h3 class="sub">Next few hours</h3>
    <p class="note">
      Our calculation, not official. The island-wide 1-hour PSI is <span class="num">{range.now}</span> now; each range
      is how far it moved over the same hours in the past two weeks.
    </p>
    <table>
      <thead>
        <tr>
          <th scope="col">In</th>
          <th scope="col" class="r">Likely 1-hour PSI</th>
        </tr>
      </thead>
      <tbody>
        {#each range.steps as s (s.h)}
          <tr>
            <th scope="row">{s.h} {s.h === 1 ? 'hour' : 'hours'} <span class="when">{sgtHour(s.t)} SGT</span></th>
            <td class="r">
              <span class="num range">{s.lo === s.hi ? s.lo : `${s.lo}–${s.hi}`}</span>
              <span class="band-text">{rangeBand(s.lo, s.hi)}</span>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
    <p class="note meta">{RANGE_RECORD}</p>
  {/if}
</section>

<style>
  p {
    margin: 0;
  }
  .sub {
    margin: 12px 0 0;
    font-size: 0.9375rem;
    font-weight: 650;
  }
  .sub + .note {
    margin-top: 2px;
  }
  .bands {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin: 8px 0;
  }
  .pair {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .to {
    color: var(--ink-2);
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
  table {
    width: 100%;
    margin: 8px 0 0;
    border-collapse: collapse;
    font-size: 0.9375rem;
  }
  th,
  td {
    padding: 8px 2px;
    border-top: 1px solid var(--hairline);
    text-align: left;
    font-weight: 400;
    vertical-align: middle;
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
    white-space: nowrap;
  }
  .when {
    margin-left: 4px;
    font-weight: 400;
    color: var(--muted);
    font-size: 0.8125rem;
  }
  .r {
    text-align: right;
  }
  /* A range is one value: never "412–" on one line and "1000" on the next. */
  .range {
    white-space: nowrap;
  }
  .band-text {
    display: block;
    font-size: 0.75rem;
    color: var(--muted);
  }
  .meta {
    margin-top: 8px;
  }
</style>
