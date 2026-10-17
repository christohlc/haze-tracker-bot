<script lang="ts">
  import type { HourRow, RegionId, Snapshot } from '../lib/api';
  import { fmt, sgtHour } from '../lib/format';
  import { niceMax, niceTicks, rollingSeries, type Scale, type Window } from '../lib/series';
  import Segmented from './Segmented.svelte';

  let { snapshot, history }: { snapshot: Snapshot; history: HourRow[] } = $props();

  let scale = $state<Scale>('pm25');
  let win = $state<Window>(1);
  let width = $state(320);
  let hover = $state<number | null>(null);

  const H = 220;
  const pad = { t: 12, r: 12, b: 24, l: 34 };

  const regions = $derived(snapshot.regions.map((r) => ({ id: r.id as RegionId, name: r.name })));
  const series = $derived(regions.map((r) => ({ ...r, points: rollingSeries(history, r.id, win, scale) })));
  const n = $derived(series[0]?.points.length ?? 0);
  const yTicks = $derived(
    niceTicks(niceMax(Math.max(scale === 'psi' ? 100 : 55, ...series.flatMap((s) => s.points.map((p) => p.v ?? 0))))),
  );
  const maxV = $derived(yTicks[yTicks.length - 1]);

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

  const xTicks = $derived(
    (series[0]?.points ?? [])
      .map((p, i) => ({ i, t: p.t }))
      .filter(({ t }) => Number(t.slice(11, 13)) % (width < 420 ? 6 : 4) === 0),
  );

  // Band edges: NEA PSI bands, and the matching PM2.5 1-hour bands.
  const BANDS = {
    psi: [
      { v: 50, label: 'Moderate' },
      { v: 100, label: 'Unhealthy' },
      { v: 200, label: 'Very unhealthy' },
      { v: 300, label: 'Hazardous' },
    ],
    pm25: [
      { v: 55, label: 'Band II' },
      { v: 150, label: 'Band III' },
      { v: 250, label: 'Band IV' },
    ],
  };
  const bandLines = $derived.by(() => {
    // Keep the line, but drop a label that would sit on top of the one below it.
    let lastY = Infinity;
    return BANDS[scale]
      .filter((b) => b.v < maxV)
      .map((b) => {
        const showLabel = lastY - y(b.v) >= 14;
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

  const tip = $derived(hover == null || !series[0] ? null : { t: series[0].points[hover].t, left: x(hover) });

  const unit = $derived(scale === 'psi' ? 'PSI' : 'µg/m³');
  const winLabel = $derived(win === 1 ? '1-hour' : win === 3 ? '3-hour' : '24-hour');
</script>

<section class="card" aria-labelledby="hist-title">
  <h2 id="hist-title" class="section-title">Past 24 hours</h2>
  <p class="note">
    Rolling {winLabel} averages ending at each hour. The PSI view converts PM2.5 with NEA’s breakpoints, so its
    24-hour line can differ slightly from the official PSI.
  </p>

  <div class="controls">
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
        { value: 1, label: '1h' },
        { value: 3, label: '3h' },
        { value: 24, label: '24h' },
      ]}
    />
  </div>

  <!-- The legend doubles as the readout while scrubbing, so nothing covers the lines. -->
  <div class="readout">
    <p class="readout-time">{tip ? `${sgtHour(tip.t)} · ${unit}` : `Latest hour · ${unit}`}</p>
    <ul class="legend" aria-label="Regions">
      {#each regions as r, k (r.id)}
        {@const v = series[k].points[hover ?? n - 1]?.v ?? null}
        <li><span class="key" style:background="var(--region-{r.id})"></span>{r.name} <b class="num">{fmt(v)}</b></li>
      {/each}
    </ul>
  </div>

  {#if !series.some((s) => s.points.some((p) => p.v != null))}
    <p class="empty">No readings in the past 24 hours yet.</p>
  {:else}
  <div class="plot" bind:clientWidth={width}>
    <svg
      viewBox="0 0 {width} {H}"
      width="100%"
      height={H}
      role="img"
      aria-label="{winLabel} {unit} by region over the past 24 hours"
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
        <text x={x(tk.i)} y={H - 6} class="tick" text-anchor="middle">{sgtHour(tk.t)}</text>
      {/each}

      {#each series as s (s.id)}
        <path d={path(s.points)} stroke="var(--region-{s.id})" class="line" />
      {/each}
      <!-- Band names go on top of the lines; their halo keeps them legible where lines cross. -->
      {#each bandLines as b (b.v)}
        {#if b.showLabel}
          <text x={width - pad.r} y={y(b.v) - 4} class="band-label" text-anchor="end">{b.label}</text>
        {/if}
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

  </div>

  {/if}

  <details>
    <summary>Show as table</summary>
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
              <th scope="row">{sgtHour(p.t)}</th>
              {#each series as s (s.id)}<td class="r num">{fmt(s.points[i]?.v)}</td>{/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
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
    font-size: 10px;
    /* halo so the label stays legible where lines cross it */
    paint-order: stroke;
    stroke: var(--card);
    stroke-width: 3px;
    stroke-linejoin: round;
  }
  .tick {
    fill: var(--muted);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }
  .line {
    fill: none;
    stroke-width: 2;
    stroke-linejoin: round;
    stroke-linecap: round;
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
