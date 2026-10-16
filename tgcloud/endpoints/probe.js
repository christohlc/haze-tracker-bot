// Step 0 reachability test: can Serverless reach every data source we depend on?
// Run: npx tgcloud run endpoints/probe '{}'. Delete once the answer is known.

import { fetch } from 'sdk';
import { requireCli } from '../lib/cli-only.js';

const TARGETS = {
  egress_ip: 'https://ipinfo.io/json',
  nea_pm25: 'https://api-open.data.gov.sg/v2/real-time/api/pm25',
  nea_psi: 'https://api-open.data.gov.sg/v2/real-time/api/psi',
  openmeteo_weather:
    'https://api.open-meteo.com/v1/forecast?latitude=1.35&longitude=103.82&hourly=wind_speed_10m,boundary_layer_height&forecast_days=1',
  openmeteo_aq:
    'https://air-quality-api.open-meteo.com/v1/air-quality?latitude=0.53&longitude=101.45&hourly=pm2_5&forecast_days=1',
  // No MAP_KEY yet: an "Invalid MAP_KEY" body still proves the host is reachable.
  nasa_firms: 'https://firms.modaps.eosdis.nasa.gov/api/area/csv/INVALID/VIIRS_SNPP_NRT/95,-6,110,6/1',
};

export default async function (input, ctx) {
  requireCli(ctx);
  const results = {};
  await Promise.all(
    Object.entries(TARGETS).map(async ([name, url]) => {
      const started = Date.now();
      try {
        const res = await fetch(url);
        const body = await res.text();
        results[name] = {
          status: res.status,
          ms: Date.now() - started,
          bytes: body.length,
          sample: body.slice(0, name === 'egress_ip' ? 300 : 120),
        };
      } catch (e) {
        results[name] = { error: String(e?.message ?? e), ms: Date.now() - started };
      }
    }),
  );
  return results;
}
