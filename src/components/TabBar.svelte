<script lang="ts" generics="T extends string">
  import { rovingTarget } from '../lib/roving';
  import { onDestroy, untrack } from 'svelte';
  import { lockVerticalSwipes, selectionHaptic } from '../lib/telegram';
  import TabIcon, { type TabIconName } from './TabIcon.svelte';

  let {
    options,
    value = $bindable(),
    label,
    id,
    controls,
    hidden = false,
  }: {
    /** `dot` shows an unseen marker; its text is read out to screen readers ("new updates"). */
    options: { value: T; label: string; icon: TabIconName; dot?: string }[];
    value: T;
    label: string;
    /** Each tab gets the id `${id}-${value}`; `controls(v)` names its panel (undefined while the
        panel isn't mounted). */
    id: string;
    controls?: (v: T) => string | undefined;
    hidden?: boolean;
  } = $props();

  const index = $derived(Math.max(0, options.findIndex((o) => o.value === value)));
  let bar: HTMLElement;
  let buttons: HTMLButtonElement[] = [];

  // The thumb is a lens: it swells while pressed, and a sideways drag carries it under the
  // finger, switching on lift. `dragX` is its left edge in px while dragging.
  let pressed = $state(false);
  let dragX = $state<number | null>(null);
  let hoverIndex = $state<number | null>(null); // the tab under the finger while dragging
  // Switched from the keyboard: the thumb jumps, it doesn't slide.
  let instant = $state(false);

  let pointer: number | null = null;
  let startX = 0;
  let dragged = false;
  let unlockSwipes: (() => void) | null = null;

  // The tab whose icon plays its move: the one just picked, by a tap, a drag or from elsewhere
  // (Telegram's back arrow, a link to Outlook). Not on load, and not from the keyboard, where
  // switches are instant.
  let played = $state<T | null>(null);
  let primed = false; // the effect's first run is the load
  $effect(() => {
    const v = value;
    if (primed) played = untrack(() => instant) ? null : v;
    primed = true;
  });

  function pick(v: T, fromKeys = false) {
    // Only this switch jumps; the next one from elsewhere (Telegram's back arrow) slides again.
    instant = fromKeys;
    if (fromKeys) requestAnimationFrame(() => requestAnimationFrame(() => (instant = false)));
    if (v === value) return;
    value = v;
    selectionHaptic();
  }

  // One tab stop for the group; arrow keys, Home and End move between tabs.
  function onKey(e: KeyboardEvent) {
    const to = rovingTarget(e.key, index, options.length);
    if (to < 0) return;
    e.preventDefault();
    pick(options[to].value, true);
    buttons[to]?.focus();
  }

  // The tabs' geometry, measured once when a drag starts: the first tab's left edge on screen
  // (where the thumb's x is 0) and a tab's width.
  let origin = 0;
  let tabW = 0;

  const RUBBER = 5; // past either end the thumb follows at a fifth of the finger's travel

  // Where the thumb goes under the finger: its left edge, and the tab it's mostly over.
  function dragSlot(clientX: number) {
    const max = (options.length - 1) * tabW;
    const raw = clientX - origin - tabW / 2;
    const x = raw < 0 ? raw / RUBBER : raw > max ? max + (raw - max) / RUBBER : raw;
    return { x, i: Math.min(options.length - 1, Math.max(0, Math.round(raw / tabW))) };
  }

  function onDown(e: PointerEvent) {
    if (pointer != null || !e.isPrimary || e.button !== 0) return; // one finger at a time
    pointer = e.pointerId;
    startX = e.clientX;
    dragged = false;
    pressed = true;
    // Telegram's swipe-down-to-minimise would otherwise take a drag that drifts downwards.
    if (e.pointerType === 'touch') unlockSwipes = lockVerticalSwipes();
    // A mouse switches on press; a finger on lift, since a sideways drag may still pick another tab.
    if (e.pointerType !== 'touch') {
      const i = buttons.findIndex((b) => b.contains(e.target as Node));
      if (i >= 0) pick(options[i].value);
    }
  }

  function onMove(e: PointerEvent) {
    if (e.pointerId !== pointer) return;
    if (!dragged) {
      if (Math.abs(e.clientX - startX) < 6) return;
      dragged = true;
      bar.setPointerCapture(e.pointerId);
      const first = buttons[0].getBoundingClientRect();
      origin = first.left;
      tabW = first.width;
    }
    const s = dragSlot(e.clientX);
    dragX = s.x;
    hoverIndex = s.i;
  }

  // Heard on the window: a mouse pressed here can be let go anywhere.
  function onUp(e: PointerEvent) {
    if (e.pointerId !== pointer) return;
    if (dragged && hoverIndex != null) pick(options[hoverIndex].value);
    release();
  }

  function release() {
    unlockSwipes?.();
    unlockSwipes = null;
    pointer = null;
    dragged = false;
    pressed = false;
    dragX = null;
    hoverIndex = null;
  }
  onDestroy(release);

