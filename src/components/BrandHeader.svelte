<script lang="ts">
  import type { Snapshot } from '../lib/api';
  import { sgtHour } from '../lib/format';

  let { snapshot }: { snapshot: Snapshot | null } = $props();
</script>

<header>
  <img class="logo" src="/logo.svg" alt="" width="40" height="40" />
  <div class="text">
    <h1>I’m going hazelnuts!</h1>
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
  .logo {
    flex: none;
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
</style>
