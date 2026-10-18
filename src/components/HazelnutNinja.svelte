<script lang="ts">
  // The hidden game: tapping the header's logo or name opens it (App.svelte). Engine in lib/ninja.ts.
  import { onMount } from 'svelte';
  import { cubicOut } from 'svelte/easing';
  import { scale } from 'svelte/transition';
  import { reducedMotion } from '../lib/motion';
  import { ARCADE_TIME, createGame, readTheme, type Game } from '../lib/ninja';
  import { STORE_KEYS } from '../lib/store-keys';
  import { getStored, lockVerticalSwipes, notifyHaptic, selectionHaptic, setStored } from '../lib/telegram';

  let { onclose }: { onclose: () => void } = $props();

  const BEST_KEY = STORE_KEYS.ninjaBest;

  let status = $state<'idle' | 'playing' | 'over'>('idle');
  let score = $state(0);
  let timeLeft = $state(ARCADE_TIME);
  let best = $state(0);
  let newBest = $state(false);
  let field = $state<HTMLElement>();
  let canvas = $state<HTMLCanvasElement>();
  let startButton = $state<HTMLButtonElement>();
  let game: Game | undefined;

  let reduce = $state(reducedMotion());

  function start() {
    newBest = false;
    status = 'playing';
    game?.start();
  }

  onMount(() => {
    // In Telegram, Best follows the user across devices (CloudStorage).
    getStored(BEST_KEY).then((v) => (best = Math.max(best, Number(v) || 0)));
    // Back to whatever opened the game (the header) on close.
    const opener = document.activeElement as HTMLElement | null;

    let lastTick = 0;
    game = createGame(
      canvas!,
      {
        onScore: (s) => (score = s),
        onTime: (s) => (timeLeft = s),
        onSlice: (kind) => {
          if (kind === 'haze') return notifyHaptic('error');
          const now = performance.now();
          if (now - lastTick > 60) selectionHaptic();
          lastTick = now;
        },
        onOver: (s) => {
          status = 'over';
          notifyHaptic('success');
          if (s > best) {
            best = s;
            newBest = true;
            setStored(BEST_KEY, String(s));
          }
        },
      },
      readTheme(),
      reduce,
    );

    const ro = new ResizeObserver(([e]) => {
      if (e) game?.resize(e.contentRect.width, e.contentRect.height);
    });
    ro.observe(field!);

    // Telegram theme changes rewrite <html>'s style and data-theme.
    const mo = new MutationObserver(() => game?.setTheme(readTheme()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'data-theme'] });

    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const onMotion = () => {
      reduce = motion.matches;
      game?.setReducedMotion(reduce);
    };
    motion.addEventListener('change', onMotion);

    const onVisible = () => game?.setPaused(document.hidden);
    document.addEventListener('visibilitychange', onVisible);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onclose();
      // A focused button (Start, ×) handles Enter and Space itself.
      else if ((e.key === 'Enter' || e.key === ' ') && status !== 'playing' && !(document.activeElement instanceof HTMLButtonElement)) {
        e.preventDefault();
        start();
      }
    };
    window.addEventListener('keydown', onKey);

    // A downward swipe slices instead of closing the Mini App.
    const unlockSwipes = lockVerticalSwipes();
    startButton?.focus({ preventScroll: true });

    return () => {
      game?.destroy();
      ro.disconnect();
      mo.disconnect();
      motion.removeEventListener('change', onMotion);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('keydown', onKey);
      unlockSwipes();
      opener?.focus({ preventScroll: true });
    };
  });
</script>

<div
  class="ninja"
  role="dialog"
  aria-modal="true"
  aria-label="Hazelnut Ninja"
  in:scale|global={{ start: reduce ? 1 : 0.97, duration: 200, easing: cubicOut }}
  out:scale|global={{ start: reduce ? 1 : 0.98, duration: 140, easing: cubicOut }}