</script>

<!-- A cancel means the system took the touch (a call, Control Center): nothing is picked. -->
<svelte:window onpointerup={onUp} onpointercancel={(e) => e.pointerId === pointer && release()} />

<!-- Keeps the page's last card clear of the floating bar. -->
<div class="room" aria-hidden="true"></div>
<div class="dock" class:away={hidden} inert={hidden}>
  <!-- svelte-ignore a11y_interactive_supports_focus (focus lives on the tabs: one roving tab stop) -->
  <div
    class="bar"
    role="tablist"
    aria-label={label}
    style:--n={options.length}
    bind:this={bar}
    onpointerdown={onDown}
    onpointermove={onMove}
  >
    <span
      class="thumb"
      class:dragging={dragX != null}
      class:instant
      style:transform={dragX == null ? `translateX(${index * 100}%)` : `translateX(${dragX}px)`}
      aria-hidden="true"
    >
      <span class="lens" class:pressed></span>
    </span>
    {#each options as o, i (o.value)}
      {@const on = o.value === value}
      {@const lit = hoverIndex == null ? on : hoverIndex === i}
      <button
        bind:this={buttons[i]}
        type="button"
        role="tab"
        id="{id}-{o.value}"
        aria-selected={on}
        aria-controls={controls?.(o.value)}
        tabindex={on ? 0 : -1}
        class:lit
        onclick={() => pick(o.value)}
        onkeydown={onKey}
      >
        <span class="icon">
          <TabIcon name={o.icon} play={played === o.value} />
          {#if o.dot}<span class="dot" aria-hidden="true"></span>{/if}
        </span>
        <span class="label">{o.label}</span>
        {#if o.dot}<span class="visually-hidden">{` (${o.dot})`}</span>{/if}
      </button>
    {/each}
  </div>
</div>

<style>
  /* About the bar's height (56px tabs, 8px padding, a label that grows with the text size),
     so with the page's bottom padding the last card clears it. */
  .room {
    height: calc(56px + 1.125rem);
  }
  .dock {
    position: fixed;
    z-index: 3;
    left: 0;
    right: 0;
    bottom: calc(10px + var(--inset-bottom));
    width: min(340px, calc(100% - var(--pad-left) - var(--pad-right)));
    margin-inline: auto;
    transition:
      transform 200ms var(--ease-out),
      opacity 200ms var(--ease-out);
  }
  .dock.away {
    transform: translateY(calc(100% + 10px + var(--inset-bottom)));
    opacity: 0;
  }

  /* Glass: frosted page colour, a hairline edge lit from above, a soft shadow to lift it. */
  .bar {
    --glass: color-mix(in srgb, var(--page) 74%, transparent);
    --glass-solid: var(--page); /* without blur, or with reduced transparency */
    --rim: rgba(255, 255, 255, 0.7);
    --rim-shadow: rgba(0, 0, 0, 0.08);
    --ring: var(--page); /* round the More dot, in the glass's colour */
    position: relative;
    display: grid;
    grid-template-columns: repeat(var(--n), 1fr);
    padding: 4px;
    border-radius: 999px;
    background: var(--glass);
    -webkit-backdrop-filter: blur(16px) saturate(180%);
    backdrop-filter: blur(16px) saturate(180%);
    box-shadow:
      inset 0 0.5px 0 var(--rim),
      inset 0 0 0 0.5px var(--rim-shadow),
      0 8px 24px rgba(0, 0, 0, 0.12),
      0 1px 3px rgba(0, 0, 0, 0.08);
    isolation: isolate;
    /* Every touch on the bar is ours, like a native tab bar: if the page could scroll from here,
       iOS would take over a sideways drag that drifts a little and cancel it. */
    touch-action: none;
    -webkit-user-select: none;
    user-select: none;
    -webkit-touch-callout: none;
  }
  :global([data-theme='dark']) .bar {
    --glass: color-mix(in srgb, var(--card) 72%, transparent);
    --glass-solid: var(--card);
    --rim: rgba(255, 255, 255, 0.14);
    --rim-shadow: rgba(255, 255, 255, 0.06);
    --ring: var(--card);
  }
  @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
    .bar {
      background: var(--glass-solid);
    }
  }
  @media (prefers-reduced-transparency: reduce) {
    .bar {
      background: var(--glass-solid);
    }
  }

  .thumb {
    position: absolute;
    inset: 4px auto 4px 4px;
    width: calc((100% - 8px) / var(--n));
    z-index: -1;
    /* on-screen movement between tabs */
    transition: transform 200ms var(--ease-in-out);
    will-change: transform;
  }
  .thumb.dragging,
  .thumb.instant {
    transition: none;
  }
  /* The thumb and the pressed lens are two layers that cross-fade, so only transform and
     opacity animate. */
  .lens {
    position: absolute;
    inset: 0;
    transition: transform 200ms var(--ease-out);
  }
  .lens::before,
  .lens::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 999px;
    transition: opacity 200ms var(--ease-out);
  }
  .lens::before {
    background: var(--control-thumb);
    box-shadow: var(--shadow-thumb);
  }
  .lens::after {
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.8),
      inset 0 -1px 2px rgba(255, 255, 255, 0.3),
      0 6px 16px rgba(0, 0, 0, 0.16);
    opacity: 0;
  }
  /* Pressed, the thumb swells into a lens with a lit rim, like iOS's tab bar. */
  .lens.pressed {
    transform: scale(1.12);
    transition-duration: 160ms;
  }
  .lens.pressed::before {
    opacity: 0.7;
  }
  .lens.pressed::after {
    opacity: 1;
  }
  .lens.pressed::before,
  .lens.pressed::after {
    transition-duration: 160ms;
  }

  button {
    display: grid;
    justify-items: center;
    gap: 1px;
    min-height: 56px;
    padding: 4px 4px 3px;
    border: 0;
    border-radius: 999px;
    background: none;
    color: var(--ink-2);
    font: inherit;
    cursor: pointer;
    transition: color 150ms ease;
  }
  /* The picked tab is in the theme's accent, Telegram's own blue by default, like its tab bar. */
  button.lit {
    color: var(--accent);
    --icon-stroke: 1.9;
  }
  button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
  .icon,
  .label {
    transition: transform 120ms var(--ease-out);
  }
  button:active .icon,
  button:active .label {
    transform: scale(0.97);
  }
  .icon {
    position: relative;
    display: block;
    height: 28px; /* TabIcon's size; without it the line box adds a few px */
    /* Its own layer: the icon's moves repaint the icon, not the whole frosted bar. */
    will-change: transform;
  }
  .label {
    font-size: 0.6875rem;
    font-weight: 600;
    line-height: 1.2;
    white-space: nowrap;
  }
  .dot {
    position: absolute;
    top: -1px;
    right: -4px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--accent);
    box-shadow: 0 0 0 2px var(--ring);
  }
  @media (hover: hover) and (pointer: fine) {
    button:not(.lit):hover {
      color: var(--ink);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .thumb,
    .lens,
    .lens::before,
    .lens::after,
    .icon,
    .label {
      transition: none;
    }
    .lens.pressed,
    button:active .icon,
    button:active .label {
      transform: none;
    }
    .dock {
      transition: opacity 150ms ease;
    }
    .dock.away {
      transform: none;
    }
  }
</style>
