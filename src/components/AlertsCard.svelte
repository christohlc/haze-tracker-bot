<script lang="ts" module>
  import { getAlerts } from '../lib/alerts';

  // Start on import so it runs alongside the dashboard load instead of after it.
  const initial = getAlerts();
  initial.catch(() => {}); // handled in onMount
</script>

<script lang="ts">
  import { onMount } from 'svelte';
  import { areaLabel, DAILY_HOURS, hourLabel, isActive, LEVEL_CHOICES, levelLabel } from '../../tgcloud/lib/alert-settings.js';
  import type { Group } from '../../tgcloud/lib/advice.js';
  import type { RegionId } from '../lib/api';
  import { saveAlerts, type AlertSettings } from '../lib/alerts';
  import { area, areaFromAlerts, onAreaPicked, pickedHere, revertArea } from '../lib/area.svelte';
  import { confirmAction, inTelegram, notifyHaptic, setMainButtonBusy, showMainButton } from '../lib/telegram';

  // The advice group picked in the Advice card: vulnerable people get a nudge towards every band.
  let { group = 'general' }: { group?: Group } = $props();

  let settings = $state<AlertSettings | null>(null);
  let status = $state<'loading' | 'failed' | 'ready'>('loading');
  let busy = $state(false);
  let error = $state<string | null>(null);

  onMount(() => {
    // Band alerts follow the area picked at the top.
    const stop = onAreaPicked(saveRegion);
    initial.then(
      (loaded) => {
        settings = loaded;
        status = 'ready';
        // Picked before the settings arrived: save it. Otherwise the app follows the alerts'
        // region (it may have been set with /alerts).
        if (loaded && pickedHere()) saveRegion(area.id);
        else if (loaded) areaFromAlerts(loaded.region);
      },
      (e) => {
        error = e instanceof Error ? e.message : 'Couldn’t load your alerts.';
        status = 'failed';
      },
    );
    return stop;
  });

  $effect(() => setMainButtonBusy(busy));

  // A change shows straight away (all off switches the card to its off state) and is undone if
  // the save fails. While it saves the controls are locked but not dimmed.
  // Resolves true once saved.
  async function save(next: AlertSettings) {
    if (busy) return false;
    busy = true;
    error = null;
    const prev = settings;
    settings = isActive(next) ? next : null;
    try {
      settings = await saveAlerts(next);
      notifyHaptic('success');
      return true;
    } catch (e) {
      settings = prev;
      error = e instanceof Error ? e.message : 'Couldn’t save your alerts.';
      notifyHaptic('error');
      return false;
    } finally {
      busy = false;
      if (queuedRegion !== undefined) {
        const id = queuedRegion;
        queuedRegion = undefined;
        saveRegion(id);
      }
    }
  }

  // An area picked while another save runs waits for it, so it isn't dropped. If the save fails,
  // the area goes back to the one the alerts still follow.
  let queuedRegion: RegionId | null | undefined;
  async function saveRegion(id: RegionId | null) {
    if (!settings || settings.region === id) return;
    if (busy) return void (queuedRegion = id);
    const was = settings.region;
    if (!(await save({ ...settings, region: id })) && area.id === id) revertArea(was);
  }

  const turnOn = () => save({ bandAlerts: true, dailyHour: null, breakingAlerts: true, region: area.id, minBand: null, quietNights: false });

  // Alerts off: the Telegram MainButton is the call to action. Not after a failed load: we
  // don't know the current settings, and turning on would reset an existing daily update.
  $effect(() => {
    if (status !== 'ready' || settings) return;
    return showMainButton('🔔 Get haze alerts', turnOn);
  });

  // The success buzz after saving is the haptic; no extra selection tick.
  function pickDaily(h: number | null) {
    if (!settings || settings.dailyHour === h) return;
    save({ ...settings, dailyHour: h });
  }

  function pickLevel(l: AlertSettings['minBand']) {
    if (!settings || settings.minBand === l) return;
    save({ ...settings, minBand: l });
  }

  let confirming = false;
  async function stopAll() {
    if (busy || confirming) return;
    confirming = true;
    const ok = await confirmAction('Stop all haze alerts? You can turn them on again any time.');
    confirming = false;
    if (ok) save({ bandAlerts: false, dailyHour: null, breakingAlerts: false, region: null, minBand: null, quietNights: false });
  }
</script>

