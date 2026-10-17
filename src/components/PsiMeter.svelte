<script lang="ts">
  // NEA's day forecast as a half-dial of the PSI bands, after the meter on haze.gov.sg: NEA's range
  // at full strength over a faded dial, and a tick at today's official 24-hr PSI. The range is NEA's
  // numbers when it gives them, else the span its band words cover (meterSpan).
  import { METER_MAX } from '../../tgcloud/lib/outlook-parse.js';
  import { bandRanges } from '../../tgcloud/lib/psi.js';

  // `words`: NEA's forecast as it said it, for screen readers. `now`: today's official 24-hr PSI.
  let {
    lo,
    hi,
    words,
    now = null,
    children,
  }: { lo: number; hi: number; words: string; now?: number | null; children?: import('svelte').Snippet } = $props();

  // Dial geometry in viewBox units: centre (100, 100), radius 80, from 0 on the left to METER_MAX on the right.
  const R = 80;
  const angle = (v: number) => Math.PI * (1 - Math.min(Math.max(v, 0), METER_MAX) / METER_MAX);
  const at = (v: number, r = R) => ({ x: 100 + r * Math.cos(angle(v)), y: 100 - r * Math.sin(angle(v)) });
  const arc = (a: number, b: number) => {
    const p = at(a);
    const q = at(b);
    return `M ${p.x.toFixed(2)} ${p.y.toFixed(2)} A ${R} ${R} 0 0 1 ${q.x.toFixed(2)} ${q.y.toFixed(2)}`;
  };

  // Each band's stretch of the dial, with a hairline gap between bands. A stretch too short to
  // draw after the gaps is left out rather than drawn backwards.
  const bands = bandRanges(METER_MAX);
  const GAP = 1.5;
  const shown = $derived(
    bands
      .map((b) => ({ id: b.id, from: Math.max(b.from, lo), to: Math.min(b.to, hi) }))
      .filter((b) => b.to - b.from > 2 * GAP),
  );
  const tick = $derived(now == null ? null : { inner: at(now, R - 15), outer: at(now, R + 15), label: at(now, R + 24) });
  // Near either end the label would run off the card: tuck it under that end of the dial instead.
  const edge = $derived(now == null ? null : now >= METER_MAX * 0.85 ? 'right' : now <= METER_MAX * 0.15 ? 'left' : null);
  const SCALE = [100, 200, 300];
</script>

<div class="meter" aria-hidden="true">
  <div class="dial">
    <svg viewBox="0 0 200 108" aria-hidden="true">
      {#each bands as b (b.id)}
        <path d={arc(b.from + GAP, b.to - GAP)} class="track" style:--c="var(--band-{b.id})" />
      {/each}
      {#each shown as b (b.id)}
        <path d={arc(b.from + GAP, b.to - GAP)} class="span" style:stroke="var(--band-{b.id})" />
      {/each}
      {#if tick}
        <line x1={tick.inner.x} y1={tick.inner.y} x2={tick.outer.x} y2={tick.outer.y} class="tick" />
      {/if}
    </svg>
    <!-- Labels are HTML over the dial, so they scale with the user's text size. -->
    {#each SCALE.filter((v) => now == null || Math.abs(v - Math.min(now, METER_MAX)) > 40) as v (v)}
      {@const p = at(v, R + 17)}
      <span class="scale" style:left="{p.x / 2}%" style:top="{(p.y / 108) * 100}%">{v}</span>
    {/each}
    {#if tick && now != null}
      {#if edge}
        <span class="now at-edge {edge}">today <span class="num">{now}</span></span>
      {:else}
        <span class="now" style:left="{tick.label.x / 2}%" style:top="{(tick.label.y / 108) * 100}%">
          today <span class="num">{now}</span>
        </span>
      {/if}
    {/if}
  </div>
  <div class="centre">{@render children?.()}</div>
</div>
<p class="visually-hidden">
  NEA forecasts {words}.{now != null ? ` Today’s official 24-hour PSI is ${now}.` : ''}
</p>

<style>
  .meter {
    width: min(100%, 320px);
    margin: 18px auto 4px;
  }
  .dial {
    position: relative;
  }
  /* Room for a "now" label tucked under an end of the dial. */
  .dial:has(.at-edge) {
    margin-bottom: 1.4em;
  }
  svg {
    display: block;
    width: 100%;
    overflow: visible;
  }
  path {
    fill: none;
    stroke-width: 18;
    stroke-linecap: butt;
  }
  .track {
    stroke: color-mix(in srgb, var(--c) 24%, transparent);
  }
  .tick {
    stroke: var(--ink);
    stroke-width: 2.5;
    stroke-linecap: round;
  }
  .scale,
  .now {
    position: absolute;
    transform: translate(-50%, -50%);
    font-size: 0.6875rem;
    color: var(--muted);
    white-space: nowrap;
    pointer-events: none;
  }
  .now {
    font-weight: 650;
    color: var(--ink);
  }
  .at-edge {
    top: 100%;
    transform: translateY(2px);
  }
  .at-edge.right {
    right: 0;
  }
  .at-edge.left {
    left: 0;
  }
  /* Under the dial rather than inside it, so large text never covers the arc. */
  .centre {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    align-items: center;
    gap: 4px 6px;
    margin-top: 6px;
  }
</style>
