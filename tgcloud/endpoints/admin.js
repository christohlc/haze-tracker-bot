// @ts-check
// endpoints/admin.js — operator tools, reachable only through the CLI:
//   read -rs KEY && npx tgcloud run endpoints/admin "{ action: 'set', key: 'datagov_api_key', value: '$KEY' }" 2>&1 | grep -Ev "value: ?'"
//     (the CLI and npm print a command's input, key and all: the grep drops those lines; paste the key, Enter)
//   npx tgcloud run endpoints/admin "{ action: 'status' }"
//   npx tgcloud run endpoints/admin "{ action: 'unset', key: 'firms_map_key' }"
//   npx tgcloud run endpoints/admin "{ action: 'rewind_band', band: 'unhealthy' }"  (test: next tick alerts the change)
//   npx tgcloud run endpoints/admin "{ action: 'commands' }"  (the command menus; in groups most are ephemeral, chat-rules.js COMMANDS)
//   npx tgcloud run endpoints/admin "{ action: 'backfill', days: 14 }"  (NEA's hourly PM2.5 for past days; rerun a minute later until remaining is empty)
// Breaking news is sent without anyone checking it first, so:
//   npx tgcloud run endpoints/admin "{ action: 'breaking_pause', on: true }"   (no new events, nothing sent; false resumes)
//   npx tgcloud run endpoints/admin "{ action: 'breaking_cancel', id: 'n1a2b3c' }"  (stop sending one event; ids in status)
//   npx tgcloud run endpoints/admin "{ action: 'breaking_test', chatId: 123 }"  (send the latest event, or a sample, to one chat)

import { api, EndpointError } from 'sdk';
import { cancelEvent, getBreaking, isBreakingPaused, sendBreaking } from '../lib/breaking.js';
import { COMMANDS } from '../lib/chat-rules.js';
import { requireCli } from '../lib/cli-only.js';
import { errorText } from '../lib/http.js';
import { getPm25Day } from '../lib/nea.js';
import { PSI_BANDS } from '../lib/psi.js';
import { getSnapshot, saveRange, storedSnapshot } from '../lib/refresh.js';
import { ALERT_SCOPES } from '../lib/alert-rules.js';
import { breakingClaimedChats, countSubscribers, setAllLastBand } from '../lib/subscriptions.js';
import { sgtDatesBack, sgtDayStart } from '../lib/time.js';
import { allSourceStatus, countReadings, countReadingsBetween, deleteSetting, getAlertBands, getSetting, getState, setAlertBands, setSetting, setState, toSgtIso, upsertReadings } from '../lib/store.js';

// datagov_api_key: data.gov.sg's (free, data.gov.sg sign-in), sent only to its v2 API for a higher rate limit.
const SECRET_KEYS = ['firms_map_key', 'datagov_api_key'];

// Backfill: one NEA request per SGT day, spaced out for data.gov.sg's rate limit, and stopped
// before the (undocumented) run limit; days already complete are skipped, so a rerun resumes.
// The runtime may have no setTimeout (the tick's `alerts.paced`); then Atomics.wait blocks for the
// pause without spinning, and if that's missing too, a run fetches at most BACKFILL_UNPACED_MAX days
// back to back (16 Oct 2026: the 7th request in 4 s got a 429).
const BACKFILL_PAUSE_MS = 1000;
const BACKFILL_BUDGET_MS = 20_000;
const BACKFILL_UNPACED_MAX = 5;
const { sleep, paced } = pauser();

/** @returns {{ sleep: ((ms: number) => Promise<void>) | null, paced: 'timers' | 'atomics' | false }} */
function pauser() {
  if (typeof setTimeout === 'function') return { sleep: (ms) => new Promise((r) => setTimeout(r, ms)), paced: 'timers' };
  try {
    const cell = new Int32Array(new SharedArrayBuffer(4));
    Atomics.wait(cell, 0, 0, 0); // throws where blocking isn't allowed
    return { sleep: async (ms) => void Atomics.wait(cell, 0, 0, ms), paced: 'atomics' };
  } catch {
    return { sleep: null, paced: false };
  }
}

/** @param {number} days before today; today is refetched too */
async function backfill(days) {
  let deadline = Date.now() + BACKFILL_BUDGET_MS;
  const today = sgtDatesBack(1)[0];
  /** @type {Record<string, number | string>} */
  const done = {};
  const remaining = [];
  let fetched = 0;
  // Newest first: the range needs the latest 72 hours most.
  for (const date of sgtDatesBack(days + 1)) {
    if (date !== today && (await countReadingsBetween(sgtDayStart(date), sgtDayStart(date) + 86_400)) >= 24) {
      done[date] = 'complete';
      continue;
    }
    if (Date.now() + (fetched ? BACKFILL_PAUSE_MS : 0) >= deadline || (!sleep && fetched >= BACKFILL_UNPACED_MAX)) {
      remaining.push(date);
      continue;
    }
    if (fetched++ && sleep) await sleep(BACKFILL_PAUSE_MS);
    try {
      const items = await getPm25Day(date, deadline);
      await upsertReadings(items);
      done[date] = items.length;
    } catch (e) {
      // e.g. data.gov.sg's rate limit (code 24): stop here, a rerun picks up the rest.
      done[date] = errorText(e);
      remaining.push(date);
      deadline = 0;
    }
  }
  if (fetched) await saveRange(); // the stored range is worked out from these readings
  return { ok: true, paced, days: done, remaining, readings: await countReadings() };
}

