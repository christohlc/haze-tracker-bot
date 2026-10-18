<script lang="ts" module>
  export type TabIconName = 'live' | 'gauge' | 'grid';
</script>

<script lang="ts">
  // The tab bar's icons, drawn in parts so each can play a short move when its tab is picked,
  // like Telegram's own tab bar: the live signal pulses, the gauge's needle sweeps across, the
  // grid's squares each slide one corner round.
  let { name, play = false }: { name: TabIconName; play?: boolean } = $props();
</script>

<svg viewBox="0 0 24 24" width="22" height="22" class:play aria-hidden="true">
  {#if name === 'live'}
    <path class="core" d="M12 10.5a1.5 1.5 0 1 1 0 3a1.5 1.5 0 1 1 0-3z" />
    <path class="wave near" d="M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7" />
    <path class="wave far" d="M5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8" />
  {:else if name === 'gauge'}
    <path d="M4 16a8 8 0 0 1 16 0" />
    <path class="needle" d="M12 16l3.5-4.5" />
  {:else}
    <path class="sq tl" d="M5 5h5v5H5z" />
    <path class="sq tr" d="M14 5h5v5h-5z" />
    <path class="sq bl" d="M5 14h5v5H5z" />
    <path class="sq br" d="M14 14h5v5h-5z" />
  {/if}
</svg>

<style>
  svg {
    display: block;
    overflow: visible;
    fill: none;
    stroke: currentColor;
    stroke-width: var(--icon-stroke, 1.8);
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  /* Each part turns about a point of the 24×24 drawing; the grid's squares about their own middles. */
  path {
    transform-box: view-box;
  }

  /* Live: the dot beats, then the waves ripple out from it, near before far. */
  .core,
  .wave {
    transform-origin: 12px 12px;
  }
  @keyframes beat {
    40% {
      transform: scale(1.35);
    }
  }
  @keyframes ripple {
    0% {
      transform: scale(0.7);
      opacity: 0;
    }
    55% {
      transform: scale(1.06);
      opacity: 1;
    }
  }

  /* Gauge: the needle swings in from the left, a touch past where it rests, and settles. */
  .needle {
    transform-origin: 12px 16px;
  }
  @keyframes sweep {
    0% {
      transform: rotate(-90deg);
    }
    65% {
      transform: rotate(12deg);
    }
  }

  /* Grid: each square slides one corner clockwise, ducking a little as it goes. They're alike,
     so when the move ends and they snap home, the grid looks the same. */
  .sq {
    transform-box: fill-box;
    transform-origin: center;
  }
  .tl {
    --dx: 9px;
    --dy: 0px;
  }
  .tr {
    --dx: 0px;
    --dy: 9px;
  }
  .br {
    --dx: -9px;
    --dy: 0px;
  }
  .bl {
    --dx: 0px;
    --dy: -9px;
  }
  @keyframes slide {
    50% {
      transform: translate(calc(var(--dx) / 2), calc(var(--dy) / 2)) scale(0.75);
    }
    100% {
      transform: translate(var(--dx), var(--dy));
    }
  }
  /* Reduced motion: the icons stay still. */
  @media (prefers-reduced-motion: no-preference) {
    .play .core {
      animation: beat 360ms var(--ease-out);
    }
    .play .wave {
      animation: ripple 420ms var(--ease-out) backwards;
    }
    .play .far {
      animation-delay: 50ms;
    }
    .play .needle {
      animation: sweep 480ms var(--ease-out);
    }
    .play .sq {
      animation: slide 420ms var(--ease-in-out);
    }
  }
</style>
