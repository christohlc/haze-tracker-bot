<script lang="ts">
  // The whole Mini App while the bot rests (tgcloud/lib/retired.js). It shows no reading at all,
  // not even the one saved on this device, so nothing stale looks current.
  import { NEA_HAZE_URL, RETIRED_SCREEN } from '../../tgcloud/lib/retired.js';
  import { openExternal } from '../lib/telegram';
</script>

<main>
  <img class="logo" src="/logo.svg" alt="" width="72" height="72" />
  <p class="name">I’m going hazelnuts!</p>
  <h1>{RETIRED_SCREEN.title}</h1>
  <p class="body">{RETIRED_SCREEN.body}</p>
  <a class="primary" href={NEA_HAZE_URL} target="_blank" rel="noopener noreferrer" onclick={(e) => openExternal(e, NEA_HAZE_URL)}>
    {RETIRED_SCREEN.link}
  </a>
</main>

<style>
  main {
    box-sizing: border-box;
    min-height: 100dvh;
    max-width: 420px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: calc(24px + var(--inset-top)) var(--pad-right) calc(24px + var(--inset-bottom)) var(--pad-left);
    animation: rise 240ms var(--ease-out);
  }
  .logo {
    display: block;
    margin-bottom: 12px;
  }
  .name {
    margin: 0 0 4px;
    font-family: var(--font-display);
    font-size: 0.875rem;
    font-weight: 650;
    color: var(--muted);
  }
  h1 {
    margin: 0 0 8px;
    font-family: var(--font-display);
    font-size: 1.5rem;
    font-weight: 700;
    letter-spacing: -0.015em;
    text-wrap: balance;
  }
  .body {
    margin: 0 0 24px;
    color: var(--ink-2);
    text-wrap: pretty;
  }
  .primary {
    display: flex;
    align-items: center;
    justify-content: center;
    align-self: stretch;
    padding: 0 16px;
    text-decoration: none;
    user-select: none;
    -webkit-user-select: none;
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    main {
      animation: none;
    }
  }
</style>