export default async function (input, ctx) {
  requireCli(ctx);
  switch (input.action) {
    case 'set': {
      if (!SECRET_KEYS.includes(input.key)) throw new EndpointError(`Unknown key; allowed: ${SECRET_KEYS.join(', ')}`);
      if (typeof input.value !== 'string' || input.value.trim().length < 8) throw new EndpointError('value looks wrong');
      await setSetting(input.key, input.value.trim());
      return { ok: true, key: input.key };
    }
    case 'unset': {
      if (!SECRET_KEYS.includes(input.key)) throw new EndpointError(`Unknown key; allowed: ${SECRET_KEYS.join(', ')}`);
      await deleteSetting(input.key);
      return { ok: true, key: input.key };
    }
    case 'status': {
      const status = {};
      // Never echo secrets back; just whether they are set.
      for (const k of SECRET_KEYS) status[k] = (await getSetting(k)) ? 'set' : 'missing';
      const snap = await storedSnapshot();
      status.snapshot = snap ? { asOf: snap.asOf, psi3h: snap.worst.psi3h } : 'none';
      status.readings = await countReadings();
      status.subscribers = await countSubscribers();
      status.alertBands = await getAlertBands();
      const breaking = await getBreaking();
      status.breaking = {
        paused: await isBreakingPaused(),
        psiBand: breaking.psiBand,
        events: await Promise.all(
          breaking.events.map(async (e) => ({
            id: e.id,
            at: toSgtIso(Math.floor(e.at / 1000)),
            what: e.kind === 'news' ? `${e.topic}: ${e.title}` : `official 24h PSI ${e.band} (${e.value})`,
            cancelled: Boolean(e.cancelled),
            sent: (await breakingClaimedChats(e.id)).size,
          })),
        ),
      };
      status.sources = (await allSourceStatus()).map((s) => ({
        source: s.source,
        lastOk: s.lastOkAt ? toSgtIso(s.lastOkAt) : null,
        lastError: s.lastErrorAt ? `${toSgtIso(s.lastErrorAt)} ${s.lastError}` : null,
        detail: s.detail,
      }));
      return status;
    }
    case 'rewind_band': {
      // Pretend every alert band (highest region and each region) was `band` long ago, so the
      // next tick announces the real ones.
      if (!PSI_BANDS.some((b) => b.id === input.band)) throw new EndpointError(`band must be one of ${PSI_BANDS.map((b) => b.id).join(', ')}`);
      await setAlertBands(Object.fromEntries(ALERT_SCOPES.map((s) => [s, { id: input.band, at: 0 }])));
      await setAllLastBand(input.band);
      return { ok: true, band: input.band };
    }
    case 'backfill': {
      const days = input.days ?? 14; // 14 × 24 = range.js's HISTORY_HOURS
      if (!Number.isInteger(days) || days < 1 || days > 14) throw new EndpointError('days must be 1 to 14');
      return backfill(days);
    }
    case 'commands': {
      // Default (BotFather's list, shown where no scoped list applies) and private chats: the plain
      // list. Groups: is_ephemeral, so the command and the reply are seen only by the sender and the bot.
      /** @param {boolean} group */
      const commands = (group) => COMMANDS.map(({ command, description, ephemeral }) => ({ command, description, ...(group && ephemeral && { is_ephemeral: true }) }));
      await api.setMyCommands({ commands: commands(false) });
      await api.setMyCommands({ commands: commands(false), scope: { type: 'all_private_chats' } });
      await api.setMyCommands({ commands: commands(true), scope: { type: 'all_group_chats' } });
      // A list set for group admins (once, by hand in BotFather) wins over the group one; clear it.
      await api.deleteMyCommands({ scope: { type: 'all_chat_administrators' } });
      return { ok: true };
    }
    case 'breaking_pause': {
      if (typeof input.on !== 'boolean') throw new EndpointError('on must be true or false');
      await setState('breaking_paused', input.on);
      return { ok: true, paused: input.on };
    }
    case 'breaking_cancel': {
      if (!(await cancelEvent(String(input.id)))) throw new EndpointError('No such event; see status for ids');
      return { ok: true, id: input.id };
    }
    case 'breaking_test': {
      const chatId = Number(input.chatId);
      if (!Number.isInteger(chatId) || chatId === 0) throw new EndpointError('chatId must be a chat id');
      /** @type {import('../lib/breaking.js').BreakingEvent} */
      const event = (await getBreaking()).events.findLast((e) => !e.cancelled) ?? {
        id: 'test',
        kind: 'news',
        topic: 'schools',
        source: 'st',
        title: 'Test: this is what breaking haze news looks like',
        link: 'https://www.straitstimes.com/singapore',
        at: Date.now(),
      };
      await sendBreaking({ chat_id: chatId }, event, await getSnapshot());
      return { ok: true, sent: event.id };
    }
    default:
      throw new EndpointError("action must be 'set', 'unset', 'status', 'rewind_band', 'backfill', 'commands', 'breaking_pause', 'breaking_cancel' or 'breaking_test'");
  }
}
