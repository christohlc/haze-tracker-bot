<script lang="ts">
  import { onMount } from 'svelte';
  import { MAP_HEIGHT, MAP_SCALE, MAP_WIDTH, project } from '../../tgcloud/lib/hazemap-parse.js';
  import { loadHazeMap, type HazeMapResult } from '../lib/api';
  import { LAND } from '../lib/coast';
  import { ambient } from '../lib/motion';
  import { sgtDayName, timeAgo } from '../lib/format';

  // NEA redraws the map once or twice a day; past two days its texts are likely left over from an episode.
  const OLD_MS = 48 * 3_600_000;
  const [SG_X, SG_Y] = project(103.82, 1.35);
  const VIEW = `0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`;
  // Places to find your way by, put on land (or just off it) away from Singapore's label.
  const PLACES: [string, number, number][] = [
    ['Malaysia', 101.4, 4.6],
    ['Sumatra', 99.6, 0.6],
    // NEA counts hotspots by Kalimantan, Borneo's Indonesian part, so the map uses its name too.
    ['Kalimantan', 111.6, 1.4],
    ['Java', 109.6, -8.4],
  ];

  let result = $state<HazeMapResult | null>(null);
  let error = $state<string | null>(null);
  // On by default: it shows which way the smoke is heading. NEA's picture is ~260 KB, loaded from haze.gov.sg.
  let showWind = $state(true);
  let windBroken = $state(false);

  const map = $derived(result?.map ?? null);
  const hot = $derived(map?.hotspots ?? null);
  const haze = $derived(map?.haze ?? null);
  const old = $derived(!!map?.updatedAt && result!.serverTime - Date.parse(map.updatedAt) > OLD_MS);

  /** Rings of flat [lon, lat, …] → one SVG path. */
  function areaPath(areas: number[][][]) {
    let d = '';
    for (const rings of areas)
      for (const r of rings) {
        d += 'M';
        for (let i = 0; i < r.length; i += 2) d += `${i ? 'L' : ''}${project(r[i], r[i + 1]).join(' ')}`;
        d += 'Z';
      }
    return d;
  }

  // Every hotspot as one path of circles: thousands of <circle>s would be thousands of nodes.
  const dots = $derived.by(() => {
    const flat = hot?.dots ?? [];
    let d = '';
    for (let i = 0; i < flat.length; i += 3) {
      const r = Math.round(Math.min(1.6 + Math.sqrt(flat[i + 2]) * 0.7, 5) * 10) / 10;
      const [cx, cy] = project(flat[i], flat[i + 1]);
      d += `M${(cx - r).toFixed(1)} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
    }
    return d;
  });
  const moderate = $derived(haze ? areaPath(haze.moderate) : '');
  const dense = $derived(haze ? areaPath(haze.dense) : '');
  const hasHaze = $derived(!!(moderate || dense));

  const summary = $derived.by(() => {
    if (!hot && !haze) return 'NEA’s hotspots and haze areas didn’t load this time.';
    if (hot && !hot.total && !hasHaze) return 'NEA’s map shows no fires or smoke haze in the region right now.';
    if (!hot) return 'NEA’s haze areas are shown. Its hotspots didn’t load this time.';
    const n = (v: number) => v.toLocaleString('en-GB');
    const when = hot.date ? ` ${sgtDayName(hot.date, result!.serverTime)}` : '';
    const near = (['Sumatra', 'Kalimantan'] as const).filter((r) => hot.regions[r]).map((r) => `${n(hot.regions[r])} in ${r}`);
    if (!hot.total) return `Satellites spotted no fires in the region${when}.`;
    return `Satellites spotted ${n(hot.total)} hotspot${hot.total === 1 ? '' : 's'} in the region${when}${near.length ? `, ${near.join(' and ')}` : ''}.`;
  });

  // NEA's two texts under their own headings, skipping one it left out.
  const texts = $derived(
    (
      [
        ['Latest weather and haze situation', map?.situation],
        ['Weather and haze outlook', map?.outlook],
      ] as const
    ).flatMap(([title, text]) => (text ? [{ title, paragraphs: text.split('\n\n') }] : [])),
  );

  async function load() {
    error = null;
    try {
      result = await loadHazeMap();
    } catch {
      error = 'Couldn’t load NEA’s haze map. Check your connection.';
    }
  }

  onMount(load);
</script>

<section class="card" aria-labelledby="map-title">
  <h2 id="map-title" class="section-title">Where it’s coming from</h2>
  <p class="note">NEA’s map of fires and smoke haze in the region around Singapore.</p>

  {#if error}
    <div class="state">
      <p class="error" role="alert">{error}</p>
      <button type="button" class="primary" onclick={load}>Try again</button>
    </div>
  {:else if !result}
    <div class="frame sk" style:aspect-ratio="{MAP_WIDTH} / {MAP_HEIGHT}" aria-busy="true" aria-label="Loading NEA’s haze map"></div>
  {:else if !map}
    <p class="note empty">NEA’s haze map isn’t available right now.</p>
  {:else}
    <figure>
      <!-- Three stacked SVGs: the map, the fires, then the labels (see the CSS). -->
      <div class="frame" style:aspect-ratio="{MAP_WIDTH} / {MAP_HEIGHT}" use:ambient>
        <svg viewBox={VIEW} role="img" aria-label="Map of Singapore and the region. {summary}">
          <path class="land" d={LAND} />
          <g class="layer">
            {#if moderate}<path class="haze moderate" d={moderate} />{/if}
            {#if dense}<path class="haze dense" d={dense} />{/if}
            {#if showWind && map.wind && !windBroken}
              <!-- NEA's picture covers a wider box than ours; the frame clips it. -->
              <image
                class="wind"
                href={map.wind.image}
                x={project(map.wind.box.west, map.wind.box.north)[0]}
                y={project(map.wind.box.west, map.wind.box.north)[1]}
                width={(map.wind.box.east - map.wind.box.west) * MAP_SCALE}
                height={(map.wind.box.north - map.wind.box.south) * MAP_SCALE}
                preserveAspectRatio="none"
                onerror={() => (windBroken = true)}
              />
            {/if}
          </g>
        </svg>
        {#if dots}
          <div class="overlay layer">
            <svg class="embers" viewBox={VIEW} aria-hidden="true"><path class="fire" d={dots} /></svg>
          </div>
        {/if}
        <span class="sg-ping" style:left="{(SG_X / MAP_WIDTH) * 100}%" style:top="{(SG_Y / MAP_HEIGHT) * 100}%" aria-hidden="true"></span>
        <svg class="overlay" viewBox={VIEW} aria-hidden="true">
          {#each PLACES as [name, lon, lat] (name)}
            {@const [px, py] = project(lon, lat)}
            <text class="place" x={px} y={py}>{name}</text>
          {/each}
          <circle class="sg" cx={SG_X} cy={SG_Y} r="4" />
          <text class="sg-label" x={SG_X + 8} y={SG_Y - 6}>Singapore</text>
        </svg>
      </div>
      <!-- A key only for what's on the map: on a clear day it would explain nothing. -->
      {#if dots || hasHaze}
        <figcaption>
          <ul class="legend">
            {#if dots}<li><span class="key fire-key" aria-hidden="true"></span>Hotspot (fire)</li>{/if}
            {#if moderate}<li><span class="key moderate-key" aria-hidden="true"></span>Moderate haze</li>{/if}
            {#if dense}<li><span class="key dense-key" aria-hidden="true"></span>Dense haze</li>{/if}
          </ul>
        </figcaption>
      {/if}
    </figure>

    <p class="text summary">{summary}</p>

    {#if map.wind}
      <label class="row">
        <span>
          <span class="row-title">Wind about 760 m up</span>
          <span class="note">
            {#if windBroken}NEA’s wind picture didn’t load.
            {:else}The height smoke travels at. Arrows point where it blows; deeper blue is stronger.{/if}
          </span>
        </span>
        <input type="checkbox" role="switch" bind:checked={showWind} disabled={windBroken} />
      </label>
    {/if}

    {#if texts.length}
      <details>
        <summary>
          <span>NEA’s haze situation and outlook</span>
          <span class="more" aria-hidden="true"><span class="show">Read</span><span class="hide">Hide</span></span>
        </summary>
        {#each texts as t (t.title)}
          <h3 class="subhead">{t.title}</h3>
          {#each t.paragraphs as p}<p class="nea">{p}</p>{/each}
        {/each}
      </details>
    {/if}

    <p class="note meta">
      NEA via haze.gov.sg{#if map.updatedAt}{' · '}updated {timeAgo(map.updatedAt, result.serverTime)}{/if}{#if old}{' · '}<span class="stale-note"><span class="status-dot stale" aria-hidden="true"></span>May be out of date</span>{/if}
    </p>
  {/if}
</section>

<style>
  figure {
    margin: 12px 0 0;
  }
  .frame {
    position: relative;
    overflow: hidden;
    border-radius: 12px;
    background: var(--map-sea);
  }
  svg {
    display: block;
    width: 100%;
    height: 100%;
    /* A picture, not a control: no long-press save sheet, no text selection on its labels. */
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
  }
  .land {
    fill: var(--map-land);
    stroke: var(--map-coast);
    stroke-width: 0.6;
    stroke-linejoin: round;
  }
  /* Layers settle in once when the map arrives, rather than popping onto the land. */
  .layer,
  .wind {
    transition: opacity 200ms var(--ease-out);
  }
  @starting-style {
    .layer,
    .wind {
      opacity: 0;
    }
  }
  .haze {
    fill-rule: evenodd;
    stroke-width: 0.8;
    stroke-linejoin: round;
  }
  .moderate {
    fill: color-mix(in srgb, var(--haze-moderate) 38%, transparent);
    stroke: var(--haze-moderate);
  }
  .dense {
    fill: color-mix(in srgb, var(--haze-dense) 50%, transparent);
    stroke: var(--haze-dense);
  }
  .fire {
    fill: var(--map-fire);
    fill-opacity: 0.85;
    stroke: var(--map-land);
    stroke-width: 0.5;
  }
  .wind {
    opacity: 0.9;
  }
  .overlay {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  /* Fires glow like embers; Singapore gets a slow "you are here" ring under its dot. Both are
     whole layers animating opacity and transform, so the map underneath never repaints. */
  @media (prefers-reduced-motion: no-preference) {
    .embers {
      animation: ember 3s ease-in-out infinite alternate;
    }
    .sg-ping {
      animation: ping 3s var(--ease-out) infinite;
    }
  }
  @keyframes ember {
    from {
      opacity: 0.75;
    }
  }
  .sg-ping {
    --ping-from: 0.35;
    position: absolute;
    width: 12px;
    height: 12px;
    margin: -6px 0 0 -6px;
    border-radius: 50%;
    background: var(--ink);
    opacity: 0;
    pointer-events: none;
  }
  /* NEA draws its strongest winds in navy, which a dark sea would swallow. */
  :global(:root[data-theme='dark']) .wind {
    filter: brightness(1.8);
  }
  .place,
  .sg-label {
    /* About 9.5px on a 320px phone, the smallest that stays readable. */
    font-size: 13px;
    paint-order: stroke;
    stroke: var(--map-land);
    stroke-width: 3px;
    stroke-linejoin: round;
  }
  .place {
    fill: var(--map-label);
    font-weight: 500;
    letter-spacing: 0.02em;
  }
  .sg {
    fill: var(--ink);
    stroke: var(--card);
    stroke-width: 2;
  }
  .sg-label {
    fill: var(--ink);
    font-weight: 700;
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 14px;
    margin: 8px 0 0;
    padding: 0;
    list-style: none;
    font-size: 0.8125rem;
    color: var(--ink-2);
  }
  .legend li {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .key {
    flex: none;
    width: 12px;
    height: 12px;
    border-radius: 3px;
  }
  .fire-key {
    width: 9px;
    height: 9px;
    margin: 0 1.5px;
    border-radius: 50%;
    background: var(--map-fire);
  }
  .moderate-key {
    background: color-mix(in srgb, var(--haze-moderate) 38%, var(--card));
    box-shadow: inset 0 0 0 1px var(--haze-moderate);
  }
  .dense-key {
    background: color-mix(in srgb, var(--haze-dense) 50%, var(--card));
    box-shadow: inset 0 0 0 1px var(--haze-dense);
  }
  p {
    margin: 0;
  }
  .text {
    color: var(--ink-2);
  }
  .summary {
    margin-top: 12px;
  }
  /* The whole switch row is the control: no long-press text selection, no tap delay. */
  label.row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 44px;
    margin-top: 8px;
    padding: 8px 0;
    border-top: 1px solid var(--hairline);
    cursor: pointer;
    touch-action: manipulation;
    user-select: none;
    -webkit-user-select: none;
  }
  label.row > span {
    display: grid;
    min-width: 0;
  }
  .row-title {
    font-weight: 600;
  }
  details {
    border-top: 1px solid var(--hairline);
  }
  summary {
    justify-content: space-between;
    gap: 12px;
    list-style: none;
  }
  summary::-webkit-details-marker {
    display: none;
  }
  summary > span:first-child {
    color: var(--ink);
    font-size: 0.9375rem;
  }
  .hide,
  details[open] .show {
    display: none;
  }
  details[open] .hide {
    display: inline;
  }
  details .subhead {
    margin-top: 4px;
  }
  details .subhead ~ .subhead {
    margin-top: 16px;
  }
  /* NEA's words: content, so selectable and wrapping however long they run. */
  .nea {
    margin-top: 6px;
    color: var(--ink-2);
    overflow-wrap: anywhere;
  }
  .meta {
    margin-top: 10px;
  }
  .empty,
  .state {
    margin-top: 12px;
  }
  .frame.sk {
    margin-top: 12px;
  }
</style>
