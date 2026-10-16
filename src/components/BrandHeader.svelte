<script lang="ts">
  import type { Snapshot } from '../lib/api';
  import { sgtHour } from '../lib/format';

  // onsecret: tapping the logo or the name opens the hidden game.
  let { snapshot, onsecret }: { snapshot: Snapshot | null; onsecret?: () => void } = $props();
</script>

<header>
  <!-- One tab stop for the secret (the name); the logo is the same thing for fingers only. -->
  <button type="button" class="logo" tabindex="-1" aria-hidden="true" onclick={onsecret}>
    <img src="/logo.svg" alt="" width="40" height="40" />
  </button>
  <div class="text">
    <h1><button type="button" class="name" onclick={onsecret}>I’m going hazelnuts!</button></h1>
    <p class="status">
      {#if snapshot}
        <span class="dot" class:stale={snapshot.stale} aria-hidden="true"></span>
        NEA · {snapshot.stale ? 'last reading' : 'updated'} {sgtHour(snapshot.asOf, true)} SGT
      {:else}
        Haze in Singapore, hour by hour
      {/if}
    </p>
  </div>
</header>

<style>
  header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 6px 2px 14px;
  }
  /* The logo and the name are buttons for the hidden game, but look like plain branding. */
  .logo,
  .name {
    padding: 0;
    border: 0;
    background: none;
    font: inherit;
    color: inherit;
    letter-spacing: inherit;
    text-align: inherit;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition: transform 160ms var(--ease-out);
  }
  .logo:active,
  .name:active {
    transform: scale(0.97);
  }
  /* Hit areas grow to 44px without moving anything. */
  .logo {
    flex: none;
    display: block;
    padding: 2px;
    margin: -2px;
  }
  .name {
    padding-block: 8px;
    margin-block: -8px;
  }
  .logo img {
    display: block;
    border-radius: 12px;
    box-shadow: 0 1px 0 rgba(0, 0, 0, 0.06);
  }
  .text {
    min-width: 0;
  }
  h1 {
    margin: 0;
    font-family: var(--font-display);
    font-size: 1.25rem;
    font-weight: 800;
    line-height: 1.15;
    letter-spacing: -0.015em;
    color: var(--brand-shell);
  }
  .status {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 2px 0 0;
    font-size: 0.8125rem;
    color: var(--muted);
  }
  .dot {
    --c: var(--status-good);
    flex: none;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--c);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--c) 22%, transparent);
  }
  .dot.stale {
    --c: var(--band-unhealthy);
  }
  @media (prefers-reduced-motion: reduce) {
    .logo,
    .name {
      transition: none;
    }
  }
</style>
