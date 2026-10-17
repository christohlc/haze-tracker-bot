// @ts-check
// The tick's own health report: a heartbeat, and a DM to the operator (setting ops_chat_id, set with
// admin) when a feed keeps failing, then one when it works again. Which feeds: ops-rules.js.
// Also the summary card, uploaded to the same chat once per snapshot for inline mode.

import { api } from 'sdk';
import { describeError } from './bot-errors.js';
import { cachedCardId, sendCard } from './card/send.js';
import { formatShareCaption } from './format.js';
import { errorText } from './http.js';
import { cardUploadDue, failingSources, isOnDemand, opsMessage, OPS_REPEAT_S, recoveredSources } from './ops-rules.js';
import { allSourceStatus, getSetting, getState, setState } from './store.js';

/**
 * Called at the end of every tick. Never throws. The result goes into the tick's output, which the
 * public Actions log shows, so it names sources but never the chat. Ticks run one at a time
 * (tick.yml's concurrency group), so state('ops_notified') needs no claim, and is written only once
 * the DM went: a send that fails (wrong chat, bot blocked) is retried by the next tick.
 * @param {number} started ms
 */
export async function reportOps(started) {
  try {
    const [, chatId, statuses, toldRow] = await Promise.all([
      setState('tick_heartbeat', { at: started }),
      getSetting('ops_chat_id'),
      allSourceStatus(),
      getState('ops_notified'),
    ]);
    const now = Math.floor(started / 1000);
    const failing = failingSources(statuses, now);
    const names = failing.map((s) => s.source);
    if (!chatId) return { failing: names, dm: 'no ops_chat_id' };
    /** @type {Record<string, number>} source → when it was last DM'd as failing (unix s), until it works again or stops reporting */
    const told = Object.fromEntries(
      Object.entries(toldRow?.value ?? {}).filter(([source]) => statuses.some((s) => s.source === source)),
    );
    const recovered = recoveredSources(statuses, Object.keys(told));
    // Again every 6 hours while it keeps failing; an on-demand feed's failure is news only once.
    const toTell = failing.filter(
      (s) => !(s.source in told) || (!isOnDemand(s.source) && now - told[s.source] >= OPS_REPEAT_S),
    );
    if (!toTell.length && !recovered.length) return { failing: names, dm: 'none' };
    await api.sendMessage({ chat_id: chatId, text: opsMessage(toTell, recovered) });
    for (const source of recovered) delete told[source];
    for (const s of toTell) told[s.source] = now;
    await setState('ops_notified', told);
    return { failing: names, dm: 'sent' };
  } catch (e) {
    return { error: errorText(e) };
  }
}

/**
 * Upload this snapshot's summary card to the ops chat, silently, then delete the message, unless
 * someone was sent it already:
 * inline mode can't upload, so on a quiet hour it would have no picture to offer. Once per snapshot,
 * since card/send caches the file id. Never throws; the result names no chat (public logs).
 * @param {any} snap @param {number} started ms
 */
export async function uploadCard(snap, started) {
  try {
    const [chatId, fileId] = await Promise.all([getSetting('ops_chat_id'), cachedCardId(snap)]);
    const due = cardUploadDue({ chatId, cached: Boolean(fileId), elapsedMs: Date.now() - started });
    if (due !== 'upload') return due;
    const msg = await sendCard({ chat_id: chatId, disable_notification: true }, snap, formatShareCaption(snap));
    // The file id outlives the message: deleted, so a photo an hour doesn't bury the failure DMs.
    await api.deleteMessage({ chat_id: chatId, message_id: msg.message_id }).catch(() => {});
    return 'sent';
  } catch (e) {
    return `failed: ${describeError(e)}`; // code and description only: never the chat (public logs)
  }
}
