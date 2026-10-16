<script lang="ts" generics="T extends string | number">
  import { selectionHaptic } from '../lib/telegram';

  let {
    options,
    value = $bindable(),
    label,
  }: { options: { value: T; label: string }[]; value: T; label: string } = $props();

  const index = $derived(Math.max(0, options.findIndex((o) => o.value === value)));

  function pick(v: T) {
    if (v === value) return;
    value = v;
    selectionHaptic();
  }
</script>

<div class="seg" role="radiogroup" aria-label={label} style:--n={options.length}>
  <span class="thumb" style:transform="translateX({index * 100}%)" aria-hidden="true"></span>
  {#each options as o (o.value)}
    <button
      type="button"
      role="radio"
      aria-checked={o.value === value}
      class:on={o.value === value}
      onpointerdown={() => pick(o.value)}
      onclick={() => pick(o.value)}
    >
      {o.label}
    </button>
  {/each}
</div>

<style>
  .seg {
    position: relative;
    display: grid;
    grid-template-columns: repeat(var(--n), 1fr);
    padding: 2px;
    border-radius: 10px;
    background: var(--control);
    isolation: isolate;
  }
  .thumb {
    position: absolute;
    inset: 2px auto 2px 2px;
    width: calc((100% - 4px) / var(--n));
    border-radius: 8px;
    background: var(--control-thumb);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
    /* on-screen movement between options */
    transition: transform 200ms var(--ease-in-out);
    z-index: -1;
  }
  button {
    min-height: 32px;
    padding: 4px 10px;
    border: 0;
    background: none;
    color: var(--ink-2);
    font: inherit;
    font-size: 0.8125rem;
    font-weight: 550;
    cursor: pointer;
    transition:
      color 150ms ease,
      transform 120ms var(--ease-out);
  }
  button.on {
    color: var(--ink);
  }
  button:active {
    transform: scale(0.97);
  }
  @media (prefers-reduced-motion: reduce) {
    .thumb {
      transition: none;
    }
  }
</style>
