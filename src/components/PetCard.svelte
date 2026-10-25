<script lang="ts">
  import { NAME_MAX, cleanName } from '../lib/pet-physics';
  import { selectionHaptic } from '../lib/telegram';

  // Brings back a purifier that was tucked away (or tucks it away from here), and names it.
  let {
    shown,
    onchange,
    name,
    onname,
  }: { shown: boolean; onchange: (shown: boolean) => void; name: string; onname: (name: string) => void } = $props();
</script>

<section class="card" aria-labelledby="pet-title">
  <label class="row">
    <span>
      <!-- A heading can't sit in a label, so this is one by role; the switch is named by it alone. -->
      <span id="pet-title" class="section-title" role="heading" aria-level="2">Purifier pet</span>
      <span id="pet-note" class="note">A little air purifier that wanders the dashboard. Drag it anywhere, or tap it for a pat.</span>
    </span>
    <input
      type="checkbox"
      role="switch"
      aria-labelledby="pet-title"
      aria-describedby="pet-note"
      checked={shown}
      onchange={(e) => {
        selectionHaptic();
        onchange(e.currentTarget.checked);
      }}
    />
  </label>
  <!-- Saved when you're done typing (CloudStorage is a network call), not on every key. -->
  <label class="name">
    <span class="row-title">Name</span>
    <input
      type="text"
      value={name}
      maxlength={NAME_MAX}
      placeholder="Optional"
      autocapitalize="words"
      autocomplete="off"
      autocorrect="off"
      spellcheck="false"
      enterkeyhint="done"
      onchange={(e) => {
        const v = cleanName(e.currentTarget.value);
        e.currentTarget.value = v;
        if (v !== name) onname(v);
      }}
      onkeydown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  </label>
</section>

<style>
  /* The whole row is the control: no long-press text selection, no tap delay. */
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    cursor: pointer;
    touch-action: manipulation;
    user-select: none;
    -webkit-user-select: none;
  }
  .row > span {
    display: grid;
  }
  .name {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid var(--hairline);
  }
  .row-title {
    font-weight: 600;
  }
  .name input {
    flex: 1;
    min-width: 0;
    min-height: 44px;
    padding: 0 12px;
    border: 1px solid var(--hairline);
    border-radius: 12px;
    background: var(--page);
    color: var(--ink);
    font: inherit;
    font-size: 16px; /* under 16px, iOS zooms in on focus */
  }
  .name input::placeholder {
    color: var(--muted);
  }
</style>
