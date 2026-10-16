<script lang="ts">
  import { onMount } from 'svelte';
  import { CHANGELOG, LATEST_ID } from '../lib/changelog';
  import { sgtDayMonth } from '../lib/format';
  import { getStored, selectionHaptic, setStored, showBackButton } from '../lib/telegram';

  const SEEN_KEY = 'whats_new_seen';

  let dialog: HTMLDialogElement;
  // Latest id the user has opened; undefined until storage answers.
  let seen = $state<string | null | undefined>(undefined);
  const unseen = $derived(seen !== undefined && seen !== LATEST_ID);
  let hideBack = () => {};
  let downOnBackdrop = false;

  onMount(async () => {
    const stored = await getStored(SEEN_KEY);
    if (seen === undefined) seen = stored; // opening the sheet first wins
  });

  function show() {
    selectionHaptic();
    dialog.showModal();
    // Telegram's header back arrow closes the sheet, like a native screen.
    hideBack = showBackButton(close);
    if (seen !== LATEST_ID) setStored(SEEN_KEY, LATEST_ID);
    seen = LATEST_ID;
  }

  // CSS runs the slide-out ([data-closing]); close for real once it ends.
  async function close() {
    if (!dialog.open || 'closing' in dialog.dataset) return;
    dialog.dataset.closing = '';
    try {
      await Promise.allSettled(dialog.getAnimations({ subtree: true }).map((a) => a.finished));
    } finally {
      dialog.close();
      delete dialog.dataset.closing;
    }
  }

  function onClose() {
    hideBack();
    hideBack = () => {};
  }
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

<!-- The dialog fills the viewport; .sheet is the visible part, so "outside" is the dialog itself.
     Tracking pointerdown keeps a drag that starts in the sheet from closing it. -->
<dialog
  bind:this={dialog}
  aria-labelledby="whats-new-title"
  onclose={onClose}
  oncancel={(e) => {
    e.preventDefault();
    close();
  }}
  onpointerdown={(e) => (downOnBackdrop = e.target === dialog)}
  onclick={(e) => downOnBackdrop && e.target === dialog && close()}
>
  <div class="sheet">
    <div class="head">
      <h2 id="whats-new-title" class="section-title">What’s new</h2>
      <button type="button" class="close" onclick={close}>Done</button>
    </div>
    <ol>
      {#each CHANGELOG as entry (entry.id)}
        <li>
          <time datetime={entry.date}>{sgtDayMonth(entry.date)}</time>
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
    max-width: none;
    height: 100%;
    max-height: none;
    margin: 0;
    padding: 0;
    border: 0;
    background: none;
    color: var(--ink);
  }
  dialog[open] {
    display: flex;
    align-items: flex-end;
    justify-content: center;
  }
  dialog::backdrop {
    background: var(--scrim);
    animation: fade-in 320ms var(--ease-out);
  }
  .sheet {
    width: 100%;
    max-width: 720px;
    max-height: min(80dvh, 640px);
    overflow-y: auto;
    overscroll-behavior: contain;
    box-sizing: border-box;
    padding: 0 var(--gutter) calc(20px + var(--tg-safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)));
    border-radius: var(--radius) var(--radius) 0 0;
    background: var(--card);
    animation: sheet-up 320ms var(--ease-drawer);
  }
  /* Out a little faster than in. */
  dialog:global([data-closing]) .sheet {
    animation: sheet-down 200ms var(--ease-drawer) forwards;
  }
  dialog:global([data-closing])::backdrop {
    animation: fade-out 200ms var(--ease-drawer) forwards;
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
  }
  li + li {
    border-top: 1px solid var(--hairline);
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
  @keyframes sheet-down {
    to {
      transform: translateY(100%);
    }
  }
  @keyframes fade-in {
    from {
      opacity: 0;
    }
  }
  @keyframes fade-out {
    to {
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .trigger {
      transition: none;
    }
    .sheet {
      animation: fade-in 200ms ease;
    }
    dialog:global([data-closing]) .sheet {
      animation: fade-out 150ms ease forwards;
    }
  }
</style>
