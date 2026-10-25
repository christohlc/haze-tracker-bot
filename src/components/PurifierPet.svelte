<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { fade, fly, scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { psiBand } from '../../tgcloud/lib/psi.js';
  import { readingsFor } from '../../tgcloud/lib/snapshot.js';
  import { sgtDateOf } from '../../tgcloud/lib/time.js';
  import type { HourRow, Snapshot } from '../lib/api';
  import { area } from '../lib/area.svelte';
  import { ambient, appVisible, onAppVisible, onReducedMotion, reducedMotion } from '../lib/motion';
  import { psiKey, type Period } from '../lib/period';
  import { STORE_KEYS } from '../lib/store-keys';
  import {
    STORAGE_WAIT_MS,
    getStored,
    impactHaptic,
    lockVerticalSwipes,
    notifyHaptic,
    selectionHaptic,
    setStored,
  } from '../lib/telegram';
  import {
    COMBO_PATS,
    FRESH_LINE,
    GREY_LINE,
    NIGHT_LINES,
    PET_H,
    PET_LINES,
    PET_W,
    SHIFT_LINES,
    actionMs,
    addGrime,
    grimeLevel,
    bandShift,
    clamp,
    dragTo,
    fromSaved,
    isSleepy,
    leap,
    leapTarget,
    lovedLines,
    parseFilter,
    parseSaved,
    petOutfit,
    petMood,
    pickAction,
    recentPats,
    release,
    startAction,
    step,
    toSaved,
    type PetAction,
    type BandShift,
    type Filter,
    type PetState,
    type Platform,
    type Reading,
    type World,
  } from '../lib/pet-physics';

  // A little air purifier that wanders the dashboard: it stands on the cards, can be picked up
  // and thrown, and works harder as the haze gets worse. Physics in lib/pet-physics.ts.
  let {
    snapshot,
    history,
    period,
    tab,
    name,
    hidden,
    peekable,
    onhide,
  }: {
    snapshot: Snapshot;
    history: HourRow[];
    period: Period;
    tab: string;
    name: string;
    hidden: boolean;
    /** Tucked away (not hidden by the game): it may peek over the tab bar. */
    peekable: boolean;
    onhide: () => void;
  } = $props();

  const POS_KEY = STORE_KEYS.petPos;
  const FILTER_KEY = STORE_KEYS.petFilter;
  // [cx, cy, r]. The middle puff first: at low fan only it runs. Specks start off the sides.
  const PUFFS = [[23, 2, 2.2], [18, 3, 1.8], [28, 3.5, 1.6]];
  const SPECKS = [[2, 40, 1.1], [46, 42, 1], [0, 47, 0.9], [48, 48, 1.2]];
  const TAP_SLOP = 10; // px; hedgehog-mode's click threshold

  // The same band as the hero, so the pet and the big number agree.
  const band = $derived(psiBand(readingsFor(snapshot, area.id)[psiKey(period)]?.value ?? null));
  const mood = $derived(petMood(band?.id));
  // Night with little haze: nightcap on, mostly dozing. The clock ticks once a minute.
  let clock = $state(Date.now());
  const sleepy = $derived(isSleepy(mood.mood, clock));
  // Held, the fan revs a step; past HOLD_MS it's turbo, flat out, for TURBO_MS.
  let revving = $state(false);
  let turbo = $state(false);
  const fan = $derived(turbo ? 3 : revving ? Math.min(mood.fan + 1, 3) : mood.fan);

  let el = $state<HTMLElement>();
  let bounds = $state<HTMLElement>();
  let squashEl = $state<HTMLElement>();
  let wiggleEl = $state<HTMLElement>();
  let heartsEl = $state<SVGElement>();
  let sparkleEl = $state<SVGElement>();
  let bodyEl = $state<HTMLElement>();
  let action = $state<PetAction>('fall');
  // Eyes shut and a z: dozing, or a sleepy night, while it waits (turbo wakes it).
  const napping = $derived((mood.mood === 'dozing' || sleepy) && action === 'wait' && !turbo);
  let facing = $state<1 | -1>(1);
  let ready = $state(false);
  let bubble = $state<string | null>(null);
  let bubbleLeft = $state(true); // opens toward the middle of the screen
  let bubbleBelow = $state(false); // near the top, it opens underneath
  let reduce = $state(reducedMotion());
  let dragging = $state(false);
  // On the floor, over content, with no card top in view to leap to: it fades back.
  let grounded = $state(false);

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
  let groundedAt = 0;
  function think(now: number) {
    if (!s || s.on == null || s.action === 'drag') return;
    // Off the floor and onto a card soon after it lands there, whatever it was doing, so it
    // never rests over content. Under reduced motion it just appears there.
    const target = grounded && now - groundedAt > 600 ? leapTarget(s, world) : null;
    if (target) {
      leap(s, target, reduce);
      nextPick = now + 400;
      return;
    }
    if (reduce || now < nextPick) return;
    const a = pickAction(mood.mood, Math.random(), sleepy);
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
    cling(dt);
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
    if ((s.on === 'floor') !== grounded) {
      grounded = s.on === 'floor';
      groundedAt = now;
    }
    draw();
  }

  // Runs only while someone can see it: not tucked away, the page shown, Telegram not in the background.
  function start() {
    if (frame || hidden || !appVisible()) return;
    clearTimeout(slow);
    last = 0;
    lastScrollY = window.scrollY;
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
  function play(node: Element | undefined, keyframes: Keyframe[], duration: number, delay = 0) {
    if (!reduce) node?.animate?.(keyframes, { duration, delay, easing: ease, fill: 'backwards' });
  }
  /** Fades in, rises and fades out: the sparkle and the hearts. */
  const floatUp = (rise: number): Keyframe[] => [
    { opacity: 0, transform: 'translateY(0) scale(0.8)' },
    { opacity: 1, offset: 0.3 },
    { opacity: 0, transform: `translateY(${-rise}px) scale(1)` },
  ];

  // Hold for turbo: the fan revs while it's held, so you can see it coming; let go early and it
  // drops back (a spin's speed can't ease). A move past TAP_SLOP is a drag instead, and the click
  // that ends a turbo press isn't a pat.
  const HOLD_RAMP_MS = 150;
  const HOLD_MS = 500;
  const TURBO_MS = 2000;
  let holdTimers: ReturnType<typeof setTimeout>[] = [];
  let turboTimer: ReturnType<typeof setTimeout> | undefined;
  let turboPress = false; // this press set off a turbo
  function startHold() {
    turboPress = false;
    holdTimers = [setTimeout(() => (revving = true), HOLD_RAMP_MS), setTimeout(goTurbo, HOLD_MS)];
  }
  function stopHold() {
    holdTimers.forEach(clearTimeout);
    holdTimers = [];
    revving = false;
  }
  function goTurbo() {
    stopHold();
    turboPress = turbo = true;
    impactHaptic();
    clearTimeout(turboTimer);
    turboTimer = setTimeout(() => (turbo = false), TURBO_MS);
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
    startHold();
    start();
  }
  function onpointermove(e: PointerEvent) {
    if (!pointer || e.pointerId !== pointer.id || !s) return;
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    if (!dragging && Math.hypot(e.clientX - pointer.startX, e.clientY - pointer.startY) > TAP_SLOP) {
      dragging = true;
      stopHold();
      bubble = null;
      unlockSwipes = lockVerticalSwipes(); // a downward drag mustn't minimise the app
      selectionHaptic();
      s.vx = s.vy = 0;
    }
  }
  function endDrag() {
    pointer = null;
    stopHold();
    if (!dragging) return false;
    dragging = false;
    unlockSwipes?.();
    unlockSwipes = null;
    return true;
  }
  function letGo(e: PointerEvent) {
    if (!pointer || e.pointerId !== pointer.id || !s) return;
    if (turboPress) droppedAt = performance.now(); // the click that follows isn't a pat
    if (!endDrag()) return;
    droppedAt = performance.now();
    moved = true;
    release(s); // the next step throws it, or under reduced motion puts it straight down
    nextPick = droppedAt + 1500;
  }

  /** Opens the bubble with a line, toward the middle of the screen, for 4 s. `offer`: with Change filter. */
  let bubbleTimer: ReturnType<typeof setTimeout> | undefined;
  let offerFilter = $state(false);
  function say(text: string, offer = false) {
    if (!s) return;
    offerFilter = offer;
    bubbleLeft = s.x + PET_W / 2 < (world.left + world.right) / 2;
    bubbleBelow = s.y - PET_H - world.top < 90;
    bubble = text;
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => (bubble = null), 4000);
  }

  // A tap (or Enter/Space) is a pat: a wiggle and a line about how it's getting on. Three in quick
  // succession and it's smitten: hearts and a line of its own.
  let line = 0;
  let pats: number[] = [];
  let askFilter = false;
  function pat() {
    const now = performance.now();
    if (!s || now - droppedAt < 400) return;
    pats = recentPats(pats, now);
    const wiggle = (deg: number, ms: number) =>
      play(squashEl, [{}, { transform: `rotate(${-deg}deg)`, offset: 0.25 }, { transform: `rotate(${deg * 0.75}deg)`, offset: 0.6 }, {}], ms);
    if (pats.length >= COMBO_PATS) {
      pats = [];
      notifyHaptic('success');
      wiggle(10, 300);
      const rise = floatUp(12);
      [...(heartsEl?.children ?? [])].forEach((heart, i) => play(heart, rise, 450, i * 60));
      const loved = lovedLines(name);
      say(loved[line++ % loved.length]);
    } else {
      selectionHaptic();
      wiggle(8, 420);
      const lines = sleepy ? NIGHT_LINES : PET_LINES[mood.mood];
      if (grime === 2 && (askFilter = !askFilter)) say(GREY_LINE, true); // every other pat, so it doesn't nag
      else say(lines[line++ % lines.length]);
    }
    wave();
  }

  // Its filter greys with the haze hours in NEA's history since it last looked, for your area
  // (addGrime), and only ever greys: a pat while it's grimy offers a fresh one. Purely for fun.
  let filter = $state<Filter | null>(null);
  let filterRead = $state(false);
  const grime = $derived(grimeLevel(filter));
  function saveFilter(f: Filter) {
    filter = f;
    setStored(FILTER_KEY, JSON.stringify(f));
  }
  $effect(() => {
    if (!filterRead) return;
    const was = untrack(() => filter);
    const next = addGrime(was, history, area.id);
    if (next !== was) untrack(() => saveFilter(next));
  });
  function changeFilter() {
    if (!filter) return;
    saveFilter({ dirt: 0, through: filter.through });
    notifyHaptic('success');
    play(squashEl, [{}, { transform: 'translateY(-4px) rotate(-6deg)', offset: 0.4 }, {}], 360);
    say(FRESH_LINE);
  }

  // Something to wear on the day (SGT), unless it's in its nightcap.
  const outfit = $derived(sleepy ? null : petOutfit(sgtDateOf(clock)));

  // Tucked away, it peeks over the tab bar's right end now and then: after a tab switch, at most
  // once a minute, for 3 s. Only decoration (no pointer), so it never covers a tap.
  const PEEK_MS = 3000;
  const PEEK_SHOWS = 36; // px over the bar: down to its eyes (y 32, r 2)
  const PEEK_GAP_MS = 60_000;
  let peek = $state<{ left: number; top: number } | null>(null);
  let peekedAt = -PEEK_GAP_MS;
  let lastTab: string | null = null;
  let peekTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const t = tab;
    untrack(() => {
      const switched = lastTab != null && t !== lastTab;
      lastTab = t;
      const now = performance.now();
      if (!switched || !peekable || now - peekedAt < PEEK_GAP_MS) return;
      peekedAt = now;
      measure();
      const barTop = world.floor + 6; // measure() keeps the floor 6px above the tab bar
      peek = { left: world.right - PET_W - 8, top: barTop - PEEK_SHOWS };
      clearTimeout(peekTimer);
      peekTimer = setTimeout(() => (peek = null), PEEK_MS);
    });
  });


  // A new NEA reading that moves the band: a sparkle as it clears, a brace as it worsens, and a
  // line either way. Switching area or period isn't the air changing (bandShift).
  let lastReading: Reading | null = null;
  let shiftLine = 0;
  // A refresh can land while it's still reading where it was left (STORAGE_WAIT_MS): it reacts once it's out.
  let pendingShift: BandShift | null = null;
  function react(shift: BandShift) {
    if (!s) return void (pendingShift = shift);
    pendingShift = null;
    if (hidden || dragging) return; // tucked away or in hand: the user's choice, so it lets this one go
    const lines = SHIFT_LINES[shift];
    say(lines[shiftLine++ % lines.length]);
    if (shift === 'down') {
      play(sparkleEl, floatUp(8), 900);
    } else {
      play(squashEl, [{}, { transform: 'scale(1.06, 0.9)', offset: 0.35 }, {}], 360);
    }
  }
  $effect(() => {
    // The 24-hour PSI is NEA's own feed, with its own time; the 1h and 3h follow PM2.5's.
    const asOf = period === '24h' ? snapshot.psiAsOf : snapshot.asOf;
    const next: Reading = { asOf, area: area.id, period, band: band?.id ?? null };
    untrack(() => {
      const shift = bandShift(lastReading, next);
      lastReading = next;
      if (shift) react(shift);
    });
  });
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

  // A fast scroll while it's riding a card: it clings on with a wobble. Measured per frame, so the
  // speed doesn't depend on how often the device sends scroll events.
  const CLING_SPEED = 2.5; // px/ms, about 40px a frame
  const CLING_GAP_MS = 600;
  let lastScrollY = 0;
  let clungAt = 0;
  function cling(dt: number) {
    const dy = window.scrollY - lastScrollY;
    lastScrollY = window.scrollY;
    if (Math.abs(dy) / dt < CLING_SPEED || typeof s?.on !== 'number' || dragging || last - clungAt < CLING_GAP_MS) return;
    clungAt = last;
    play(wiggleEl, [{}, { transform: `translateY(${dy > 0 ? -2 : 2}px) rotate(-6deg)`, offset: 0.3 }, { transform: 'rotate(4deg)', offset: 0.65 }, {}], 450);
  }

  onMount(() => {
    ease = getComputedStyle(document.documentElement).getPropertyValue('--ease-out').trim() || ease;
    const offVisible = onAppVisible((v) => (v ? start() : stop()));
    const minute = setInterval(() => (clock = Date.now()), 60_000);
    const offMotion = onReducedMotion((r) => {
      reduce = r;
      start(); // the next step puts it straight down if it was mid-air
    });
    getStored(FILTER_KEY, STORAGE_WAIT_MS).then((raw) => {
      filter = parseFilter(raw);
      filterRead = true;
    });
    getStored(POS_KEY, STORAGE_WAIT_MS).then((raw) => {
      measure();
      const saved = parseSaved(raw);
      // First time: on the floor, bottom right, out of the way. Saved: drops from where it was left.
      s = saved
        ? fromSaved(saved, world)
        : { x: world.right - PET_W - 8, y: world.floor, vx: 0, vy: 0, facing: -1, action: 'wait', on: 'floor' };
      nextPick = performance.now() + 1200;
      draw();
      ready = true;
      if (pendingShift) react(pendingShift);
    });
    return () => {
      stop();
      unlockSwipes?.();
      clearTimeout(saveTimer);
      clearTimeout(bubbleTimer);
      clearTimeout(turboTimer);
      clearTimeout(peekTimer);
      clearInterval(minute);
      stopHold();
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
    class="pet mood-{mood.mood} fan-{fan} act-{action}"
    class:dragging
    class:turbo
    class:ready
    class:grounded={grounded && !bubble && !dragging}
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
        <div class="actions">
          {#if offerFilter}<button type="button" class="tuck" onclick={changeFilter}>Change filter</button>{/if}
          <button type="button" class="tuck" onclick={tuckAway}>Tuck away</button>
        </div>
      </div>
    {/if}
    </div>
    <button
      type="button"
      class="body"
      bind:this={bodyEl}
      aria-label="{name ? `${name}, your air purifier` : 'Air purifier pet'}. Tap to pat, hold for turbo, drag to move."
      onclick={pat}
      {onpointerdown}
      {onpointermove}
      onpointerup={letGo}
      onpointercancel={letGo}
      onlostpointercapture={letGo}
      oncontextmenu={(e) => e.preventDefault()}
      {onpointerenter}
    >
      <span class="squash" bind:this={squashEl}>
        <span class="wiggle" bind:this={wiggleEl}>
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
                <!-- grime from the haze it has filtered, in two steps -->
                <rect class="grime grime-{grime}" x="7" y="7" width="34" height="41" rx="10" />
                <!-- the fan, seen through the top vent -->
                <circle class="vent" cx="22" cy="17" r="8.5" />
                <g class="fan">
                  <path d="M22 17 C22 12 25 10 27 11.5 C26 14 24 16 22 17Z" />
                  <path d="M22 17 C26.3 19.5 26.6 23 24.3 24 C22.6 21.9 22 19.4 22 17Z" />
                  <path d="M22 17 C17.7 19.5 14.7 18 15 15.4 C17.6 15 19.9 15.7 22 17Z" />
                </g>
                <circle class="hub" cx="22" cy="17" r="1.6" />
                <!-- clean air out of the top; how many and how fast follow the fan -->
                <g class="puffs">
                  {#each PUFFS as [cx, cy, r], i (i)}<circle {cx} {cy} {r} style:--i={i} />{/each}
                </g>
                <!-- haze drawn into the grille, once there's haze to filter -->
                {#if mood.haze}
                  <g class="specks">
                    {#each SPECKS as [cx, cy, r], i (i)}<circle {cx} {cy} {r} style:--i={i} />{/each}
                  </g>
                {/if}
                <!-- status light, in the band's colour -->
                <circle class="light" cx="36" cy="12.5" r="2.4" style:fill={band ? `var(--band-${band.id})` : 'var(--muted)'} />
                <!-- face -->
                <g class="face">
                  {#if action === 'drag' || action === 'fall'}
                    <circle class="eye" cx="18" cy="32" r="2.4" />
                    <circle class="eye" cx="30" cy="32" r="2.4" />
                    <ellipse class="eye" cx="24" cy="38.5" rx="2" ry="2.4" />
                  {:else if napping}
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
                <!-- a nightcap, after 11 pm while there's little to filter -->
                {#if sleepy}
                  <path class="cap" d="M9 9.5 Q12 -1 26 1 Q35 2.5 41 8 L37 10 Q30 6 9 9.5Z" />
                  <circle class="cap-pom" cx="41.5" cy="8.5" r="2.4" />
                {/if}
                <!-- dressed for the day -->
                {#if outfit === 'halloween'}
                  <g class="outfit">
                    <ellipse class="pumpkin" cx="24" cy="3" rx="8" ry="4.6" />
                    <path class="outfit-line" d="M20.5 0 q-1.5 3 0 6.6 M27.5 0 q1.5 3 0 6.6" />
                    <path class="stem" d="M24 -1.6 q0.4 -2 2.2 -2.6" />
                  </g>
                {:else if outfit === 'christmas'}
                  <g class="outfit">
                    <path class="santa" d="M9 8 Q13 -3 26 -2 Q36 -1 41 9 L38 8 Q33 2 26 2.5 Q16 3 12 8Z" />
                    <rect class="trim" x="8" y="6" width="31" height="4" rx="2" />
                    <circle class="trim" cx="41" cy="9.5" r="2.6" />
                  </g>
                {:else if outfit === 'deepavali'}
                  <g class="outfit">
                    <path class="diya" d="M17 2 h14 q-1 4.4 -7 4.4 q-6 0 -7 -4.4Z" />
                    <path class="flame" d="M24 -4.6 q2.4 3 0 5.6 q-2.4 -2.6 0 -5.6Z" />
                  </g>
                {:else if outfit === 'cny'}
                  <g class="outfit">
                    <circle class="mandarin" cx="24" cy="2.5" r="4.4" />
                    <path class="leaf" d="M24 -1.8 q3 -2.6 5.6 -0.6 q-2.6 2 -5.6 0.6Z" />
                  </g>
                {/if}
                {#if mood.sweat}<path class="sweat" d="M41 22 q2.6 3.4 0 5 q-2.6 -1.6 0 -5Z" />{/if}
            </g>
            <!-- a sparkle as the air clears; shown only while it plays -->
            <g class="sparkle" bind:this={sparkleEl}>
              <path d="M8 4 l1 2.4 l2.4 1 l-2.4 1 l-1 2.4 l-1 -2.4 l-2.4 -1 l2.4 -1Z" />
              <path d="M40 0 l0.8 1.8 l1.8 0.8 l-1.8 0.8 l-0.8 1.8 l-0.8 -1.8 l-1.8 -0.8 l1.8 -0.8Z" />
              <path d="M44 10 l0.6 1.4 l1.4 0.6 l-1.4 0.6 l-0.6 1.4 l-0.6 -1.4 l-1.4 -0.6 l1.4 -0.6Z" />
            </g>
            <!-- hearts for a run of pats; shown only while they play -->
            <g class="hearts" bind:this={heartsEl}>
              <path d="M10 6 c-1.6 -2.6 -5 -1 -3.4 1.6 L10 11 L13.4 7.6 C15 5 11.6 3.4 10 6Z" />
              <path d="M24 2 c-1.2 -2 -3.8 -0.8 -2.6 1.2 L24 5.8 L26.6 3.2 C27.8 1.2 25.2 0 24 2Z" />
              <path d="M38 6 c-1.6 -2.6 -5 -1 -3.4 1.6 L38 11 L41.4 7.6 C43 5 39.6 3.4 38 6Z" />
            </g>
            {#if napping}<text class="zz" x={facing < 0 ? 6 : 37} y="8">z</text>{/if}
          </svg>
        </span>
      </span>
    </button>
    </div>
  </div>
{/if}

{#if peekable && peek}
  <!-- Peeking over the tab bar while tucked away: decoration only. -->
  <div class="peek" style:transform="translate3d({peek.left}px, {peek.top}px, 0)" aria-hidden="true">
    <div transition:fly={{ y: 20, duration: reduce ? 0 : 240, easing: cubicOut }}>
      <svg viewBox="0 0 48 56" width={PET_W} height={PET_H}>
        <rect class="shell" x="6" y="6" width="36" height="43" rx="11" />
        <circle class="vent" cx="22" cy="17" r="8.5" />
        <circle class="eye" cx="18" cy="32" r="2" />
        <circle class="eye" cx="30" cy="32" r="2" />
      </svg>
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
    transition: opacity 200ms var(--ease-out);
  }
  .pet.ready.grounded {
    opacity: 0.45;
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
  .puffs circle,
  .specks circle {
    opacity: 0;
    transform-box: fill-box;
    transform-origin: 50% 50%;
  }
  .puffs circle {
    fill: var(--pet-puff);
  }
  .specks circle {
    fill: var(--pet-speck);
    /* scaled toward the grille's middle: drawn in and shrinking */
    transform-box: view-box;
    transform-origin: 24px 44px;
  }
  .hearts path {
    fill: var(--pet-heart);
    opacity: 0;
    transform-box: fill-box;
    transform-origin: 50% 100%;
  }
  .cap {
    fill: var(--pet-cap);
    stroke: var(--pet-line);
    stroke-width: 1.5;
    stroke-linejoin: round;
  }
  .cap-pom {
    fill: var(--pet-body);
    stroke: var(--pet-line);
    stroke-width: 1.5;
  }
  .sparkle {
    fill: var(--band-good);
    opacity: 0;
    transform-box: fill-box;
    transform-origin: 50% 100%;
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
  .actions {
    display: flex;
    gap: 8px; /* more than the buttons' -6px margin, so their 44px hit areas don't overlap */
  }
  .grime {
    fill: var(--pet-speck);
    opacity: 0;
    transition: opacity 400ms ease;
  }
  .grime-1 {
    opacity: 0.18;
  }
  .grime-2 {
    opacity: 0.35;
  }
  /* Costume art is fixed, like the nut in the game: a pumpkin is orange in either scheme. */
  .outfit {
    stroke: var(--pet-line);
    stroke-width: 1.5;
    stroke-linejoin: round;
  }
  .pumpkin {
    fill: #f08a24;
  }
  .outfit-line,
  .stem {
    fill: none;
    stroke-linecap: round;
  }
  .stem,
  .leaf {
    stroke: #3f7d2c;
    stroke-width: 2;
  }
  .leaf {
    fill: #5aa63c;
    stroke-width: 1;
  }
  .santa {
    fill: #d8352f;
  }
  .trim {
    fill: var(--pet-body);
  }
  .diya {
    fill: #c46a2b;
  }
  .flame {
    fill: #ffb21f;
    stroke: #e3741a;
    stroke-width: 1;
  }
  .mandarin {
    fill: #f7941d;
  }
  .peek {
    position: fixed;
    z-index: 2; /* under the tab bar (3): only its top shows over it */
    left: 0;
    top: 0;
    width: 48px;
    height: 56px;
    pointer-events: none;
  }
  .tuck {
    margin: -2px 0 -6px -6px; /* a 44px hit area, laid out as the 32px it looks */
    padding: 6px;
    min-height: 44px;
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
      --puff-s: 2.4s;
      --puffs: 1;
    }
    .fan-2 {
      --fan-s: 0.6s;
      --puff-s: 1.6s;
      --puffs: 2;
    }
    .fan-3 {
      --fan-s: 0.28s;
      --puff-s: 1.1s;
      --puffs: 3;
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
    .turbo .wiggle {
      animation: shake 120ms ease-in-out infinite;
    }
    /* One puff at low fan, two on high, three flat out, evenly spaced, rising faster as the fan speeds up. */
    .puffs circle {
      animation: rise var(--puff-s, 2.4s) ease-in-out calc(var(--i) * var(--puff-s, 2.4s) / var(--puffs, 1) * -1) infinite;
    }
    .fan-1 .puffs :nth-child(n + 2),
    .fan-2 .puffs :nth-child(3) {
      animation: none;
    }
    .specks circle {
      animation: drawn-in 2.2s ease-in-out calc(var(--i) * -0.55s) infinite;
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

  @keyframes shake {
    25% {
      transform: translateX(-0.8px) rotate(-1deg);
    }
    75% {
      transform: translateX(0.8px) rotate(1deg);
    }
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(0) scale(0.6);
    }
    30% {
      opacity: 0.9;
    }
    to {
      opacity: 0;
      transform: translateY(-10px) scale(1);
    }
  }
  @keyframes drawn-in {
    from {
      opacity: 0;
      transform: none;
    }
    25% {
      opacity: 0.8;
    }
    to {
      opacity: 0;
      transform: scale(0.45);
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
