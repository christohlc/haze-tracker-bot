<script lang="ts">
  import { PUBLISHERS } from '../../tgcloud/lib/news-parse.js';
  import type { NewsItem } from '../lib/api';
  import { timeAgo } from '../lib/format';
  import { openLink } from '../lib/telegram';

  let { news, serverTime }: { news: NewsItem[]; serverTime: number } = $props();

  const SHOWN = 8;
  const names = Object.values(PUBLISHERS).map((p) => p.name);
  const credit = `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;

  function open(e: MouseEvent, link: string) {
    if (openLink(link)) e.preventDefault();
  }
</script>

<section class="card" aria-labelledby="news-title">
  <h2 id="news-title" class="section-title">Haze in the news</h2>
  <p class="note">From {credit}, checked hourly. Tap to read.</p>
  {#if !news.length}
    <p class="note empty">No haze stories in the past two weeks.</p>
  {:else}
    <ul>
      {#each news.slice(0, SHOWN) as item (item.link)}
        <li>
          <a href={item.link} target="_blank" rel="noopener noreferrer" onclick={(e) => open(e, item.link)}>
            <span class="headline">{item.title}</span>
            <span class="note meta">{PUBLISHERS[item.source].name} · {timeAgo(item.publishedAt, serverTime)}</span>
          </a>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  ul {
    margin: 8px 0 0;
    padding: 0;
    list-style: none;
  }
  li + li {
    border-top: 1px solid var(--hairline);
  }
  a {
    display: grid;
    gap: 2px;
    min-height: 44px;
    /* Bleeds into the card padding so the press tint has room; dividers stay aligned with the text. */
    margin: 0 -8px;
    padding: 10px 8px;
    border-radius: 10px;
    color: inherit;
    text-decoration: none;
    touch-action: manipulation;
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
    transition: background-color 100ms var(--ease-out);
  }
  a:active {
    background: color-mix(in srgb, var(--ink) 6%, transparent);
  }
  @media (hover: hover) and (pointer: fine) {
    a:hover {
      background: color-mix(in srgb, var(--ink) 4%, transparent);
    }
  }
  a:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
  .headline {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    overflow: hidden;
    font-weight: 600;
    color: var(--ink);
    overflow-wrap: anywhere;
  }
  .empty {
    margin-top: 12px;
  }
</style>
