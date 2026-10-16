// @ts-check
// endpoints/admin.js — operator tools, reachable only through the CLI:
//   read -rs KEY && npx tgcloud run endpoints/admin "{ action: 'set', key: 'firms_map_key', value: '$KEY' }"
//   npx tgcloud run endpoints/admin "{ action: 'status' }"
//   npx tgcloud run endpoints/admin "{ action: 'unset', key: 'firms_map_key' }"
//   npx tgcloud run endpoints/admin "{ action: 'rewind_band', band: 'unhealthy' }"  (test: next tick alerts the change)
// Breaking news is sent without anyone checking it first, so:
//   npx tgcloud run endpoints/admin "{ action: 'breaking_pause', on: true }"   (no new events, nothing sent; false resumes)
//   npx tgcloud run endpoints/admin "{ action: 'breaking_cancel', id: 'n1a2b3c' }"  (stop sending one event; ids in status)
//   npx tgcloud run endpoints/admin "{ action: 'breaking_test', chatId: 123 }"  (send the latest event, or a sample, to one chat)

import { EndpointError } from 'sdk';
import { cancelEvent, getBreaking, isBreakingPaused, sendBreaking } from '../lib/breaking.js';
import { requireCli } from '../lib/cli-only.js';
import { PSI_BANDS } from '../lib/psi.js';
import { getSnapshot } from '../lib/refresh.js';
import { breakingClaimedChats, countSubscribers, setAllLastBand } from '../lib/subscriptions.js';
import { allSourceStatus, countReadings, deleteSetting, getSetting, getState, setSetting, setState, toSgtIso } from '../lib/store.js';

const SECRET_KEYS = ['firms_map_key'];

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
      const snap = (await getState('snapshot'))?.value;
      status.snapshot = snap ? { asOf: snap.asOf, psi3h: snap.worst.psi3h } : 'none';
      status.readings = await countReadings();
      status.subscribers = await countSubscribers();
      status.alertBand = (await getState('alert_band'))?.value ?? null;
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
      // Pretend the alert band was `band` long ago, so the next tick announces the real one.
      if (!PSI_BANDS.some((b) => b.id === input.band)) throw new EndpointError(`band must be one of ${PSI_BANDS.map((b) => b.id).join(', ')}`);
      await setState('alert_band', { id: input.band, at: 0 });
      await setAllLastBand(input.band);
      return { ok: true, band: input.band };
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
      await sendBreaking(chatId, event, await getSnapshot());
      return { ok: true, sent: event.id };
    }
    default:
      throw new EndpointError("action must be 'set', 'unset', 'status', 'rewind_band', 'breaking_pause', 'breaking_cancel' or 'breaking_test'");
  }
}
