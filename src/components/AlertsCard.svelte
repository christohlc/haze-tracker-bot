<script lang="ts">
  import { onMount } from 'svelte';
  import { DAILY_HOURS, getAlerts, saveAlerts, type AlertSettings } from '../lib/alerts';
  import { inTelegram, notifyHaptic, selectionHaptic, setMainButtonBusy, showMainButton } from '../lib/telegram';

  let settings = $state<AlertSettings | null>(null);
  let loaded = $state(false);
  let busy = $state(false);
  let error = $state<string | null>(null);

  const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'am' : 'pm'}`;

  onMount(async () => {
    try {
      settings = await getAlerts();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Couldn’t load your alerts.';
    }
    loaded = true;
  });

  async function save(next: AlertSettings) {
    if (busy) return;
    busy = true;
    error = null;
    setMainButtonBusy(true);
    try {
      settings = await saveAlerts(next);
      notifyHaptic('success');
    } catch (e) {
      error = e instanceof Error ? e.message : 'Couldn’t save your alerts.';
      notifyHaptic('error');
    } finally {
      busy = false;
      setMainButtonBusy(false);
    }
  }

  const turnOn = () => save({ bandAlerts: true, dailyHour: null });

  // Alerts off: the Telegram MainButton is the call to action.
  $effect(() => {
    if (!loaded || settings) return;
    return showMainButton('🔔 Get haze alerts', turnOn);
  });

  function pickDaily(h: number | null) {
    if (!settings || settings.dailyHour === h) return;
    selectionHaptic();
    save({ ...settings, dailyHour: h });
  }
</script>

<section class="card alerts" aria-labelledby="alerts-title" aria-busy={busy}>
  <div class="head">
    <span class="bell" class:on={settings} aria-hidden="true">
      <svg viewBox="0 0 24 24" width="20" height="20">
        <path
          d="M12 3a6 6 0 0 0-6 6v3.6L4.4 15.4A1 1 0 0 0 5.3 17h13.4a1 1 0 0 0 .9-1.6L18 12.6V9a6 6 0 0 0-6-6Zm-2.5 15.5a2.5 2.5 0 0 0 5 0"
          fill="currentColor"
        />
      </svg>
    </span>
    <div>
      <h2 id="alerts-title" class="section-title">
        {#if !loaded}Haze alerts{:else if settings}Alerts are on{:else}Know before you go out{/if}
      </h2>
      <p class="note">
        {#if !loaded}Checking your alerts…
        {:else if settings}Messages arrive in this chat. You can also change them with /alerts.
        {:else}Get a message in this chat when the haze band changes, plus an optional daily update.{/if}
      </p>
    </div>
  </div>

  {#if loaded && !settings && !inTelegram}
    <button type="button" class="primary" onclick={turnOn} disabled={busy}>
      {busy ? 'Turning on…' : '🔔 Get haze alerts'}
    </button>
  {/if}

  {#if settings}
    <div class="rows">
      <label class="row">
        <span>
          <span class="row-title">Band changes</span>
          <span class="note">When the 3-hour PSI moves into another band</span>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={settings.bandAlerts}
          disabled={busy}
          onchange={(e) => save({ ...settings!, bandAlerts: e.currentTarget.checked })}
        />
      </label>

      <div class="row daily">
        <span class="row-title" id="daily-label">Daily update (SGT)</span>
        <div class="chips" role="radiogroup" aria-labelledby="daily-label">
          {#each [...DAILY_HOURS, null] as h (h)}
            <button
              type="button"
              role="radio"
              aria-checked={settings.dailyHour === h}
              class:on={settings.dailyHour === h}
              disabled={busy}
              onclick={() => pickDaily(h)}
            >
              {h == null ? 'Off' : hourLabel(h)}
            </button>
          {/each}
        </div>
      </div>
    </div>

    <button type="button" class="stop" disabled={busy} onclick={() => save({ bandAlerts: false, dailyHour: null })}>
      Stop all alerts
    </button>
  {/if}

  {#if error}<p class="error" role="alert">{error}</p>{/if}
</section>

<style>
  .alerts {
    display: grid;
    gap: 12px;
  }
  .head {
    display: flex;
    gap: 12px;
    align-items: flex-start;
  }
  .head .section-title {
    margin-bottom: 2px;
  }
  .bell {
    flex: none;
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--brand-haze) 28%, transparent);
    color: var(--brand-shell);
  }
  .bell.on {
    background: var(--brand-shell);
    color: var(--card);
  }
  button {
    font: inherit;
    cursor: pointer;
    transition: transform 120ms var(--ease-out);
  }
  button:active:not(:disabled) {
    transform: scale(0.97);
  }
  button:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .primary {
    min-height: 48px;
    border: 0;
    border-radius: 12px;
    background: var(--accent);
    color: var(--accent-ink);
    font-weight: 650;
  }
  .rows {
    display: grid;
  }
  .row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    min-height: 44px;
    padding: 8px 0;
    border-top: 1px solid var(--hairline);
  }
  .row > span {
    display: grid;
  }
  .row-title {
    font-weight: 600;
  }
  .daily {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }
  input[type='checkbox'] {
    flex: none;
    width: 44px;
    height: 26px;
    margin: 0;
    accent-color: var(--accent);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chips button {
    min-height: 44px;
    min-width: 56px;
    padding: 0 12px;
    border: 1px solid var(--hairline);
    border-radius: 999px;
    background: none;
    color: var(--ink-2);
    font-size: 0.875rem;
    font-weight: 550;
  }
  .chips button.on {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--accent-ink);
  }
  .stop {
    justify-self: start;
    min-height: 44px;
    padding: 0;
    border: 0;
    background: none;
    color: var(--status-critical);
    font-size: 0.875rem;
    font-weight: 600;
  }
  .error {
    margin: 0;
    font-size: 0.875rem;
    color: var(--status-critical);
  }
  @media (prefers-reduced-motion: reduce) {
    button {
      transition: none;
    }
  }
</style>
