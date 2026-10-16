<script lang="ts">
  import { onMount } from 'svelte';
  import { CHANGELOG, LATEST_ID } from '../lib/changelog';
  import { sgtDate } from '../lib/format';
  import { reducedMotion } from '../lib/motion';
  import { getStored, selectionHaptic, setStored, showBackButton } from '../lib/telegram';

  const SEEN_KEY = 'whats_new_seen';

  let dialog: HTMLDialogElement;
  let open = $state(false);
  let unseen = $state(false);
  let opened = false; // set before storage answers? then the answer is stale

  onMount(async () => {
    const seen = await getStored(SEEN_KEY);
    if (!opened) unseen = seen !== LATEST_ID;
  });

  function show() {
    selectionHaptic();
    dialog.showModal();
    open = true;
    opened = true;
    unseen = false;
    setStored(SEEN_KEY, LATEST_ID);
  }

  let closing = false;
  // Slide out a little faster than it slid in, then close for real.
  async function close() {
    if (closing || !dialog.open) return;
    closing = true;
    try {
      if (!reducedMotion()) {
        const easing = getComputedStyle(dialog).getPropertyValue('--ease-drawer');
        const opts = { duration: 200, easing, fill: 'forwards' } as const;
        await Promise.allSettled([
          dialog.animate([{ transform: 'translateY(100%)' }], opts).finished,
          dialog.animate([{ opacity: 0 }], { ...opts, pseudoElement: '::backdrop' }).finished,
        ]);
      }
    } finally {
      dialog.close();
      dialog.getAnimations({ subtree: true }).forEach((a) => a.cancel());
      closing = false;
    }
  }

  // Tap outside the sheet closes it, but not a drag that started inside and ended outside.
  let downOnBackdrop = false;
  const onBackdropUp = (e: PointerEvent) => downOnBackdrop && e.target === dialog && close();

  // Telegram's header back arrow closes the sheet, like a native screen.
  $effect(() => (open ? showBackButton(close) : undefined));
</script>

<button type="button" class="trigger" onclick={show} aria-haspopup="dialog">
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
    <path
      d="M12 2.5l1.9 5.1 5.1 1.9-5.1 1.9L12 16.5l-1.9-5.1L5 9.5l5.1-1.9L12 2.5Zm6.5 11l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9.9-2.1Z"
      fill="currentColor"
    />
  </svg>
  <span class="visually-hidden">What’s new{unseen ? ' (new updates)' : ''}</span>
  {#if unseen}<span class="dot" aria-hidden="true"></span>{/if}
</button>

<dialog
  bind:this={dialog}
  aria-labelledby="whats-new-title"
  onclose={() => (open = false)}
  oncancel={(e) => {
    e.preventDefault();
    close();
  }}
  onpointerdown={(e) => (downOnBackdrop = e.target === dialog)}
  onpointerup={onBackdropUp}
>
  <div class="sheet">
    <div class="head">
      <h2 id="whats-new-title" class="section-title">What’s new</h2>
      <button type="button" class="close" onclick={close}>Done</button>
    </div>
    <ol>
      {#each CHANGELOG as entry (entry.id)}
        <li>
          <time datetime={entry.date}>{sgtDate(entry.date)}</time>
          <h3>{entry.title}</h3>
          <p>{entry.body}</p>
        </li>
      {/each}
    </ol>
  </div>
</dialog>

<style>
  .trigger {
    position: relative;
    flex: none;
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    margin-left: auto;
    border: 0;
    border-radius: 50%;
    background: var(--card);
    color: var(--brand-shell);
    cursor: pointer;
    transition: transform 120ms var(--ease-out);
  }
  .trigger:active {
    transform: scale(0.97);
  }
  .dot {
    position: absolute;
    top: 9px;
    right: 9px;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--accent);
    box-shadow: 0 0 0 2px var(--card);
  }

  dialog {
    width: 100%;
    max-width: 720px;
    max-height: min(80dvh, 640px);
    margin: auto auto 0;
    padding: 0;
    border: 0;
    border-radius: var(--radius) var(--radius) 0 0;
    background: var(--card);
    color: var(--ink);
    overscroll-behavior: contain;
  }
  dialog[open] {
    animation: sheet-up 320ms var(--ease-drawer);
  }
  dialog::backdrop {
    background: var(--scrim);
  }
  dialog[open]::backdrop {
    animation: fade-in 320ms var(--ease-out);
  }
  .sheet {
    padding: 0 var(--gutter) calc(20px + var(--tg-safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)));
  }
  .head {
    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: 0 calc(-1 * var(--gutter));
    padding: 12px var(--gutter) 8px;
    background: var(--card);
  }
  .head .section-title {
    margin: 0;
  }
  .close {
    min-height: 44px;
    padding: 0 4px;
    border: 0;
    background: none;
    color: var(--accent);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
  ol {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  li {
    padding: 12px 0;
    border-top: 1px solid var(--hairline);
  }
  li:first-child {
    border-top: 0;
  }
  time {
    font-size: 0.8125rem;
    color: var(--muted);
  }
  h3 {
    margin: 2px 0 4px;
    font-family: var(--font-display);
    font-size: 1rem;
    font-weight: 700;
  }
  p {
    margin: 0;
    font-size: 0.9375rem;
    color: var(--ink-2);
  }

  @keyframes sheet-up {
    from {
      transform: translateY(100%);
    }
  }
  @keyframes fade-in {
    from {
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .trigger {
      transition: none;
    }
    dialog[open] {
      animation: fade-in 200ms ease;
    }
  }
</style>
