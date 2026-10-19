<script lang="ts">
  import { selectionHaptic } from '../lib/telegram';

  // Brings back a purifier that was tucked away (or tucks it away from here).
  let { shown, onchange }: { shown: boolean; onchange: (shown: boolean) => void } = $props();
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
</style>
