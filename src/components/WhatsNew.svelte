<script lang="ts">
  import { CHANGELOG, type ChangelogEntry } from '../lib/changelog';
  import { sgtDayMonth } from '../lib/format';

  // How many of the newest entries arrived since the user last looked.
  let { fresh = 0 }: { fresh?: number } = $props();

  const SHOWN = 3;
  const latest = CHANGELOG.slice(0, SHOWN);
  const earlier = CHANGELOG.slice(SHOWN);
</script>

{#snippet entry(e: ChangelogEntry, isNew: boolean)}
  <li>
    <p class="meta">
      <time datetime={e.date}>{sgtDayMonth(e.date)}</time>
      {#if isNew}<span class="new">New</span>{/if}
    </p>
    <h3>{e.title}</h3>
    <p class="body">{e.body}</p>
  </li>
{/snippet}

<section class="card" aria-labelledby="whats-new-title">
  <h2 id="whats-new-title" class="section-title">What’s new</h2>
  <ol>
    {#each latest as e, i (e.id)}{@render entry(e, i < fresh)}{/each}
  </ol>
  {#if earlier.length}
    <details>
      <summary>Earlier updates</summary>
      <ol>
        {#each earlier as e, i (e.id)}{@render entry(e, i + SHOWN < fresh)}{/each}
      </ol>
    </details>
  {/if}
</section>

<style>
  ol {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  li {
    padding: 12px 0;
  }
  li + li,
  details ol li:first-child {
    border-top: 1px solid var(--hairline);
  }
  summary {
    display: flex;
    align-items: center;
    min-height: 44px;
    color: var(--link);
    font-size: 0.875rem;
    cursor: pointer;
  }
  .meta {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    font-size: 0.8125rem;
    color: var(--muted);
  }
  .new {
    padding: 1px 7px;
    border-radius: 999px;
    background: var(--accent);
    color: var(--accent-ink);
    font-size: 0.75rem;
    font-weight: 600;
  }
  h3 {
    margin: 2px 0 4px;
    font-family: var(--font-display);
    font-size: 1rem;
    font-weight: 700;
  }
  .body {
    margin: 0;
    font-size: 0.9375rem;
    color: var(--ink-2);
  }
</style>
