<script lang="ts">
  import { untrack } from 'svelte';
  import type { HourRow, RegionId, Snapshot } from '../lib/api';
  import { fmt, sgtHour, sgtWeekday } from '../lib/format';
  import { ambient, reveal } from '../lib/motion';
  import { niceTicks, rollingSeries, type Scale, type Window } from '../lib/series';
  import Segmented from './Segmented.svelte';

  // `region`: one region's line only (the region detail view); otherwise every region.
  // `openDays`: the span it opens on; the viewer can switch.
  let {
    snapshot,
    history,
    region = null,
    openDays = 1,
  }: { snapshot: Snapshot; history: HourRow[]; region?: RegionId | null; openDays?: 1 | 7 } = $props();
  let days = $state(untrack(() => openDays));
  const week = $derived(days === 7);
  // Two charts can be on the page (Outlook and a region), so ids are per instance.
  const uid = $props.id();
  // The table is built only while it's open: a week is 168 rows.
  let tableOpen = $state(false);

  let scale = $state<Scale>('pm25');
  let win = $state<Window>(1);
  let width = $state(320);
  let hover = $state<number | null>(null);

  const H = 220;

  const regions = $derived(
    snapshot.regions.filter((r) => !region || r.id === region).map((r) => ({ id: r.id as RegionId, name: r.name })),
  );
  const series = $derived(regions.map((r) => ({ ...r, points: rollingSeries(history, r.id, win, scale, days * 24) })));
  const n = $derived(series[0]?.points.length ?? 0);
  const yTicks = $derived(
    niceTicks(Math.max(scale === 'psi' ? 100 : 55, ...series.flatMap((s) => s.points.map((p) => p.v ?? 0)))),
  );
  const maxV = $derived(yTicks[yTicks.length - 1]);
  // The left gutter fits the widest tick label (4 digits in a bad haze).
  const pad = $derived({ t: 12, r: 12, b: 24, l: Math.max(34, 10 + 7 * String(maxV).length) });

  const x = (i: number) => pad.l + (n <= 1 ? 0 : (i / (n - 1)) * (width - pad.l - pad.r));
  const y = (v: number) => pad.t + (1 - v / maxV) * (H - pad.t - pad.b);

  function path(points: { v: number | null }[]) {
    let d = '';
    let pen = false;
    points.forEach((p, i) => {
      if (p.v == null) {
        pen = false;
        return;
      }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`;
      pen = true;
    });
    return d;
  }

  // A day: every 4 or 6 hours. A week: each midnight, named by the day that starts.
  const xTicks = $derived(
    (series[0]?.points ?? [])
      .map((p, i) => ({ i, t: p.t, h: Number(p.t.slice(11, 13)) }))
      .filter(({ h }) => (week ? h === 0 : h % (width < 420 ? 6 : 4) === 0))
      .map((tk) => ({ ...tk, label: week ? day(tk.t) : sgtHour(tk.t) })),
  );
  /** “Thu” for an SGT time. */
  const day = (t: string) => sgtWeekday(t).slice(0, 3);
  /** “Thu 3 pm” in a week, “3 pm” in a day. */
  const when = (t: string) => (week ? `${day(t)} ${sgtHour(t)}` : sgtHour(t));
  // Only as many days as there are readings (a fresh start, or before a backfill).
  const shownDays = $derived(Math.max(1, Math.round(n / 24)));
  const span = $derived(week && shownDays > 1 ? `${shownDays} days` : '24 hours');

  // Band edges: NEA PSI bands, and the matching PM2.5 1-hour bands.
  const BANDS = {
    psi: [
      { v: 50, label: 'Moderate' },
      { v: 100, label: 'Unhealthy' },
      { v: 200, label: 'Very unhealthy' },
      { v: 300, label: 'Hazardous' },
    ],
    pm25: [
      // NEA's 1-hour PM2.5 bands (PM25_BANDS), named by the band above each line.
      { v: 55, label: 'Elevated' },
      { v: 150, label: 'High' },
      { v: 250, label: 'Very high' },
    ],
  };
  const bandLines = $derived.by(() => {
    // Keep the line, but drop a label that would sit on top of the one below it.
    let lastY = Infinity;
    return BANDS[scale]
      .filter((b) => b.v < maxV)
      .map((b) => {
        const showLabel = lastY - y(b.v) >= 16;
        if (showLabel) lastY = y(b.v);
        return { ...b, showLabel };
      });
  });

  function onMove(e: PointerEvent) {
    const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
    const px = e.clientX - rect.left;
    const i = Math.round(((px - pad.l) / (width - pad.l - pad.r)) * (n - 1));
    hover = Math.min(n - 1, Math.max(0, i));
  }

  // The newest hour on the highest line, marked as live. None when that hour is missing.
  const latest = $derived.by(() => {
    let best: { id: RegionId; v: number } | null = null;
    for (const s of series) {
      const v = s.points[n - 1]?.v;
      if (v != null && (!best || v > best.v)) best = { id: s.id, v };
    }
    return best;
  });

  const tip = $derived(hover == null || !series[0] ? null : { t: series[0].points[hover].t, left: x(hover) });

  const unit = $derived(scale === 'psi' ? 'PSI' : 'µg/m³');
  const winLabel = $derived(win === 1 ? '1-hour' : win === 3 ? '3-hour' : '24-hour');
</script>

<section class="card" aria-labelledby="{uid}-title">
  <h2 id="{uid}-title" class="section-title">Past {span}</h2>
  <p class="note">
    {win === 1 ? 'Hourly readings.' : `Rolling ${winLabel} averages.`} PSI here is converted from PM2.5, so it can differ slightly from NEA’s.
  </p>

  <div class="controls">
    <div class="span">
      <Segmented
        label="Time span"
        bind:value={days}
        options={[
          { value: 1, label: '24 hours' },
          { value: 7, label: '7 days' },
        ]}
      />
    </div>
    <Segmented
      label="Scale"
      bind:value={scale}
      options={[
        { value: 'pm25', label: 'PM2.5' },
        { value: 'psi', label: 'PSI' },
      ]}
    />
    <Segmented
      label="Average"
      bind:value={win}
      options={[
        { value: 1, label: '1 hr' },
        { value: 3, label: '3 hr' },
        { value: 24, label: '24 hr' },
      ]}
    />
  </div>

  <!-- The legend doubles as the readout while scrubbing, so nothing covers the lines. -->
  <div class="readout">
    <p class="readout-time">{tip ? `${when(tip.t)} · ${unit}` : `Latest hour · ${unit}`}</p>
    <ul class="legend" aria-label="Regions">
      {#each regions as r, k (r.id)}
        {@const v = series[k].points[hover ?? n - 1]?.v ?? null}
        <li><span class="key" style:background="var(--region-{r.id})"></span>{r.name} <b class="num">{fmt(v)}</b></li>
      {/each}
    </ul>
  </div>

  {#if !series.some((s) => s.points.some((p) => p.v != null))}
    <p class="empty">No readings in the past {span} yet.</p>
  {:else}
  <div class="plot" bind:clientWidth={width} use:reveal use:ambient>
    <svg
      viewBox="0 0 {width} {H}"
      width="100%"
      height={H}
      role="img"
      aria-label="{winLabel} {unit} {region ? `in ${regions[0]?.name}` : 'by region'} over the past {span}"
      onpointermove={onMove}
      onpointerdown={onMove}
      onpointerleave={() => (hover = null)}
    >
      {#each yTicks as t (t)}
        <line x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} class={t === 0 ? 'base' : 'grid'} />
        <text x={pad.l - 6} y={y(t)} class="tick" text-anchor="end" dominant-baseline="middle">{t}</text>
      {/each}
      {#each bandLines as b (b.v)}
        <line x1={pad.l} x2={width - pad.r} y1={y(b.v)} y2={y(b.v)} class="band" />
      {/each}
      {#each xTicks as tk (tk.t)}
        <!-- A label near an edge hangs inward, so it isn't cut off. -->
        <text x={x(tk.i)} y={H - 6} class="tick" text-anchor={x(tk.i) < pad.l + 14 ? 'start' : x(tk.i) > width - pad.r - 14 ? 'end' : 'middle'}>{tk.label}</text>
      {/each}

      {#each series as s, k (s.id)}
        <path d={path(s.points)} pathLength="1" stroke="var(--region-{s.id})" class="line" style:--k={k} />
      {/each}
      <!-- Band names go on top of the lines; their halo keeps them legible where lines cross. -->
      {#each bandLines.filter((b) => b.showLabel) as b (b.v)}
        <text x={width - pad.r} y={y(b.v) - 4} class="band-label" text-anchor="end">{b.label}</text>
      {/each}

      {#if tip}
        <line x1={tip.left} x2={tip.left} y1={pad.t} y2={H - pad.b} class="cross" />
        {#each series as s (s.id)}
          {@const v = s.points[hover!]?.v}
          {#if v != null}
            <circle cx={tip.left} cy={y(v)} r="4" fill="var(--region-{s.id})" class="dot" />
          {/if}
        {/each}
      {/if}
    </svg>
    <!-- Live pulse on the newest hour. HTML, not SVG, so its loop runs on the compositor instead
         of repainting the chart; the viewBox is 1:1 with pixels, so x() and y() place it. -->
    {#if latest && !tip}
      <span
        class="pulse"
        style:left="{x(n - 1)}px"
        style:top="{y(latest.v)}px"
        style:--c="var(--region-{latest.id})"
        style:--k={series.length - 1}
        aria-hidden="true"
      ><span class="ring"></span><span class="live"></span></span>
    {/if}
  </div>

  {/if}

  <details bind:open={tableOpen}>
    <summary>Show as table</summary>
    {#if tableOpen}
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th scope="col">Hour</th>
            {#each regions as r (r.id)}<th scope="col" class="r">{r.name}</th>{/each}
          </tr>
        </thead>
        <tbody>
          {#each [...(series[0]?.points ?? [])].reverse() as p, k (p.t)}
            {@const i = n - 1 - k}
            <tr>
              <th scope="row">{when(p.t)}</th>
              {#each series as s (s.id)}<td class="r num">{fmt(s.points[i]?.v)}</td>{/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    {/if}
  </details>
</section>

<style>
  /* Side by side, each as wide as its share of options; stacked full width on the narrowest phones. */
  .controls {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);
    gap: 8px;
    margin: 14px 0 10px;
  }
  .span {
    grid-column: 1 / -1;
  }
  @media (max-width: 359px) {
    .controls {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  .readout {
    margin: 0 0 6px;
  }
  .readout-time {
    margin: 0 0 4px;
    font-size: 0.75rem;
    color: var(--muted);
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 14px;
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: 0.8125rem;
    color: var(--ink-2);
  }
  .legend li {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .legend b {
    color: var(--ink);
    font-weight: 600;
  }
  .key {
    display: inline-block;
    width: 12px;
    height: 3px;
    border-radius: 2px;
  }
  .plot {
    position: relative;
    min-width: 0;
  }
  svg {
    display: block;
    overflow: visible;
    touch-action: pan-y;
    user-select: none;
  }
  .grid {
    stroke: var(--grid);
    stroke-width: 1;
  }
  .base {
    stroke: var(--axis);
    stroke-width: 1;
  }
  .band {
    stroke: var(--axis);
    stroke-width: 1;
  }
  .band-label {
    fill: var(--muted);
    font-size: 0.75rem;
    /* halo so the label stays legible where lines cross it */
    paint-order: stroke;
    stroke: var(--card);
    stroke-width: 3px;
    stroke-linejoin: round;
  }
  .tick {
    fill: var(--muted);
    font-size: 0.75rem;
    font-variant-numeric: tabular-nums;
  }
  .line {
    fill: none;
    stroke-width: 2;
    stroke-linejoin: round;
    stroke-linecap: round;
  }
  .pulse {
    position: absolute;
    pointer-events: none;
  }
  .pulse > span {
    position: absolute;
    left: -4px;
    top: -4px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--c);
  }
  .live {
    box-shadow: 0 0 0 2px var(--card);
  }
  /* Under reduced motion the lines and the dot simply appear, and the ring stays hidden under it. */
  @media (prefers-reduced-motion: no-preference) {
    /* Draw-in: each line traces left to right (pathLength="1" makes the dash one line long),
       a region every 60ms (--k). */
    .line {
      stroke-dasharray: 1;
      stroke-dashoffset: 1;
    }
    .plot:global([data-revealed]) .line {
      animation: draw 600ms var(--ease-out) calc(var(--k) * 60ms) both;
    }
    /* The pulse fades in after the last line (--k is the last line's index), then a ring
       spreads and fades. */
    .pulse {
      opacity: 0;
    }
    .plot:global([data-revealed]) .pulse {
      opacity: 1;
      transition: opacity 200ms var(--ease-out) calc(var(--k) * 60ms + 600ms);
    }
    .ring {
      animation: ping 2.4s var(--ease-out) infinite;
    }
  }
  @keyframes draw {
    to {
      stroke-dashoffset: 0;
    }
  }
  .cross {
    stroke: var(--axis);
    stroke-width: 1;
  }
  .dot {
    stroke: var(--card);
    stroke-width: 2;
  }
  .empty {
    margin: 12px 0;
    padding: 32px 12px;
    border-radius: 12px;
    background: var(--control);
    text-align: center;
    font-size: 0.875rem;
    color: var(--ink-2);
  }
  details {
    margin-top: 10px;
    font-size: 0.875rem;
  }
  .table-wrap {
    max-height: 280px;
    overflow: auto;
    overscroll-behavior: contain;
  }
  table {
    width: 100%;
    border-collapse: collapse;
  }
  th,
  td {
    padding: 6px 4px;
    border-top: 1px solid var(--hairline);
    text-align: left;
    font-weight: 400;
  }
  thead th {
    position: sticky;
    top: 0;
    background: var(--card);
    color: var(--muted);
    font-size: 0.75rem;
    font-weight: 600;
  }
  .r {
    text-align: right;
  }
</style>
