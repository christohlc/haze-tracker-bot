<script lang="ts" generics="T extends string | number">
  import { selectionHaptic } from '../lib/telegram';

  let {
    options,
    value = $bindable(),
    label,
    kind = 'radio',
    id,
    controls,
  }: {
    /** `dot` shows an unseen marker; its text is read out to screen readers ("new updates"). */
    options: { value: T; label: string; dot?: string }[];
    value: T;
    label: string;
    /** 'tab' switches panels: tablist semantics, each tab gets the id `${id}-${value}`, and
        `controls(v)` names its panel (undefined while the panel isn't mounted). */
    kind?: 'radio' | 'tab';
    id?: string;
    controls?: (v: T) => string | undefined;
  } = $props();

  const index = $derived(Math.max(0, options.findIndex((o) => o.value === value)));
  let buttons: HTMLButtonElement[] = [];

  function pick(v: T) {
    if (v === value) return;
    value = v;
    selectionHaptic();
  }

  // A mouse switches on press. A finger switches on lift (click), so a scroll that starts on
  // the control doesn't change it; :active gives the press feedback straight away.

  // One tab stop for the group; arrow keys, Home and End move between options.
  function onKey(e: KeyboardEvent) {
    const last = options.length - 1;
    const to =
      e.key === 'ArrowRight' ? (index === last ? 0 : index + 1)
      : e.key === 'ArrowLeft' ? (index === 0 ? last : index - 1)
      : e.key === 'Home' ? 0
      : e.key === 'End' ? last
      : -1;
    if (to < 0) return;
    e.preventDefault();
    pick(options[to].value);
    buttons[to]?.focus();
  }
</script>

<div class="seg" role={kind === 'tab' ? 'tablist' : 'radiogroup'} aria-label={label} style:--n={options.length} onkeydown={onKey}>
  <span class="thumb" style:transform="translateX({index * 100}%)" aria-hidden="true"></span>
  {#each options as o, i (o.value)}
    {@const on = o.value === value}
    <button
      bind:this={buttons[i]}
      type="button"
      role={kind}
      id={kind === 'tab' && id ? `${id}-${o.value}` : undefined}
      aria-checked={kind === 'radio' ? on : undefined}
      aria-selected={kind === 'tab' ? on : undefined}
      aria-controls={controls?.(o.value)}
      tabindex={on ? 0 : -1}
      class:on
      onpointerdown={(e) => e.pointerType !== 'touch' && pick(o.value)}
      onclick={() => pick(o.value)}
    >
      {o.label}{#if o.dot}<span class="dot" aria-hidden="true"></span><span class="visually-hidden">{` (${o.dot})`}</span>{/if}
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
  .dot {
    display: inline-block;
    width: 7px;
    height: 7px;
    margin-left: 5px;
    vertical-align: 0.15em;
    border-radius: 50%;
    background: var(--accent);
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
