// @ts-check
// Telegram HTML for chat replies. Pure: takes a snapshot, returns strings.

import { advice, maskCard } from './advice.js';
import { PSI_BANDS, psiBand } from './psi.js';
import { sgtDayMonth, sgtDayName, sgtHour } from './time.js';

/** "2026-10-16T13:00:00+08:00" → "1:00 pm" (the timestamp is already in SGT). @param {string} iso */
export const sgtTime = (iso) => sgtHour(iso, true);

/** @param {number | null | undefined} v @param {number} [digits] */
const n = (v, digits = 0) => (v == null ? '–' : v.toFixed(digits));
/** @param {string | number} s @param {number} w */
const pad = (s, w) => String(s).padStart(w);

/** Fixed-width table of every region's readings. @param {any} snap */
function regionTable(snap) {
  const rows = snap.regions.map(
    (/** @type {any} */ r) => `${r.name.padEnd(8)}${pad(n(r.pm25), 6)}${pad(n(r.psi1h), 5)}${pad(n(r.psi3h), 5)}${pad(n(r.psi24h), 5)}`,
  );
  return [`${'Region'.padEnd(8)}${pad('PM2.5', 6)}${pad('1h', 5)}${pad('3h', 5)}${pad('24h', 5)}`, ...rows].join('\n');
}

/**
 * The /haze and daily-update text. With `table: false` it's the caption under the summary card,
 * which already shows each region's readings (photo captions are capped at 1,024 characters).
 * @param {any} snap @param {import('./ahead.js').Ahead | null} [ahead] @param {{ table?: boolean }} [opts]
 */
export function formatHaze(snap, ahead, { table = true } = {}) {
  const head = snap.worst.psi3h;
  const band = psiBand(head?.value);
  const mask = maskCard(head?.value);
  const tips = advice(snap.worst.psi24h?.value ?? null, snap.worst.pm25?.value ?? null);

  const lines = [
    `${band?.emoji ?? '⚪️'} <b>PSI ${n(head?.value)}</b> · ${band?.label ?? 'No data'}`,
    `<i>3-hour PSI, worst region (${head?.name ?? '–'}) · ${sgtTime(snap.asOf)} SGT</i>`,
    ...(snap.stale ? ['⚠️ <i>NEA hasn’t updated recently, so this may be out of date.</i>'] : []),
    '',
    ...(table
      ? [`<pre>${regionTable(snap)}</pre>`, '<i>PM2.5 in µg/m³. 1h/3h PSI computed from PM2.5; 24h PSI is NEA’s.</i>']
      : ['<i>3-hour PSI is our calculation from PM2.5. The picture shows NEA’s readings.</i>']),
    '',
    `🚬 <b>${n(snap.cigs.past24h, 1)}</b> cigarettes over the past 24h (island-wide, outdoors all day)`,
  ];
  if (mask) lines.push(`😷 <b>${mask.title}.</b> ${mask.text}`);
  if (tips.rightNow) lines.push(`👉 Band ${tips.rightNow.band} (${tips.rightNow.label}): ${tips.rightNow.text}`);
  const soon = ahead?.range?.steps.find((s) => s.h === 3);
  if (ahead?.outlook) lines.push(`📅 ${outlookLine(ahead.outlook)} (/forecast)`);
  else if (soon) lines.push(`📈 Island-wide 1h PSI in 3 hours: likely <b>${soon.lo}–${soon.hi}</b>, our calculation (/forecast)`);
  lines.push('', '<i>Not official. Check haze.gov.sg for NEA advisories.</i>');
  return lines.join('\n');
}

/** Caption for the summary card. @param {any} snap @param {import('./ahead.js').Ahead | null} [ahead] */
export const formatHazeCaption = (snap, ahead) => formatHaze(snap, ahead, { table: false });

/** Short caption for a card shared from the Mini App into another chat. @param {any} snap */
export function formatShareCaption(snap) {
  const worst = snap.worst.psi24h;
  const band = psiBand(worst?.value);
  return `${band?.emoji ?? '⚪️'} <b>Singapore haze</b> · ${sgtTime(snap.asOf)} SGT\n24-hour PSI up to <b>${n(worst?.value)}</b> (${band?.label ?? 'no reading'}), NEA’s reading.`;
}

/**
 * @param {ReturnType<import('./cigs.js').cigarettes>} c
 * @param {{ place: string, outdoorPct: number }} where
 */
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

/** "NEA’s 24-hr PSI forecast for tomorrow: <b>Unhealthy to Low Very Unhealthy</b>" @param {import('./outlook-parse.js').Outlook} o */
const outlookLine = (o) => `NEA’s 24-hr PSI forecast for ${sgtDayName(o.forDate)}: <b>${escapeHtml(o.text)}</b>`;

/** @param {string} s */
const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** /forecast: NEA's outlook when there is one, then our range for the next few hours. @param {import('./ahead.js').Ahead} ahead */
export function formatForecast({ outlook, range }) {
  const lines = ['📈 <b>What’s ahead</b>', ''];
  if (outlook) lines.push(`📅 ${outlookLine(outlook)}`, `<i>Issued by NEA ${sgtDayMonth(outlook.issuedAt)}, ${sgtTime(outlook.issuedAt)} SGT.</i>`, '');
  else lines.push('<i>NEA hasn’t issued a 24-hr PSI forecast. It does daily during haze episodes, at haze.gov.sg.</i>', '');
  if (range) {
    const rows = range.steps.map((s) => `${`+${s.h}h`.padEnd(5)}${sgtTime(s.t).padStart(9)}  ${`${s.lo}–${s.hi}`}`);
    lines.push(
      `<b>Next few hours</b> · island-wide 1-hour PSI, now ${range.now}`,
      `<pre>${[`${'In'.padEnd(5)}${'SGT'.padStart(9)}  Likely`, ...rows].join('\n')}</pre>`,
      '<i>Our calculation, not official: how much the reading moved over the same hours in the past two weeks. In four years of NEA readings, the actual value landed in this range about 8 times in 10.</i>',
    );
  }
  return lines.join('\n');
}
