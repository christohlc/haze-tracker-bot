<script lang="ts">
  import { onMount } from 'svelte';
  import { CARD_H, CARD_W } from '../../tgcloud/lib/card/geometry.js';
  import type { Snapshot } from '../lib/api';
  import { renderCardUrl, shareCard, type ShareResult } from '../lib/share';
  import { inTelegram, notifyHaptic } from '../lib/telegram';

  let { snapshot }: { snapshot: Snapshot } = $props();

  let url = $state<string | null>(null);
  let busy = $state(false);
  let status = $state<string | null>(null);
  let drawError = $state<string | null>(null);
  let shareError = $state<string | null>(null);
  let attempt = $state(0); // bumped by Try again to redraw
  let expanded = $state(false);
  // With no readings at all the picture is only dashes, so there’s nothing worth sending.
  const empty = $derived(!snapshot.worst.psi24h && !snapshot.worst.pm25);

  const DONE: Record<Exclude<ShareResult, 'cancelled'>, string> = {
    shared: 'Shared.',
    sent: 'Sent to your chat with the bot. Forward it from there.',
    downloaded: 'Downloaded haze.png.',
  };

  // Draw the card once the page has settled (it loads ~200 KB of glyphs and map), and again when
  // the readings change. The old picture stays up until the new one is ready.
  $effect(() => {
    void attempt;
    if (empty) return;
    const snap = snapshot;
    let cancelled = false;
    const draw = () =>
      renderCardUrl(snap)
        .then((u) => {
          if (cancelled) return URL.revokeObjectURL(u);
          if (url) URL.revokeObjectURL(url);
          url = u;
          drawError = null;
        })
        .catch(() => {
          if (!cancelled) drawError = 'Couldn’t draw the picture.';
        });
    // Older WebViews (iOS Safari before 18) have no requestIdleCallback.
    const idle = 'requestIdleCallback' in window;
    const id = idle ? requestIdleCallback(draw, { timeout: 2000 }) : setTimeout(draw, 800);
    return () => {
      cancelled = true;
      if (idle) cancelIdleCallback(id as number);
      else clearTimeout(id);
    };
  });

  onMount(() => () => {
    if (url) URL.revokeObjectURL(url);
  });

  async function share() {
    if (!url || busy) return;
    busy = true;
    status = null;
    shareError = null;
    try {
      const { result, alsoSentToChat } = await shareCard(url);
      const copy = alsoSentToChat ? 'A copy is also in your chat with the bot.' : null;
      status = result === 'cancelled' ? copy : [DONE[result], copy].filter(Boolean).join(' ');
      if (result !== 'cancelled') notifyHaptic('success');
    } catch (e) {
      shareError = e instanceof Error ? e.message : 'Couldn’t share the picture. Try again.';
      notifyHaptic('error');
    } finally {
      busy = false;
    }
  }
</script>

<section class="card share" aria-labelledby="share-title">
  <div class="row">
    <button
      type="button"
      class="thumb"
      style:aspect-ratio="{CARD_W} / {CARD_H}"
      onclick={() => (expanded = !expanded)}
      disabled={!url}
      aria-expanded={expanded}
      aria-label={expanded ? 'Hide the full-size picture' : 'Show the picture full size'}
    >
      {#if url}<img src={url} alt="" />{/if}
    </button>
    <div class="body">
      <h2 id="share-title" class="section-title">Share the haze update</h2>
      <p class="note">Every region’s NEA readings on one picture, as the bot sends it.</p>
      {#if empty}
        <p class="note">You can share it once NEA publishes a reading.</p>
      {:else}
        <button type="button" class="primary" onclick={share} disabled={!url || busy} aria-busy={busy}>
          <!-- Both labels share one grid cell, so the button keeps its width while busy. -->
          <span class:hidden={busy}>{inTelegram ? 'Share' : 'Download'}</span>
          <span class:hidden={!busy} aria-hidden={!busy}>Preparing…</span>
        </button>
      {/if}
      {#if status}<p class="note" role="status">{status}</p>{/if}
      {#if drawError}
        <p class="error" role="alert">
          {drawError}
          <button type="button" class="retry" onclick={() => attempt++}>Try again</button>
        </p>
      {/if}
      {#if shareError}<p class="error" role="alert">{shareError}</p>{/if}
    </div>
  </div>
  {#if expanded && url}
    <img class="full" src={url} alt="Each region’s 24-hour PSI and 1-hour PM2.5 on a map of Singapore" />
  {/if}
</section>

<style>
  .share {
    display: grid;
    gap: 14px;
  }
  .row {
    display: flex;
    gap: 14px;
    align-items: flex-start;
  }
  .thumb {
    flex: none;
    width: 96px;
    padding: 0;
    border: 0;
    border-radius: 10px;
    overflow: hidden;
    background: color-mix(in srgb, var(--brand-haze) 22%, var(--card));
  }
  .thumb:disabled {
    opacity: 1;
  }
  .thumb img,
  .full {
    display: block;
    width: 100%;
    animation: appear 220ms var(--ease-out);
  }
  .thumb img {
    height: 100%;
  }
  .full {
    height: auto;
    border-radius: 12px;
  }
  .body {
    display: grid;
    gap: 8px;
    min-width: 0;
  }
  .body .section-title {
    margin: 0;
  }
  button {
    font: inherit;
    cursor: pointer;
    transition: transform 120ms var(--ease-out);
  }
  button:active:not(:disabled) {
    transform: scale(0.97);
  }
  button:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .primary {
    display: inline-grid;
    place-items: center; /* the label sits in the middle however tall the button gets */
    justify-self: start;
    align-self: start; /* don't stretch with the row */
    min-width: 96px;
    min-height: 44px;
    padding: 0 22px;
  }
  .primary > span {
    grid-area: 1 / 1;
  }
  .hidden {
    visibility: hidden;
  }
  .retry {
    min-height: 44px;
    padding: 0 0 0 6px;
    border: 0;
    background: none;
    color: var(--link);
    font-weight: 600;
  }
  @keyframes appear {
    from {
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    button {
      transition: none;
    }
    .thumb img,
    .full {
      animation: none;
    }
  }
</style>
