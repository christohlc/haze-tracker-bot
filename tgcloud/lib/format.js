// @ts-check
// Telegram HTML for chat replies. Pure: takes a snapshot, returns strings.

import { advice, maskCard } from './advice.js';
import { PSI_BANDS, psiBand } from './psi.js';

/** "2026-10-16T13:00:00+08:00" → "1:00 pm" (the timestamp is already in SGT). */
export function sgtTime(iso) {
  const [h, m] = iso.slice(11, 16).split(':').map(Number);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

const n = (v, digits = 0) => (v == null ? '–' : v.toFixed(digits));
const pad = (s, w) => String(s).padStart(w);

export function formatHaze(snap) {
  const head = snap.worst.psi3h;
  const band = psiBand(head?.value);
  const mask = maskCard(head?.value);
  const tips = advice(snap.worst.psi24h?.value ?? null, snap.worst.pm25?.value ?? null);

  const rows = snap.regions.map(
    (r) => `${r.name.padEnd(8)}${pad(n(r.pm25), 6)}${pad(n(r.psi1h), 5)}${pad(n(r.psi3h), 5)}${pad(n(r.psi24h), 5)}`,
  );
  const table = [`${'Region'.padEnd(8)}${pad('PM2.5', 6)}${pad('1h', 5)}${pad('3h', 5)}${pad('24h', 5)}`, ...rows].join(
    '\n',
  );

  const lines = [
    `${band?.emoji ?? '⚪️'} <b>PSI ${n(head?.value)}</b> · ${band?.label ?? 'No data'}`,
    `<i>3-hour PSI, worst region (${head?.name ?? '–'}) · ${sgtTime(snap.asOf)} SGT</i>`,
    ...(snap.stale ? ['⚠️ <i>NEA hasn’t updated recently, so this may be out of date.</i>'] : []),
    '',
    `<pre>${table}</pre>`,
    '<i>PM2.5 in µg/m³. 1h/3h PSI computed from PM2.5; 24h PSI is NEA’s.</i>',
    '',
    `🚬 <b>${n(snap.cigs.past24h, 1)}</b> cigarettes over the past 24h (island-wide, outdoors all day)`,
  ];
  if (mask) lines.push(`😷 <b>${mask.title}.</b> ${mask.text}`);
  if (tips.rightNow) lines.push(`👉 Band ${tips.rightNow.band} (${tips.rightNow.label}): ${tips.rightNow.text}`);
  lines.push('', '<i>Not official. Check haze.gov.sg for NEA advisories.</i>');
  return lines.join('\n');
}

/** @param {ReturnType<import('./cigs.js').cigarettes>} c */
export function formatCigs(c, { place, outdoorPct }) {
  return [
    `🚬 <b>${n(c.past24h, 1)}</b> cigarettes over the past 24 hours`,
    `<b>${n(c.lastHour, 2)}</b> in the last hour · <b>${n(c.perDayAtCurrent, 1)}</b>/day if this hour’s level continued`,
    `<i>${place}, ${outdoorPct}% of the time outdoors. Rule of thumb: 22 µg/m³ of PM2.5 over 24h ≈ 1 cigarette (Berkeley Earth). Indoors assumed 40% of outdoor.</i>`,
  ].join('\n');
}

/**
 * Short alert when the headline band changes.
 * @param {any} snap
 * @param {string} fromId previous band id
 * @param {string} toId new band id
 */
export function formatBandAlert(snap, fromId, toId) {
  const to = PSI_BANDS.find((b) => b.id === toId);
  const from = PSI_BANDS.find((b) => b.id === fromId);
  const head = snap.worst.psi3h;
  const worse = PSI_BANDS.indexOf(/** @type {any} */ (to)) > PSI_BANDS.indexOf(/** @type {any} */ (from));
  const tips = advice(snap.worst.psi24h?.value ?? null, snap.worst.pm25?.value ?? null);
  const mask = maskCard(head?.value ?? null);
  const lines = [
    `${to?.emoji ?? '⚪️'} <b>Haze ${worse ? 'up' : 'down'} to ${to?.label ?? toId}</b> (was ${from?.label ?? fromId})`,
    `3-hour PSI <b>${n(head?.value)}</b>, worst in ${head?.name ?? '–'} · ${sgtTime(snap.asOf)} SGT`,
  ];
  if (mask) lines.push(`😷 <b>${mask.title}.</b> ${mask.text}`);
  if (tips.rightNow) lines.push(`👉 ${tips.rightNow.text}`);
  lines.push('', '<i>/alerts to change or stop these.</i>');
  return lines.join('\n');
}
