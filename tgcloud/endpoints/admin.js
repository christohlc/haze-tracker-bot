// @ts-check
// endpoints/admin.js — operator tools, reachable only through the CLI:
//   read -rs KEY && npx tgcloud run endpoints/admin "{ action: 'set', key: 'firms_map_key', value: '$KEY' }"
//   npx tgcloud run endpoints/admin "{ action: 'status' }"
//   npx tgcloud run endpoints/admin "{ action: 'unset', key: 'firms_map_key' }"
//   npx tgcloud run endpoints/admin "{ action: 'rewind_band', band: 'unhealthy' }"  (test: next tick alerts the change)

import { EndpointError } from 'sdk';
import { requireCli } from '../lib/cli-only.js';
import { PSI_BANDS } from '../lib/psi.js';
import { countSubscribers, setAllLastBand } from '../lib/subscriptions.js';
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
    default:
      throw new EndpointError("action must be 'set', 'unset', 'status' or 'rewind_band'");
  }
}
