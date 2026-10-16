<script lang="ts">
  import { onMount } from 'svelte';
  import { REGION_NAMES } from '../../tgcloud/lib/config.js';
  import { loadCameras, type CamerasResult } from '../lib/api';
  import { STALE_MS, timeAgo } from '../lib/format';
  import { openLink } from '../lib/telegram';

  const SATELLITE = [
    { title: 'Satellite pictures of the smoke', meta: 'Himawari images of Sumatra and Malaysia, from ASMC', link: 'https://asmc.asean.org/satellite-geo-sat/' },
    { title: 'Fire hotspots around the region', meta: 'Daily hotspot map, from ASMC', link: 'https://asmc.asean.org/asmc-hotspot/' },
  ];

  let result = $state<CamerasResult | null>(null);
  let error = $state<string | null>(null);
  let broken = $state<Record<string, boolean>>({});
  // Pictures are full-size (1920×1080), so only the tiles scrolled to (plus the next one) load.
  let reach = $state(2);

  async function load() {
    error = null;
    try {
      result = await loadCameras();
      broken = {};
    } catch {
      // Our own words, not the transport's: a failed call here only ever means no pictures.
      error = 'Couldn’t load the camera pictures. Check your connection and try again.';
    }
  }

  onMount(load);

  function onRowScroll(e: Event) {
    const row = e.currentTarget as HTMLElement;
    const tile = (row.firstElementChild as HTMLElement | null)?.offsetWidth ?? row.clientWidth;
    reach = Math.max(reach, Math.ceil((row.scrollLeft + row.clientWidth) / tile) + 1);
  }

  function open(e: MouseEvent, link: string) {
    if (openLink(link)) e.preventDefault();
  }
</script>

<section class="card" aria-labelledby="views-title">
  <h2 id="views-title" class="section-title">Live views</h2>
  <p class="note">
    LTA’s road cameras at Woodlands, Tuas and Sentosa, the only ones still running. On hazy days the view looks grey
    and washed out.
  </p>

  {#if error}
    <div class="state">
      <p class="error" role="alert">{error}</p>
      <button type="button" class="primary" onclick={load}>Try again</button>
    </div>
  {:else if !result}
    <div class="row" aria-busy="true" aria-label="Loading camera pictures">
      {#each [0, 1] as i (i)}<div class="tile"><div class="frame sk"></div></div>{/each}
    </div>
  {:else if !result.cameras?.length}
    <p class="note empty">No cameras are sending pictures right now.</p>
  {:else}
    <ul class="row" onscroll={onRowScroll}>
      {#each result.cameras as cam, i (cam.id)}
        {@const stale = result.serverTime - Date.parse(cam.takenAt) > STALE_MS}
        <li class="tile">
          <a href={cam.image} target="_blank" rel="noopener noreferrer" onclick={(e) => open(e, cam.image)}>
            <div class="frame">
              {#if broken[cam.id]}
                <span class="note missing">Picture didn’t load</span>
              {:else if i < reach}
                <img
                  src={cam.image}
                  alt="Road camera view: {cam.name}"
                  loading="lazy"
                  decoding="async"
                  onload={(e) => e.currentTarget.classList.add('loaded')}
                  onerror={() => (broken[cam.id] = true)}
                />
              {/if}
            </div>
            <span class="name">{cam.name}</span>
            <span class="note meta">
              {cam.region ? `${REGION_NAMES[cam.region]} · ` : ''}{timeAgo(cam.takenAt, result.serverTime)}{#if stale}{' · '}<span class="stale">May be out of date</span>{/if}
            </span>
          </a>
        </li>
      {/each}
    </ul>
  {/if}

  <h3 class="sub">From above</h3>
  <ul class="links">
    {#each SATELLITE as s (s.link)}
      <li>
        <a href={s.link} target="_blank" rel="noopener noreferrer" onclick={(e) => open(e, s.link)}>
          <span class="headline">{s.title}</span>
          <span class="note meta">{s.meta}</span>
        </a>
      </li>
    {/each}
  </ul>
</section>

<style>
  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  /* Bleeds to the card edges so tiles scroll under the padding; the next tile peeks to show there's more. */
  .row {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: min(78%, 280px);
    gap: 10px;
    margin: 12px -16px 0;
    padding: 0 16px 4px;
    overflow-x: auto;
    overscroll-behavior-x: contain;
    scroll-snap-type: x mandatory;
    scroll-padding-inline: 16px;
    scrollbar-width: none;
  }
  .row::-webkit-scrollbar {
    display: none;
  }
  .tile {
    scroll-snap-align: start;
    min-width: 0;
  }
  .tile a {
    display: grid;
    gap: 2px;
    color: inherit;
    text-decoration: none;
    touch-action: manipulation;
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
  }
  .frame {
    display: grid;
    place-items: center;
    aspect-ratio: 16 / 9;
    margin-bottom: 6px;
    overflow: hidden;
    border-radius: 12px;
    background: var(--control);
    transition: transform 120ms var(--ease-out);
  }
  .tile a:active .frame {
    transform: scale(0.97);
  }
  .tile a:focus-visible {
    outline: none;
  }
  .tile a:focus-visible .frame {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    opacity: 0;
    transition: opacity 200ms var(--ease-out);
    /* The picture is a control here: no long-press save sheet or drag ghost. */
    -webkit-touch-callout: none;
    -webkit-user-drag: none;
  }
  img:global(.loaded) {
    opacity: 1;
  }
  .name {
    font-weight: 600;
    font-size: 0.9375rem;
    overflow-wrap: anywhere;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
  }
  .stale {
    color: var(--status-critical);
  }
  .links li + li {
    border-top: 1px solid var(--hairline);
  }
  .links a {
    display: grid;
    gap: 2px;
    min-height: 44px;
    margin: 0 -8px;
    padding: 10px 8px;
    border-radius: 10px;
    color: inherit;
    text-decoration: none;
    touch-action: manipulation;
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
    transition: background-color 100ms var(--ease-out);
  }
  .links a:active {
    background: color-mix(in srgb, var(--ink) 6%, transparent);
  }
  @media (hover: hover) and (pointer: fine) {
    .links a:hover {
      background: color-mix(in srgb, var(--ink) 4%, transparent);
    }
  }
  .links a:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
  .headline {
    font-weight: 600;
    color: var(--ink);
  }
  .empty {
    margin-top: 12px;
  }
  .state {
    margin-top: 12px;
  }
  @media (prefers-reduced-motion: reduce) {
    .frame,
    .links a {
      transition: none;
    }
  }
</style>
