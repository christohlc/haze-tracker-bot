<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { psiBand } from '../../tgcloud/lib/psi.js';
  import { readingsFor } from '../../tgcloud/lib/snapshot.js';
  import type { Snapshot } from '../lib/api';
  import { area } from '../lib/area.svelte';
  import { ambient, appVisible, onAppVisible, onReducedMotion, reducedMotion } from '../lib/motion';
  import { psiKey, type Period } from '../lib/period';
  import { getStored, lockVerticalSwipes, selectionHaptic, setStored } from '../lib/telegram';
  import {
    PET_H,
    PET_LINES,
    PET_W,
    actionMs,
    clamp,
    dragTo,
    fromSaved,
    parseSaved,
    petMood,
    pickAction,
    release,
    startAction,
    step,
    toSaved,
    type PetAction,
    type PetState,
    type Platform,
    type World,
  } from '../lib/pet-physics';

  // A little air purifier that wanders the dashboard: it stands on the cards, can be picked up
  // and thrown, and works harder as the haze gets worse. Physics in lib/pet-physics.ts.
  let {
    snapshot,
    period,
    hidden,
    onhide,
  }: { snapshot: Snapshot; period: Period; hidden: boolean; onhide: () => void } = $props();

  const POS_KEY = 'pet_pos';
  const TAP_SLOP = 10; // px; hedgehog-mode's click threshold

  // The same band as the hero, so the pet and the big number agree.
  const band = $derived(psiBand(readingsFor(snapshot, area.id)[psiKey(period)]?.value ?? null));
  const mood = $derived(petMood(band?.id));

  let el = $state<HTMLElement>();
  let bounds = $state<HTMLElement>();
  let squashEl = $state<HTMLElement>();
  let bodyEl = $state<HTMLElement>();
  let action = $state<PetAction>('fall');
  let facing = $state<1 | -1>(1);
  let ready = $state(false);
  let bubble = $state<string | null>(null);
  let bubbleLeft = $state(true); // opens toward the middle of the screen
  let bubbleBelow = $state(false); // near the top, it opens underneath
  let reduce = $state(reducedMotion());
  let dragging = $state(false);

  let s: PetState | null = null;
  let world: World = { left: 0, right: 0, top: 0, floor: 0, platforms: [] };

  // Cards get a stable id while they're on the page, so the pet knows which one it stands on.
  // Reads App.svelte's layout: a tab panel is `.sections` (`.off` when hidden), the tab bar `.dock`.
  const ids = new WeakMap<Element, number>();
  let nextId = 1;
  function measure() {
    if (!bounds) return;
    const b = bounds.getBoundingClientRect();
    const dock = document.querySelector('.dock:not(.away)')?.getBoundingClientRect();
    const platforms: Platform[] = [];
    for (const card of document.querySelectorAll('main .sections:not(.off) > *')) {
      const r = card.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      if (!ids.has(card)) ids.set(card, nextId++);
      platforms.push({ id: ids.get(card)!, left: r.left, right: r.right, top: r.top });
    }
    world = { left: b.left, right: b.right, top: b.top, floor: Math.min(b.bottom, dock ? dock.top - 6 : b.bottom), platforms };
  }

  // The wander AI: a new weighted pick when the last action runs out (hops end when they land).
  let nextPick = 0;
  function think(now: number) {
    if (!s || s.on == null || s.action === 'drag' || reduce || now < nextPick) return;
    const a = pickAction(mood.mood, Math.random());
    startAction(s, a, Math.random());
    nextPick = now + (actionMs(a, Math.random()) || 600);
  }
  function wave() {
    if (!s || s.on == null) return;
    s.action = 'wave';
    nextPick = performance.now() + actionMs('wave', 0);
  }

  let drawnX = NaN;
  let drawnY = NaN;
  let drawnTilt = 0;
  function draw() {
    if (!s || !el) return;
    if (s.x !== drawnX || s.y !== drawnY) {
      el.style.transform = `translate3d(${s.x}px, ${s.y - PET_H}px, 0)`;
      drawnX = s.x;
      drawnY = s.y;
    }
    // Leans into the drag and the throw. On the button itself, not a variable on the wrapper,
    // so a frame doesn't restyle the whole SVG.
    const tilt = !reduce && (s.action === 'drag' || s.on == null) ? clamp(s.vx * 0.012, -18, 18) : 0;
    if (bodyEl && tilt !== drawnTilt) {
      bodyEl.style.transform = tilt ? `rotate(${tilt}deg)` : '';
      drawnTilt = tilt;
    }
    if (action !== s.action) action = s.action;
    if (facing !== s.facing) facing = s.facing;
  }

  // Saved once it comes to rest after being moved, not on every wander: CloudStorage is a network call.
  let moved = false;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  function saveSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => s && setStored(POS_KEY, JSON.stringify(toSaved(s, world))), 800);
  }

  let measured = 0;
  let dirty = true;
  let last = 0;
  let frame = 0;
  let slow: ReturnType<typeof setTimeout> | undefined;
  function tick(now: number) {
    frame = 0;
    if (!s) return void (frame = requestAnimationFrame(tick));
    // Standing still under reduced motion, nothing moves on its own: check the page twice a second
    // (cards growing; a scroll wakes it at once) instead of every frame.
    if (reduce && s.on != null && !dragging) slow = setTimeout(start, 500);
    else frame = requestAnimationFrame(tick);
    if (dirty || now - measured > 250) {
      measure();
      measured = now;
      dirty = false;
    }
    const dt = last ? now - last : 16;
    last = now;
    think(now);
    if (pointer && dragging) dragTo(s, pointer.x - grab.x, pointer.y - grab.y, dt, world);
    else {
      const wasAir = s.on == null;
      const impact = step(s, dt, world, mood.speed, reduce);
      if (impact > 500) play(squashEl, [{}, { transform: 'scale(1.12, 0.84)', offset: 0.3 }, {}], 260);
      if (wasAir && s.on != null && moved) {
        moved = false;
        saveSoon();
      }
    }
    draw();
  }

  // Runs only while someone can see it: not tucked away, the page shown, Telegram not in the background.
  function start() {
    if (frame || hidden || !appVisible()) return;
    clearTimeout(slow);
    last = 0;
    dirty = true;
    frame = requestAnimationFrame(tick);
  }
  function stop() {
    cancelAnimationFrame(frame);
    clearTimeout(slow);
    frame = 0;
  }

  // Dragging: Pointer Events on the pet only, so everything under it stays tappable.
  let pointer: { id: number; x: number; y: number; startX: number; startY: number } | null = null;
  let grab = { x: 0, y: 0 };
  let unlockSwipes: (() => void) | null = null;
  let droppedAt = 0; // the click that may follow a drag isn't a pat

  let ease = 'ease-out';
  /** A one-off move (Web Animations, so it needs no remount to replay). */
  function play(node: HTMLElement | undefined, keyframes: Keyframe[], duration: number) {
    if (!reduce) node?.animate?.(keyframes, { duration, easing: ease });
  }

  function onpointerdown(e: PointerEvent) {
    if (!s || pointer || e.button > 0) return;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // a pointer that's already gone; the moves still arrive while it's over the pet
    }
    pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY };
    grab = { x: e.clientX - s.x, y: e.clientY - s.y };
    start();
  }
  function onpointermove(e: PointerEvent) {
    if (!pointer || e.pointerId !== pointer.id || !s) return;
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    if (!dragging && Math.hypot(e.clientX - pointer.startX, e.clientY - pointer.startY) > TAP_SLOP) {
      dragging = true;
      bubble = null;
      unlockSwipes = lockVerticalSwipes(); // a downward drag mustn't minimise the app
      selectionHaptic();
      s.vx = s.vy = 0;
    }
  }
  function endDrag() {
    pointer = null;
    if (!dragging) return false;
    dragging = false;
    unlockSwipes?.();
    unlockSwipes = null;
    return true;
  }
  function letGo(e: PointerEvent) {
    if (!pointer || e.pointerId !== pointer.id || !s || !endDrag()) return;
    droppedAt = performance.now();
    moved = true;
    release(s); // the next step throws it, or under reduced motion puts it straight down
    nextPick = droppedAt + 1500;
  }

  // A tap (or Enter/Space) is a pat: a wiggle and a line about how it's getting on.
  let line = 0;
  let bubbleTimer: ReturnType<typeof setTimeout> | undefined;
  function pat() {
    if (!s || performance.now() - droppedAt < 400) return;
    selectionHaptic();
    play(squashEl, [{}, { transform: 'rotate(-8deg)', offset: 0.25 }, { transform: 'rotate(6deg)', offset: 0.6 }, {}], 420);
    const lines = PET_LINES[mood.mood];
    bubbleLeft = s.x + PET_W / 2 < (world.left + world.right) / 2;
    bubbleBelow = s.y - PET_H - world.top < 90;
    bubble = lines[line++ % lines.length];
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => (bubble = null), 4000);
    wave();
  }
  // A mouse pointing at it gets a wave (touch has no hover; it gets the pat's wave instead).
  function onpointerenter(e: PointerEvent) {
    if (e.pointerType === 'mouse' && s?.action !== 'wave' && !dragging && !reduce) wave();
  }

  function tuckAway() {
    bubble = null;
    selectionHaptic();
    onhide();
  }

  function onscroll() {
    dirty = true;
    start(); // wakes the slow loop
  }

  onMount(() => {
    ease = getComputedStyle(document.documentElement).getPropertyValue('--ease-out').trim() || ease;
    const offVisible = onAppVisible((v) => (v ? start() : stop()));
    const offMotion = onReducedMotion((r) => {
      reduce = r;
      start(); // the next step puts it straight down if it was mid-air
    });
    getStored(POS_KEY).then((raw) => {
      measure();
      const saved = parseSaved(raw);
      // First time: on the floor, bottom right, out of the way. Saved: drops from where it was left.
      s = saved
        ? fromSaved(saved, world)
        : { x: world.right - PET_W - 8, y: world.floor, vx: 0, vy: 0, facing: -1, action: 'wait', on: 'floor' };
      nextPick = performance.now() + 1200;
      draw();
      ready = true;
    });
    return () => {
      stop();
      unlockSwipes?.();
      clearTimeout(saveTimer);
      clearTimeout(bubbleTimer);
      offVisible();
      offMotion();
    };
  });

  // Nothing runs while it's tucked away (or the game is open).
  $effect(() => {
    if (hidden) {
      stop();
      bubble = null;
      endDrag();
    } else start();
  });
  // Coming back: drawn again where it was.
  $effect(() => {
    if (!el) return;
    drawnX = drawnY = NaN;
    drawnTilt = 0;
    untrack(draw);
  });
