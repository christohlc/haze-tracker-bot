// @ts-check
// endpoints/admin.js — operator tools, reachable only through the CLI:
//   read -rs KEY && npx tgcloud run endpoints/admin "{ action: 'set', key: 'firms_map_key', value: '$KEY' }"
//   npx tgcloud run endpoints/admin "{ action: 'status' }"
//   npx tgcloud run endpoints/admin "{ action: 'unset', key: 'firms_map_key' }"

import { EndpointError } from 'sdk';
import { requireCli } from '../lib/cli-only.js';
import { allSourceStatus, countReadings, deleteSetting, getSetting, getState, setSetting, toSgtIso } from '../lib/store.js';

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
      status.sources = (await allSourceStatus()).map((s) => ({
        source: s.source,
        lastOk: s.lastOkAt ? toSgtIso(s.lastOkAt) : null,
        lastError: s.lastErrorAt ? `${toSgtIso(s.lastErrorAt)} ${s.lastError}` : null,
        detail: s.detail,
      }));
      return status;
    }
    default:
      throw new EndpointError("action must be 'set', 'unset' or 'status'");
  }
}
