<script lang="ts" generics="T extends string">
  import { rovingTarget } from '../lib/roving';
  import { onMount } from 'svelte';
  import { lockVerticalSwipes, selectionHaptic } from '../lib/telegram';

  let {
    options,
    value = $bindable(),
    label,
    id,
    controls,
    hidden = false,
  }: {
    /** `icon` is the `d` of a 24×24 stroked path. `dot` shows an unseen marker; its text is read
        out to screen readers ("new updates"). */
    options: { value: T; label: string; icon: string; dot?: string }[];
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
  let startY = 0;
  let dragged = false;
  let unlockSwipes: (() => void) | null = null;

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

  // Where the thumb goes under the finger: its left edge, and the tab it's mostly over. Past
  // either end it follows at a fifth of the finger's travel, like a rubber band.
  function dragSlot(clientX: number) {
    const max = (options.length - 1) * tabW;
    const raw = clientX - origin - tabW / 2;
    const x = raw < 0 ? raw / 5 : raw > max ? max + (raw - max) / 5 : raw;
    return { x, i: Math.min(options.length - 1, Math.max(0, Math.round(raw / tabW))) };
  }

  function onDown(e: PointerEvent) {
    if (pointer != null || !e.isPrimary || e.button !== 0) return; // one finger at a time
    pointer = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    dragged = false;
    pressed = true;
    // Telegram's swipe-down-to-minimise would otherwise take a drag that drifts downwards.
    if (e.pointerType === 'touch') unlockSwipes = lockVerticalSwipes();
    // A mouse switches on press; a finger on lift, so a scroll that starts here doesn't switch.
    if (e.pointerType !== 'touch') {
      const i = buttons.findIndex((b) => b.contains(e.target as Node));
      if (i >= 0) pick(options[i].value);
    }
  }

  function onMove(e: PointerEvent) {
    if (e.pointerId !== pointer) return;
    if (!dragged) {
      const dx = Math.abs(e.clientX - startX);
      if (dx < 6 || dx < Math.abs(e.clientY - startY)) return;
      dragged = true;
      try {
        bar.setPointerCapture(e.pointerId);
      } catch {
        // the pointer already ended; the window still hears its pointerup
      }
      const first = buttons[0].getBoundingClientRect();
      origin = first.left;
      tabW = first.width;
    }
    const s = dragSlot(e.clientX);
    dragX = s.x;
    hoverIndex = s.i;
  }

  // `touch-action: pan-y` keeps the page scrolling over the bar, but a sideways drag that drifts
  // a little vertically would then be taken over (pointercancel). Once a touch is mostly
  // sideways, keep it: a non-passive touchmove that prevents the scroll.
  onMount(() => {
    const hold = (e: TouchEvent) => {
      const t = e.touches[0];
      if (pointer == null || !t) return;
      if (dragged || Math.abs(t.clientX - startX) > Math.abs(t.clientY - startY)) e.preventDefault();
    };
    bar.addEventListener('touchmove', hold, { passive: false });
    return () => bar.removeEventListener('touchmove', hold);
  });

  // Heard on the window: a mouse pressed here can be let go anywhere. A cancel (the browser took
  // the touch after all) still lands on the tab under the finger rather than snapping back.
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

</script>

<svelte:window onpointerup={onUp} onpointercancel={onUp} />

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
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d={o.icon} /></svg>
          {#if o.dot}<span class="dot" aria-hidden="true"></span>{/if}
        </span>
        <span class="label">{o.label}</span>
        {#if o.dot}<span class="visually-hidden">{` (${o.dot})`}</span>{/if}
      </button>
    {/each}
  </div>
</div>

<style>
  /* About the bar's height (52px tabs, 8px padding, a label that grows with the text size),
     so with the page's bottom padding the last card clears it. */
  .room {
    height: calc(52px + 1.125rem);
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
    touch-action: pan-y; /* the page keeps vertical scrolling; a sideways drag is ours */
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
  .lens {
    position: absolute;
    inset: 0;
    border-radius: 999px;
    background: var(--control-thumb);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
    transition:
      transform 200ms var(--ease-out),
      box-shadow 200ms var(--ease-out),
      background-color 200ms var(--ease-out);
  }
  /* Pressed, the thumb swells into a lens with a lit rim, like iOS's tab bar. */
  .lens.pressed {
    transform: scale(1.12);
    background: color-mix(in srgb, var(--control-thumb) 70%, transparent);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.8),
      inset 0 -1px 2px rgba(255, 255, 255, 0.3),
      0 6px 16px rgba(0, 0, 0, 0.16);
    transition-duration: 160ms;
  }

  button {
    display: grid;
    justify-items: center;
    gap: 1px;
    min-height: 52px;
    padding: 5px 4px 4px;
    border: 0;
    border-radius: 999px;
    background: none;
    color: var(--ink-2);
    font: inherit;
    cursor: pointer;
    transition: color 150ms ease;
  }
  button.lit {
    color: var(--ink);
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
    height: 22px;
  }
  svg {
    display: block;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  button.lit svg {
    stroke-width: 2.2;
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
