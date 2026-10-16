<script lang="ts">
  import { onMount } from 'svelte';
  import type { Snapshot } from '../lib/api';
  import { renderCardUrl, shareCard, type ShareResult } from '../lib/share';
  import { inTelegram, notifyHaptic } from '../lib/telegram';

  let { snapshot }: { snapshot: Snapshot } = $props();

  let url = $state<string | null>(null);
  let busy = $state(false);
  let status = $state<string | null>(null);
  let error = $state<string | null>(null);
  let visible = $state(false);
  let attempt = $state(0); // bumped by Try again to redraw
  let expanded = $state(false);
  let drawFailed = $state(false);

  const DONE: Record<ShareResult, string | null> = {
    shared: 'Shared.',
    cancelled: null,
    sent: 'Sent to your chat with the bot. Forward it from there.',
    downloaded: 'Downloaded haze.png.',
  };

  // Draw the card once the page has settled: it loads ~200 KB of glyphs and map.
  onMount(() => {
    const ric = window.requestIdleCallback;
    if (ric) {
      const id = ric(() => (visible = true), { timeout: 2000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = setTimeout(() => (visible = true), 800);
    return () => clearTimeout(id);
  });

  $effect(() => {
    if (!visible) return;
    void attempt;
    let current: string | null = null;
    let cancelled = false;
    drawFailed = false;
    renderCardUrl(snapshot)
      .then((u) => {
        if (cancelled) return URL.revokeObjectURL(u);
        current = u;
        url = u;
        error = null;
      })
      .catch(() => {
        drawFailed = true;
        error = 'Couldn’t draw the picture.';
      });
    return () => {
      cancelled = true;
      if (current) URL.revokeObjectURL(current);
    };
  });

  async function share() {
    if (!url || busy) return;
    busy = true;
    status = null;
    error = null;
    try {
      const { result, alsoSentToChat } = await shareCard(url);
      status = alsoSentToChat && result !== 'sent' ? `${DONE[result] ?? ''} A copy is also in your chat with the bot.`.trim() : DONE[result];
      if (result !== 'cancelled') notifyHaptic('success');
    } catch (e) {
      error = e instanceof Error ? e.message : 'Couldn’t share the picture. Try again.';
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
      onclick={() => (expanded = !expanded)}
      disabled={!url}
      aria-expanded={expanded}
      aria-label={expanded ? 'Hide the full-size picture' : 'Show the picture full size'}
    >
      {#if url}<img src={url} alt="" />{/if}
    </button>
    <div class="body">
      <h2 id="share-title" class="section-title">Share the haze picture</h2>
      <p class="note">Every region on one image, the same one the bot sends. Both numbers are NEA’s.</p>
      <button type="button" class="primary" onclick={share} disabled={!url || busy} aria-busy={busy}>
        <!-- Both labels share one grid cell, so the button keeps its width while busy. -->
        <span class:hidden={busy}>{inTelegram ? 'Share picture' : 'Download picture'}</span>
        <span class:hidden={!busy} aria-hidden={!busy}>Preparing…</span>
      </button>
      {#if status}<p class="note" role="status">{status}</p>{/if}
      {#if error}
        <p class="error" role="alert">
          {error}
          {#if drawFailed}<button type="button" class="retry" onclick={() => attempt++}>Try again</button>{/if}
        </p>
      {/if}
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
    aspect-ratio: 1080 / 1350;
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
    justify-self: start;
    min-height: 44px;
    padding: 0 18px;
    border: 0;
    border-radius: 12px;
    background: var(--accent);
    color: var(--accent-ink);
    font-weight: 650;
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
  .error {
    margin: 0;
    font-size: 0.875rem;
    color: var(--status-critical);
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
