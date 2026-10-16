<script lang="ts">
  import { psiBand, pm25ToPsi } from '../../tgcloud/lib/psi.js';
  import type { Forecast, HourRow } from '../lib/api';
  import { sgtHour } from '../lib/format';
  import BandPill from './BandPill.svelte';

  let { forecast, history }: { forecast: Forecast; history: HourRow[] } = $props();

  const REGIONS = ['north', 'west', 'central', 'east', 'south'] as const;
  const hour = (iso: string) => Math.floor(Date.parse(iso) / 3_600_000);
  const t0 = $derived(hour(forecast.issuedAt));

  // Past 24h island-wide 1-hour PSI, same definition the model forecasts.
  const past = $derived(
    history
      .map((r) => {
        const xs = REGIONS.map((k) => r[k]).filter((v): v is number => v != null);
        return { dh: hour(r.t) - t0, v: xs.length ? pm25ToPsi(xs.reduce((a, b) => a + b, 0) / xs.length) : null };
      })
      .filter((p) => p.dh >= -24 && p.dh <= 0 && p.v != null) as { dh: number; v: number }[],
  );
  const ahead = $derived([{ dh: 0, v: forecast.now ?? past.at(-1)?.v ?? 0, lo: forecast.now ?? 0, hi: forecast.now ?? 0 }, ...forecast.steps.map((s) => ({ dh: s.h, v: s.psi, lo: s.lo, hi: s.hi }))]);

  let width = $state(320);
  const H = 200;
  const pad = { t: 12, r: 12, b: 24, l: 34 };
  const maxV = $derived.by(() => {
    const m = Math.max(100, ...past.map((p) => p.v), ...ahead.map((a) => a.hi));
    const step = m <= 150 ? 50 : 100;
    return Math.ceil(m / step) * step;
  });
  const x = (dh: number) => pad.l + ((dh + 24) / 48) * (width - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - v / maxV) * (H - pad.t - pad.b);
  const line = (pts: { dh: number; v: number }[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.dh).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
  const band = $derived(
    `${ahead.map((a, i) => `${i ? 'L' : 'M'}${x(a.dh).toFixed(1)},${y(a.hi).toFixed(1)}`).join('')}${[...ahead]
      .reverse()
      .map((a) => `L${x(a.dh).toFixed(1)},${y(a.lo).toFixed(1)}`)
      .join('')}Z`,
  );
  const yTicks = $derived([0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(maxV * f)));
  const xTicks = [-24, -12, 0, 12, 24];
  const tickLabel = (dh: number) => (dh === 0 ? 'Now' : sgtHour(new Date((t0 + dh) * 3_600_000 + 8 * 3_600_000).toISOString().slice(0, 19) + '+08:00'));

  const rangeBand = (lo: number, hi: number) => {
    const a = psiBand(lo)?.label;
    const b = psiBand(hi)?.label;
    return a === b ? a : `${a} to ${b}`;
  };
  const top = $derived(forecast.factors[0]);
  const also = $derived(forecast.factors.slice(1).filter((f) => Math.abs(f.delta) >= 1));
</script>

<section class="card" aria-labelledby="fc-title">
  <h2 id="fc-title" class="section-title">Haze forecast</h2>
  <p class="note">
    Model forecast of the island-wide 1-hour PSI (mean PM2.5 of the five regions, converted with NEA’s breakpoints).
    The range is an 80% interval: about 8 times in 10 the reading should land inside it. Not an official forecast.
  </p>

  <table>
    <thead>
      <tr>
        <th scope="col">Forecast for</th>
        <th scope="col" class="c">1h PSI</th>
        <th scope="col" class="r">80% range</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <th scope="row">Now <span class="when">{sgtHour(forecast.issuedAt)}</span></th>
        <td class="c"><BandPill value={forecast.now} /></td>
        <td class="r muted">–</td>
      </tr>
      {#each forecast.steps as s (s.h)}
        <tr>
          <th scope="row">+{s.h}h <span class="when">{sgtHour(s.t)}</span></th>
          <td class="c"><BandPill value={s.psi} /></td>
          <td class="r">
            <span class="num">{s.lo}–{s.hi}</span>
            <span class="band-text">{rangeBand(s.lo, s.hi)}</span>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>

  {#if top && Math.abs(top.delta) >= 1}
    <p class="factor">
      <b>Biggest factor for the next hour</b> (besides the current PSI): {top.label}, {top.delta > 0 ? 'raising' : 'lowering'}
      the forecast by about {Math.abs(top.delta)} PSI compared with a typical hour.
      {#if also.length}<span class="also">Also: {also.map((f) => `${f.label} (${f.delta > 0 ? '+' : ''}${f.delta})`).join(', ')}.</span>{/if}
    </p>
  {/if}

  <div class="keys" aria-hidden="true">
    <span><i class="k solid"></i>Past 24 h</span>
    <span><i class="k dashed"></i>Forecast</span>
    <span><i class="k area"></i>80% range</span>
  </div>
  <div class="plot" bind:clientWidth={width}>
    <svg viewBox="0 0 {width} {H}" width="100%" height={H} role="img" aria-label="Island-wide 1-hour PSI, past 24 hours and forecast">
      {#each yTicks as t (t)}
        <line x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} class={t === 0 ? 'base' : 'grid'} />
        <text x={pad.l - 6} y={y(t)} class="tick" text-anchor="end" dominant-baseline="middle">{t}</text>
      {/each}
      {#each xTicks as dh (dh)}
        <text x={x(dh)} y={H - 6} class="tick" text-anchor="middle">{tickLabel(dh)}</text>
      {/each}
      <line x1={x(0)} x2={x(0)} y1={pad.t} y2={H - pad.b} class="now" />
      <path d={band} class="area" />
      {#if past.length > 1}<path d={line(past)} class="line" />{/if}
      <path d={line(ahead)} class="line dashed" />
      {#each forecast.steps as s (s.h)}
        <circle cx={x(s.h)} cy={y(s.psi)} r="4" class="dot" />
      {/each}
    </svg>
  </div>
  <p class="note meta">
    Based on data to {sgtHour(forecast.issuedAt, true)} SGT · model v{forecast.model.version}, trained {forecast.model.trainedAt.slice(0, 10)}
  </p>
</section>

<style>
  table {
    width: 100%;
    margin: 12px 0 4px;
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
  .c {
    text-align: center;
  }
  .r {
    text-align: right;
  }
  .muted {
    color: var(--muted);
  }
  .band-text {
    display: block;
    font-size: 0.75rem;
    color: var(--muted);
  }
  .factor {
    margin: 12px 0;
    font-size: 0.875rem;
    color: var(--ink-2);
  }
  .factor b {
    color: var(--ink);
    font-weight: 600;
  }
  .also {
    display: block;
    margin-top: 4px;
  }
  .keys {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 14px;
    margin-bottom: 6px;
    font-size: 0.8125rem;
    color: var(--ink-2);
  }
  .keys span {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .k {
    display: inline-block;
    width: 14px;
    height: 0;
    border-top: 2px solid var(--region-north);
  }
  .k.dashed {
    border-top-style: dashed;
  }
  .k.area {
    height: 8px;
    border: 0;
    border-radius: 2px;
    background: color-mix(in srgb, var(--region-north) 18%, transparent);
  }
  .plot {
    min-width: 0;
  }
  svg {
    display: block;
    overflow: visible;
  }
  .grid {
    stroke: var(--grid);
  }
  .base,
  .now {
    stroke: var(--axis);
  }
  .tick {
    fill: var(--muted);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }
  .area {
    fill: var(--region-north);
    fill-opacity: 0.12;
  }
  .line {
    fill: none;
    stroke: var(--region-north);
    stroke-width: 2;
    stroke-linejoin: round;
    stroke-linecap: round;
  }
  .dashed {
    stroke-dasharray: 4 4;
  }
  .dot {
    fill: var(--region-north);
    stroke: var(--card);
    stroke-width: 2;
  }
  .meta {
    margin-top: 8px;
  }
</style>
