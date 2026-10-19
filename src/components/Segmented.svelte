<script lang="ts" generics="T extends string | number">
  import { rovingTarget } from '../lib/roving';
  import { selectionHaptic } from '../lib/telegram';

  let {
    options,
    value = $bindable(),
    label,
  }: {
    options: { value: T; label: string }[];
    value: T;
    label: string;
  } = $props();

  const index = $derived(Math.max(0, options.findIndex((o) => o.value === value)));
  let buttons: HTMLButtonElement[] = [];

  function pick(v: T) {
    if (v === value) return;
    value = v;
    selectionHaptic();
  }

  // One tab stop for the group; arrow keys, Home and End move between options.
  function onKey(e: KeyboardEvent) {
    const to = rovingTarget(e.key, index, options.length);
    if (to < 0) return;
    e.preventDefault();
    pick(options[to].value);
    buttons[to]?.focus();
  }
</script>

<div class="seg" role="radiogroup" aria-label={label} style:--n={options.length}>
  <span class="thumb" style:transform="translateX({index * 100}%)" aria-hidden="true"></span>
  {#each options as o, i (o.value)}
    {@const on = o.value === value}
    <!-- A mouse switches on press; a finger on lift, so a scroll that starts here doesn’t switch. -->
    <button
      bind:this={buttons[i]}
      type="button"
      role="radio"
      aria-checked={on}
      tabindex={on ? 0 : -1}
      class:on
      onpointerdown={(e) => e.pointerType !== 'touch' && pick(o.value)}
      onclick={() => pick(o.value)}
      onkeydown={onKey}
    >
      {o.label}
    </button>
  {/each}
</div>

<style>
  .seg {
    position: relative;
    display: grid;
    grid-template-columns: repeat(var(--n), minmax(0, 1fr));
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
    box-shadow: var(--shadow-thumb);
    /* on-screen movement between options */
    transition: transform 200ms var(--ease-in-out);
    z-index: -1;
  }
  button {
    min-height: 44px;
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
