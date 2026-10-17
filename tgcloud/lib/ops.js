// @ts-check
// The tick's own health report: a heartbeat, and a DM to the operator (setting ops_chat_id, set with
// admin) when a feed keeps failing, then one when it works again. Which feeds: ops-rules.js.

import { api } from 'sdk';
import { errorText } from './http.js';
import { failingSources, opsMessage, OPS_REPEAT_S, recoveredSources } from './ops-rules.js';
import { allSourceStatus, claimEvery, getSetting, getState, setState } from './store.js';

/**
 * Called at the end of every tick. Never throws. The result goes into the tick's output, which the
 * public Actions log shows, so it names sources but never the chat.
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
    const failing = failingSources(statuses, Math.floor(started / 1000));
    if (!chatId) return { failing: failing.map((s) => s.source), dm: 'no ops_chat_id' };
    /** @type {string[]} sources DM'd as failing and not yet as working again */
    const notified = notifiedRow?.value ?? [];
    const recovered = recoveredSources(statuses, notified);
    const toTell = [];
    for (const s of failing) if (await claimEvery(`ops:${s.source}`, OPS_REPEAT_S)) toTell.push(s);
    if (!toTell.length && !recovered.length) return { failing: failing.map((s) => s.source), dm: 'none' };
    await api.sendMessage({ chat_id: chatId, text: opsMessage(toTell, recovered) });
    const still = notified.filter((x) => !recovered.includes(x));
    await setState('ops_notified', [...new Set([...still, ...toTell.map((s) => s.source)])]);
    return { failing: failing.map((s) => s.source), dm: 'sent' };
  } catch (e) {
    return { error: errorText(e) };
  }
}
