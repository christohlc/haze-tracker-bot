<script lang="ts">
  // Placeholder until the dashboard is built (plan step 3).
  const tg = (window as any).Telegram?.WebApp;
  tg?.ready();
</script>

<main>
  <p class="emoji">🌫️</p>
  <h1>Dashboard coming soon</h1>
  <p>For now, send <code>/haze</code> in the chat for the latest PSI.</p>
  {#if tg}
    <button onclick={() => tg.close()}>Back to chat</button>
  {/if}
</main>

<style>
  main {
    display: grid;
    place-content: center;
    gap: 0.5rem;
    min-height: 100dvh;
    padding: 1rem;
    text-align: center;
  }
  .emoji { font-size: 3rem; margin: 0; }
  h1 { font-size: 1.25rem; margin: 0; }
  p { margin: 0; color: var(--hint); }
  button {
    margin-top: 1rem;
    justify-self: center;
    padding: 0.75rem 1.25rem;
    border: 0;
    border-radius: 12px;
    font: inherit;
    background: var(--tg-theme-button-color, #2481cc);
    color: var(--tg-theme-button-text-color, #fff);
  }
</style>
