<script lang="ts">
  import { bandById, psiBand } from '../../tgcloud/lib/psi.js';

  // For NEA's outlook, which names bands: pass `bandId` with `showLabel`. `text` draws a neutral pill
  // (no band colour, which only ever means a PSI band), for another scale's number.
  let {
    value = null,
    bandId = null,
    showLabel = false,
    size = 'sm',
    text = null,
  }: { value?: number | null; bandId?: string | null; showLabel?: boolean; size?: 'sm' | 'lg'; text?: string | null } = $props();
  const band = $derived(bandId ? bandById(bandId) : psiBand(value));
</script>

{#if text != null}
  <span class="pill neutral {size}">{text}</span>
{:else if band}
  <span
    class="pill {size}"
    style:background="var(--band-{band.id})"
    style:color="var(--band-{band.id}-ink)"
    title={band.label}
  >
    {showLabel ? band.label : value}
    {#if !showLabel}<span class="visually-hidden">, {band.label}</span>{/if}
  </span>
{:else}
  <span class="pill empty {size}">–</span>
{/if}

<style>
  .pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 3.25ch;
    padding: 2px 7px;
    border-radius: 999px;
    font-weight: 650;
    font-size: 0.8125rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.4;
    white-space: nowrap;
  }
  .lg {
    padding: 4px 12px;
    font-size: 0.9375rem;
  }
  @media (max-width: 360px) {
    .sm {
      padding: 2px 5px;
      font-size: 0.75rem;
    }
  }
  .empty,
  .neutral {
    color: var(--muted);
    background: var(--control);
  }
  .neutral {
    color: var(--ink);
  }
</style>