{#snippet toggle(key: 'bandAlerts' | 'breakingAlerts' | 'quietNights', title: string, note: string)}
  <label class="row">
    <span>
      <span class="row-title">{title}</span>
      <span class="note">{note}</span>
    </span>
    <input
      type="checkbox"
      role="switch"
      checked={settings![key]}
      onchange={(e) => save({ ...settings!, [key]: e.currentTarget.checked })}
    />
  </label>
{/snippet}

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
        {#if status === 'loading'}Haze alerts{:else if settings}Alerts are on{:else}Know before you go out{/if}
      </h2>
      <p class="note">
        {#if status === 'loading'}Checking your alerts…
        {:else if settings}Messages arrive in this chat. You can also change them with /alerts.
        {:else}Get a message in this chat when the haze band changes or there’s breaking haze news, plus an optional daily update.{/if}
      </p>
    </div>
  </div>

  {#if import.meta.env.DEV && !inTelegram && status === 'ready' && !settings}
    <button type="button" class="primary" onclick={turnOn} disabled={busy}>
      {busy ? 'Turning on…' : '🔔 Get haze alerts'}
    </button>
  {/if}

  {#if settings}
    <!-- One guard for the whole list: while a save is in flight, taps don't change anything. -->
    <div class="rows" onclickcapture={(e) => busy && e.preventDefault()}>
      {@render toggle('bandAlerts', 'Band changes', `When the 3-hour PSI in ${areaLabel(settings.region)} moves into another band. Follows the area at the top.`)}
      {#if settings.bandAlerts}
        <div class="row stacked level">
          <span class="row-title" id="level-label">Alert me from</span>
          <div class="chips" role="radiogroup" aria-labelledby="level-label" aria-describedby="level-note">
            {#each LEVEL_CHOICES as l (l)}
              <button
                type="button"
                role="radio"
                aria-checked={settings.minBand === l}
                class:on={settings.minBand === l}
                onclick={() => pickLevel(l as AlertSettings['minBand'])}
              >
                {levelLabel(l)}
              </button>
            {/each}
          </div>
          <span class="note" id="level-note">
            {#if settings.minBand}Changes below {levelLabel(settings.minBand)} are skipped. You’ll still hear when it drops back below.
            {:else}Every band change, from Good up.{/if}
            {#if group === 'vulnerable' && settings.minBand}<strong class="hint">For vulnerable people, Any band is safer.</strong>{/if}
          </span>
        </div>
      {/if}
      {@render toggle('breakingAlerts', 'Breaking news', 'School closures, events called off, official 24-hour PSI over 200')}

      <div class="row stacked">
        <span class="row-title" id="daily-label">Daily update (SGT)</span>
        <div class="chips" role="radiogroup" aria-labelledby="daily-label">
          {#each [...DAILY_HOURS, null] as h (h)}
            <button
              type="button"
              role="radio"
              aria-checked={settings.dailyHour === h}
              class:on={settings.dailyHour === h}
              onclick={() => pickDaily(h)}
            >
              {h == null ? 'Off' : hourLabel(h)}
            </button>
          {/each}
        </div>
      </div>
      {@render toggle('quietNights', 'Quiet at night', '11 pm–7 am SGT: alerts arrive without sound')}
    </div>

    <button type="button" class="stop" onclick={stopAll}>
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
  /* The whole switch row is the control: no long-press text selection, no tap delay. */
  label.row {
    cursor: pointer;
    touch-action: manipulation;
    user-select: none;
    -webkit-user-select: none;
  }
  .row-title {
    font-weight: 600;
  }
  .stacked {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }
  /* Under a switch it qualifies: no rule between them. */
  .level {
    border-top: 0;
    padding-top: 0;
  }
  .level .row-title {
    color: var(--ink-2);
    font-size: 0.875rem;
  }
  /* Labels of very different lengths: each chip takes its label's width, and large text wraps
     inside the chip instead of spilling out of it. */
  .level .chips {
    display: flex;
  }
  .level .chips button {
    flex: 1 1 auto;
    padding: 4px 8px;
    white-space: normal;
    line-height: 1.15;
  }
  .hint {
    display: block;
    margin-top: 2px;
    color: var(--ink);
    font-weight: 600;
  }
  /* A drawn switch: a plain checkbox here reads as a tick box, not on/off. */
  input[type='checkbox'] {
    flex: none;
    position: relative;
    width: 46px;
    height: 28px;
    margin: 0;
    border-radius: 999px;
    background: var(--control);
    box-shadow: inset 0 0 0 1px var(--hairline);
    appearance: none;
    -webkit-appearance: none;
    cursor: pointer;
    transition: background-color 200ms var(--ease-in-out);
  }
  input[type='checkbox']::before {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: var(--switch-thumb);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
    transition: transform 200ms var(--ease-in-out);
  }
  input[type='checkbox']:checked {
    background: var(--accent);
    box-shadow: none;
  }
  input[type='checkbox']:checked::before {
    transform: translateX(18px);
  }
  input[type='checkbox']:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  /* One even row, so “Off” is never left alone on a second line. */
  .chips {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: minmax(0, 1fr);
    gap: 6px;
  }
  .chips button {
    min-height: 44px;
    padding: 0 4px;
    white-space: nowrap;
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
  @media (prefers-reduced-motion: reduce) {
    button,
    input[type='checkbox'],
    input[type='checkbox']::before {
      transition: none;
    }
  }
</style>
