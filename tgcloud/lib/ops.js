// @ts-check
// The tick's own health report: a heartbeat, and a DM to the operator (setting ops_chat_id, set with
// admin) when a feed keeps failing, then one when it works again. Which feeds: ops-rules.js.

import { api } from 'sdk';
import { errorText } from './http.js';
import { failingSources, isOnDemand, opsMessage, OPS_REPEAT_S, recoveredSources } from './ops-rules.js';
import { allSourceStatus, claimEvery, getSetting, getState, getStates, setState } from './store.js';

/**
 * Called at the end of every tick. Never throws. The result goes into the tick's output, which the
 * public Actions log shows, so it names sources but never the chat. Ticks run one at a time
 * (tick.yml's concurrency group), so the 6-hour claims are checked first and taken only once the
 * DM went: a send that fails (wrong chat, bot blocked) is retried by the next tick.
 * @param {number} started ms
 */
export async function reportOps(started) {
  try {
    await setState('tick_heartbeat', { at: started });
    const [chatId, statuses, notifiedRow] = await Promise.all([
      getSetting('ops_chat_id'),
      allSourceStatus(),
      getState('ops_notified'),
    ]);
    const now = Math.floor(started / 1000);
    const failing = failingSources(statuses, now);
    const names = failing.map((s) => s.source);
    if (!chatId) return { failing: names, dm: 'no ops_chat_id' };
    /** @type {string[]} sources DM'd as failing and not yet as working again (and still reporting) */
    const notified = (notifiedRow?.value ?? []).filter((/** @type {string} */ x) => statuses.some((s) => s.source === x));
    const recovered = recoveredSources(statuses, notified);
    const claims = await getStates(failing.map((s) => `ops:${s.source}`));
    const toTell = failing.filter((s) => {
      if (isOnDemand(s.source) && notified.includes(s.source)) return false;
      const claimed = claims.get(`ops:${s.source}`)?.updatedAt ?? 0;
      return now - claimed >= OPS_REPEAT_S;
    });
    if (!toTell.length && !recovered.length) return { failing: names, dm: 'none' };
    await api.sendMessage({ chat_id: chatId, text: opsMessage(toTell, recovered) });
    await Promise.all(toTell.map((s) => claimEvery(`ops:${s.source}`, 0)));
    const still = notified.filter((x) => !recovered.includes(x));
    await setState('ops_notified', [...new Set([...still, ...toTell.map((s) => s.source)])]);
    return { failing: names, dm: 'sent' };
  } catch (e) {
    return { error: errorText(e) };
  }
}
