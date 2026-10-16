<script lang="ts">
  // Dev-only: switch the dashboard between demo and stress-test datasets via ?demo=.
  const states = ['demo', 'worst', 'empty', 'error', 'loading'];
  const current = new URLSearchParams(location.search).get('demo') ?? 'demo';
  function go(s: string) {
    const url = new URL(location.href);
    if (s === 'demo') url.searchParams.delete('demo');
    else url.searchParams.set('demo', s);
    location.href = url.toString();
  }
</script>

<div class="dev">
  {#each states as s (s)}
    <button type="button" class:on={s === current} onclick={() => go(s)}>{s}</button>
  {/each}
</div>

<style>
  .dev {
    position: fixed;
    bottom: 12px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 2px;
    padding: 3px;
    border-radius: 999px;
    background: #d4d4d4;
    font: 12px system-ui, sans-serif;
    z-index: 100;
  }
  button {
    border: 0;
    border-radius: 999px;
    padding: 4px 10px;
    background: none;
    color: #333;
    font: inherit;
  }
  .on {
    background: #fff;
  }
</style>
