<script lang="ts">
  import { selectionHaptic } from '../lib/telegram';

  // Brings back a purifier that was tucked away (or tucks it away from here).
  let { shown, onchange }: { shown: boolean; onchange: (shown: boolean) => void } = $props();
</script>

<section class="card" aria-labelledby="pet-title">
  <label class="row">
    <span>
      <h2 id="pet-title" class="section-title">Purifier pet</h2>
      <span class="note">A little air purifier that wanders the dashboard. Drag it anywhere, or tap it for a pat.</span>
    </span>
    <input
      type="checkbox"
      role="switch"
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