</script>

<svelte:window {onscroll} onresize={onscroll} />

<!-- The box it may roam: inside Telegram's buttons, the notch and the side insets. -->
<div class="bounds" bind:this={bounds} aria-hidden="true"></div>

{#if !hidden}
  <div
    class="pet mood-{mood.mood} fan-{mood.fan} act-{action}"
    class:dragging
    class:ready
    bind:this={el}
    use:ambient
  >
    <!-- The pet's position is a transform set every frame, so the pop in and out is on an inner box. -->
    <div class="pop" transition:scale={{ duration: reduce ? 0 : 200, start: 0.8, easing: cubicOut }}>
    <!-- Always in the page, so screen readers announce what it says when a line appears. -->
    <div class="say" aria-live="polite">
    {#if bubble}
      <div class="bubble" class:left={bubbleLeft} class:below={bubbleBelow} in:scale={{ duration: reduce ? 0 : 180, start: 0.9, easing: cubicOut }} out:fade={{ duration: reduce ? 0 : 120 }}>
        <p>{bubble}</p>
        <button type="button" class="tuck" onclick={tuckAway}>Tuck away</button>
      </div>
    {/if}
    </div>
    <button
      type="button"
      class="body"
      bind:this={bodyEl}
      aria-label="Air purifier pet. Tap to pat, drag to move."
      onclick={pat}
      {onpointerdown}
      {onpointermove}
      onpointerup={letGo}
      onpointercancel={letGo}
      onlostpointercapture={letGo}
      {onpointerenter}
    >
      <span class="squash" bind:this={squashEl}>
        <span class="wiggle">
          <svg viewBox="0 0 48 56" width={PET_W} height={PET_H} aria-hidden="true">
            <!-- a drawn shadow, not a filter: a filter would be redrawn with every turn of the fan -->
            <ellipse class="shadow" cx="24" cy="54.5" rx="15" ry="2" />
            <!-- faces the way it walks; the z stays the right way round -->
            <g transform={facing < 0 ? 'translate(48 0) scale(-1 1)' : undefined}>
                <!-- feet -->
                <rect class="foot foot-l" x="12" y="47" width="8" height="7" rx="3.5" />
                <rect class="foot foot-r" x="28" y="47" width="8" height="7" rx="3.5" />
                <!-- waving arm (behind the body) -->
                <path class="arm" d="M40 31 L46 22" />
                <!-- body -->
                <rect class="shell" x="6" y="6" width="36" height="43" rx="11" />
                <!-- the fan, seen through the top vent -->
                <circle class="vent" cx="22" cy="17" r="8.5" />
                <g class="fan">
                  <path d="M22 17 C22 12 25 10 27 11.5 C26 14 24 16 22 17Z" />
                  <path d="M22 17 C26.3 19.5 26.6 23 24.3 24 C22.6 21.9 22 19.4 22 17Z" />
                  <path d="M22 17 C17.7 19.5 14.7 18 15 15.4 C17.6 15 19.9 15.7 22 17Z" />
                </g>
                <circle class="hub" cx="22" cy="17" r="1.6" />
                <!-- status light, in the band's colour -->
                <circle class="light" cx="36" cy="12.5" r="2.4" style:fill={band ? `var(--band-${band.id})` : 'var(--muted)'} />
                <!-- face -->
                <g class="face">
                  {#if action === 'drag' || action === 'fall'}
                    <circle class="eye" cx="18" cy="32" r="2.4" />
                    <circle class="eye" cx="30" cy="32" r="2.4" />
                    <ellipse class="eye" cx="24" cy="38.5" rx="2" ry="2.4" />
                  {:else if mood.mood === 'dozing' && action === 'wait'}
                    <path class="line" d="M15.5 32 q2.5 2 5 0 M27.5 32 q2.5 2 5 0" />
                    <path class="line" d="M22 38 q2 1.4 4 0" />
                  {:else if mood.mood === 'struggling'}
                    <path class="line" d="M16 30.5 l3.5 2 l-3.5 2 M32 30.5 l-3.5 2 l3.5 2" />
                    <path class="line" d="M20 39 q2 -1.6 4 0 q2 1.6 4 0" />
                  {:else}
                    <circle class="eye" cx="18" cy="32" r="2" />
                    <circle class="eye" cx="30" cy="32" r="2" />
                    {#if mood.mood === 'busy' || mood.mood === 'heroic'}
                      <path class="line" d="M15.5 27.5 l5 1.2 M32.5 27.5 l-5 1.2" />
                    {/if}
                    {#if mood.mood === 'heroic'}
                      <path class="mouth" d="M19.5 37 h9 q0 4.5 -4.5 4.5 q-4.5 0 -4.5 -4.5Z" />
                    {:else if mood.mood === 'busy'}
                      <path class="line" d="M21 38.5 h6" />
                    {:else}
                      <path class="line" d="M20.5 37.5 q3.5 3 7 0" />
                    {/if}
                  {/if}
                  <circle class="blush" cx="13.5" cy="36" r="2.2" />
                  <circle class="blush" cx="34.5" cy="36" r="2.2" />
                </g>
                <!-- grille -->
                <path class="grille" d="M15 44 h18" />
                {#if mood.sweat}<path class="sweat" d="M41 22 q2.6 3.4 0 5 q-2.6 -1.6 0 -5Z" />{/if}
            </g>
            {#if mood.mood === 'dozing' && action === 'wait'}<text class="zz" x={facing < 0 ? 6 : 37} y="8">z</text>{/if}
          </svg>
        </span>
      </span>
    </button>
    </div>
  </div>
{/if}

<style>
  .bounds {
    position: fixed;
    top: var(--inset-top);
    bottom: var(--inset-bottom);
    left: calc(var(--pad-left) - 12px);
    right: calc(var(--pad-right) - 12px);
    visibility: hidden;
    pointer-events: none;
  }

  .pet {
    position: fixed;
    z-index: 4; /* over the tab bar (3), under the game (10) */
    left: 0;
    top: 0;
    width: 48px;
    height: 56px;
    opacity: 0; /* until it knows where it is */
    pointer-events: none;
  }
  .pet.ready {
    opacity: 1;
  }

  .body {
    display: block;
    width: 100%;
    height: 100%;
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    cursor: grab;
    pointer-events: auto;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
    transform-origin: 50% 20%;
    transition: transform 120ms var(--ease-out);
  }
  .dragging .body {
    cursor: grabbing;
    transition: none;
  }
  .body:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
    border-radius: 14px;
  }
  .pop,
  .squash,
  .wiggle {
    display: block;
    transform-origin: 50% 100%;
  }
  svg {
    display: block;
    overflow: visible;
    transition: transform 120ms var(--ease-out);
  }
  .shadow {
    fill: var(--ink);
    opacity: 0.14;
    transform-box: fill-box;
    transform-origin: 50% 50%;
    transition:
      transform 160ms var(--ease-out),
      opacity 160ms var(--ease-out);
  }
  /* Lifted: the shadow spreads and fades, as if it's further off the page. */
  .dragging .shadow,
  .act-fall .shadow {
    transform: scale(1.3, 1.2);
    opacity: 0.07;
  }
  /* Pressed: a little give the moment the finger lands, before it's a tap or a drag. */
  .body:active svg {
    transform: scale(0.94);
  }
  .dragging svg {
    transform: scale(1.06);
  }

  .shell {
    fill: var(--pet-body);
    stroke: var(--pet-line);
    stroke-width: 2;
  }
  .vent {
    fill: var(--pet-vent);
    stroke: var(--pet-line);
    stroke-width: 1.5;
  }
  .fan path {
    fill: var(--pet-line);
    opacity: 0.55;
  }
  .hub {
    fill: var(--pet-line);
  }
  .light {
    stroke: var(--pet-line);
    stroke-width: 1;
  }
  .eye,
  .mouth {
    fill: var(--pet-line);
  }
  .line,
  .grille,
  .arm {
    fill: none;
    stroke: var(--pet-line);
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .grille {
    opacity: 0.35;
  }
  .foot {
    fill: var(--pet-line);
  }
  .blush {
    fill: var(--pet-blush);
  }
  .sweat {
    fill: var(--pet-sweat);
  }
  .zz {
    fill: var(--muted);
    font: 700 9px var(--font-display);
  }
  .arm {
    stroke-width: 3;
    opacity: 0;
    transform-origin: 40px 31px;
  }

  /* Bubble: opens toward the middle of the screen, above the pet (below it near the top). */
  .bubble {
    position: absolute;
    bottom: calc(100% + 8px);
    right: 0;
    width: max-content;
    max-width: min(220px, 70vw);
    padding: 8px 10px 8px 12px;
    border-radius: 14px;
    background: var(--card);
    color: var(--ink);
    box-shadow:
      0 0 0 1px var(--hairline),
      0 6px 18px rgba(0, 0, 0, 0.14);
    pointer-events: auto;
    transform-origin: 85% 100%;
  }
  .bubble.left {
    right: auto;
    left: 0;
    transform-origin: 15% 100%;
  }
  .bubble.below {
    bottom: auto;
    top: calc(100% + 8px);
    transform-origin: 85% 0;
  }
  .bubble.below.left {
    transform-origin: 15% 0;
  }
  .bubble p {
    margin: 0;
    font-size: 0.9375rem;
    line-height: 1.3;
    overflow-wrap: anywhere;
  }
  .tuck {
    margin: 4px 0 0 -6px;
    padding: 6px;
    min-height: 32px;
    border: 0;
    background: none;
    color: var(--link);
    font: inherit;
    font-size: 0.8125rem;
    touch-action: manipulation;
    user-select: none;
    -webkit-user-select: none;
  }
  .tuck:active {
    transform: scale(0.97);
  }

  /* Motion. Loops animate transform and opacity only, paused off screen by use:ambient. */
  .fan {
    transform-box: fill-box;
    transform-origin: 50% 50%;
  }
  @media (prefers-reduced-motion: no-preference) {
    .fan {
      animation: spin var(--fan-s, 1.6s) linear infinite;
    }
    .fan-1 {
      --fan-s: 1.6s;
    }
    .fan-2 {
      --fan-s: 0.6s;
    }
    .fan-3 {
      --fan-s: 0.28s;
    }
    .act-walk .foot-l {
      animation: step 420ms ease-in-out infinite;
    }
    .act-walk .foot-r {
      animation: step 420ms ease-in-out -210ms infinite;
    }
    .act-walk .wiggle {
      animation: bob 420ms ease-in-out infinite;
    }
    .act-wait .wiggle {
      animation: breathe 3.2s ease-in-out infinite;
    }
    .act-wave .arm {
      opacity: 1;
      animation: wave 700ms ease-in-out 2;
    }
    .act-drag .foot,
    .act-fall .foot {
      transform: translateY(2px);
    }
    .sweat {
      animation: drip 1.6s ease-in infinite;
    }
    .zz {
      animation: drift 2.4s ease-in-out infinite;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    svg,
    .body,
    .shadow {
      transition: none;
    }
    .body:active svg,
    .dragging svg {
      transform: none;
    }
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  @keyframes step {
    50% {
      transform: translateY(-2.5px);
    }
  }
  @keyframes bob {
    50% {
      transform: translateY(-1.5px) rotate(-2deg);
    }
  }
  @keyframes breathe {
    50% {
      transform: scale(1.025, 0.985);
    }
  }
  @keyframes wave {
    50% {
      transform: rotate(-35deg);
    }
  }
  @keyframes drip {
    0% {
      transform: translateY(0);
      opacity: 0;
    }
    20% {
      opacity: 1;
    }
    100% {
      transform: translateY(8px);
      opacity: 0;
    }
  }
  @keyframes drift {
    0% {
      transform: translate(0, 0);
      opacity: 0;
    }
    30% {
      opacity: 1;
    }
    100% {
      transform: translate(4px, -6px);
      opacity: 0;
    }
  }
</style>