>
  <div class="hud">
    <span class="pill num">Score {score}</span>
    <span class="pill num" class:low={status === 'playing' && timeLeft <= 10}>{timeLeft}s</span>
    <span class="best num">Best {best}</span>
    <button type="button" class="close" aria-label="Close the game" onclick={onclose}>
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
      </svg>
    </button>
  </div>

  <div class="visually-hidden" aria-live="polite">
    {status === 'over' ? `Time’s up. You scored ${score}.` : ''}
  </div>

  <div class="stage">
    <div class="field" bind:this={field}>
      <canvas bind:this={canvas}></canvas>
      {#if status !== 'playing'}
        <div class="panel">
          {#if status === 'over'}
            <p class="title">Time’s up!</p>
            <p class="note">You scored {score}{newBest && score > 0 ? '. New best!' : '.'}</p>
          {:else}
            <p class="title">Hazelnut Ninja</p>
            <p class="note">Swipe to slice the hazelnuts. Dodge the haze. You have {ARCADE_TIME} seconds.</p>
          {/if}
          <button type="button" class="primary" bind:this={startButton} onclick={start}>
            {status === 'over' ? 'Play again' : 'Start'}
          </button>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .ninja {
    position: fixed;
    inset: 0;
    z-index: 10;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: calc(12px + var(--inset-top)) var(--pad-right) calc(16px + var(--inset-bottom)) var(--pad-left);
    background: var(--page);
    /* Nothing in here scrolls, and iOS ignores overflow: hidden on <html> for touch. */
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
    /* A long press mid-swipe shouldn't pop iOS's “Save image” callout on the canvas. */
    -webkit-touch-callout: none;
    -webkit-tap-highlight-color: transparent;
  }
  .hud {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    max-width: 480px;
    margin: 0 auto;
    font-size: 0.875rem;
  }
  .pill {
    padding: 4px 10px;
    border-radius: 999px;
    background: var(--card);
    color: var(--ink);
    font-weight: 650;
    transition: background-color 200ms var(--ease-out), color 200ms var(--ease-out);
  }
  .pill.low {
    background: color-mix(in srgb, var(--status-critical) 16%, var(--card));
    color: var(--status-critical);
  }
  .best {
    color: var(--muted);
  }
  .close {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    margin: -6px -10px -6px auto;
    border: 0;
    border-radius: 50%;
    background: none;
    color: var(--ink-2);
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition: transform 120ms var(--ease-out);
  }
  .close:active {
    transform: scale(0.97);
  }
  /* The field is 3:4 and as big as fits, on short screens as well as tall ones. */
  .stage {
    flex: 1;
    min-height: 0;
    display: grid;
    place-items: center;
    container-type: size;
  }
  .field {
    position: relative;
    width: min(100cqw, 75cqh, 480px);
    aspect-ratio: 3 / 4;
    overflow: hidden;
    border-radius: var(--radius);
    background: var(--card);
  }
  canvas {
    position: absolute;
    inset: 0;
    display: block;
    width: 100%;
    height: 100%;
    touch-action: none;
    cursor: crosshair;
  }
  .panel {
    position: absolute;
    inset: 0;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 10px;
    padding: 24px;
    text-align: center;
    background: color-mix(in srgb, var(--card) 78%, transparent);
    -webkit-backdrop-filter: blur(2px);
    backdrop-filter: blur(2px);
    animation: fade 200ms var(--ease-out);
  }
  .title {
    margin: 0;
    font-family: var(--font-display);
    font-size: 1.5rem;
    font-weight: 800;
    letter-spacing: -0.015em;
    color: var(--brand-shell);
  }
  .panel .note {
    max-width: 26ch;
    font-size: 0.9375rem;
    color: var(--ink-2);
  }
  .panel .primary {
    margin-top: 6px;
    min-width: 160px;
    padding: 0 24px;
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .pill,
    .close {
      transition: none;
    }
  }
</style>
