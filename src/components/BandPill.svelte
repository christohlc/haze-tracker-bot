<script lang="ts">
  import { PSI_BANDS, psiBand } from '../../tgcloud/lib/psi.js';

  // A band id (NEA's outlook gives bands, not numbers) always shows its label.
  let {
    value = null,
    bandId = null,
    showLabel = false,
    size = 'sm',
  }: { value?: number | null; bandId?: string | null; showLabel?: boolean; size?: 'sm' | 'lg' } = $props();
  const band = $derived(bandId ? (PSI_BANDS.find((b) => b.id === bandId) ?? null) : psiBand(value));
  const label = $derived(showLabel || bandId != null);
</script>

{#if band}
  <span
    class="pill {size}"
    style:background="var(--band-{band.id})"
    style:color="var(--band-{band.id}-ink)"
    title={band.label}
  >
    {label ? band.label : value}
    {#if !label}<span class="visually-hidden">, {band.label}</span>{/if}
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
  .empty {
    color: var(--muted);
    background: var(--control);
  }
</style>
