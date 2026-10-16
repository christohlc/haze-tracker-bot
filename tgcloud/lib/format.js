// @ts-check
// Telegram HTML for chat replies. Pure: takes a snapshot, returns strings.

import { advice, maskCard } from './advice.js';
import { PSI_BANDS, psiBand } from './psi.js';

/** "2026-10-16T13:00:00+08:00" → "1:00 pm" (the timestamp is already in SGT). @param {string} iso */
export function sgtTime(iso) {
  const [h, m] = iso.slice(11, 16).split(':').map(Number);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

/** @param {number | null | undefined} v @param {number} [digits] */
const n = (v, digits = 0) => (v == null ? '–' : v.toFixed(digits));
/** @param {string | number} s @param {number} w */
const pad = (s, w) => String(s).padStart(w);

/**
 * The /haze and daily-update text. With `table: false` it's the caption under the summary card,
 * which already shows each region's readings (photo captions are capped at 1,024 characters).
 * @param {any} snap @param {any} [forecast] @param {{ table?: boolean }} [opts]
 */
export function formatHaze(snap, forecast, { table: withTable = true } = {}) {
  const head = snap.worst.psi3h;
  const band = psiBand(head?.value);
  const mask = maskCard(head?.value);
  const tips = advice(snap.worst.psi24h?.value ?? null, snap.worst.pm25?.value ?? null);

  const rows = snap.regions.map(
    (/** @type {any} */ r) => `${r.name.padEnd(8)}${pad(n(r.pm25), 6)}${pad(n(r.psi1h), 5)}${pad(n(r.psi3h), 5)}${pad(n(r.psi24h), 5)}`,
  );
  const table = [`${'Region'.padEnd(8)}${pad('PM2.5', 6)}${pad('1h', 5)}${pad('3h', 5)}${pad('24h', 5)}`, ...rows].join(
    '\n',
  );

  const lines = [
    `${band?.emoji ?? '⚪️'} <b>PSI ${n(head?.value)}</b> · ${band?.label ?? 'No data'}`,
    `<i>3-hour PSI, worst region (${head?.name ?? '–'}) · ${sgtTime(snap.asOf)} SGT</i>`,
    ...(snap.stale ? ['⚠️ <i>NEA hasn’t updated recently, so this may be out of date.</i>'] : []),
    '',
    ...(withTable
      ? [`<pre>${table}</pre>`, '<i>PM2.5 in µg/m³. 1h/3h PSI computed from PM2.5; 24h PSI is NEA’s.</i>']
      : ['<i>3-hour PSI is our calculation from PM2.5. The picture shows NEA’s readings.</i>']),
    '',
    `🚬 <b>${n(snap.cigs.past24h, 1)}</b> cigarettes over the past 24h (island-wide, outdoors all day)`,
  ];
  if (mask) lines.push(`😷 <b>${mask.title}.</b> ${mask.text}`);
  if (tips.rightNow) lines.push(`👉 Band ${tips.rightNow.band} (${tips.rightNow.label}): ${tips.rightNow.text}`);
  if (forecast?.steps?.length) {
    const ahead = forecast.steps.filter((/** @type {any} */ s) => [1, 3, 6].includes(s.h));
    lines.push(`📈 Island-wide 1h PSI ahead: ${ahead.map((/** @type {any} */ s) => `+${s.h}h <b>${s.psi}</b>`).join(' · ')} (/forecast)`);
  }
  lines.push('', '<i>Not official. Check haze.gov.sg for NEA advisories.</i>');
  return lines.join('\n');
}

/** Caption for the summary card. @param {any} snap @param {any} [forecast] */
export const formatHazeCaption = (snap, forecast) => formatHaze(snap, forecast, { table: false });

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

/**
 * What the range has actually done on the model's held-out test week (one week of hourly
 * readings, so a rough guide, not a guarantee).
 * @param {{ coverage: [number, number], testFrom: string } | null | undefined} backtest
 */
export function coverageNote(backtest) {
  if (!backtest) return 'The range aims to hold the reading about 8 times in 10.';
  const [lo, hi] = backtest.coverage.map((c) => Math.round(c * 100));
  const from = new Date(`${backtest.testFrom}T00:00:00+08:00`).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' });
  return `The range aims to hold the reading 8 times in 10; in a test week from ${from} it held ${lo === hi ? lo : `${lo}–${hi}`}% of hours.`;
}

/**
 * The "biggest factor" sentence, or null if no input moves the forecast by a whole PSI.
 * @param {{ label: string, delta: number } | undefined} top
 */
export function factorSentence(top) {
  if (!top || Math.abs(top.delta) < 1) return null;
  return `${top.label}, ${top.delta > 0 ? 'raising' : 'lowering'} the forecast by about ${Math.abs(top.delta)} PSI compared with a typical hour.`;
}

/** @param {any} forecast */
export function formatForecast(forecast) {
  const rows = forecast.steps.map(
    (/** @type {any} */ s) =>
      `${`+${s.h}h`.padEnd(5)}${sgtTime(s.t).padStart(9)}${pad(s.psi, 6)}  ${`${s.lo}–${s.hi}`.padEnd(9)}`,
  );
  const table = [`${'When'.padEnd(5)}${'SGT'.padStart(9)}${pad('PSI', 6)}  80% range`, ...rows].join('\n');
  const factor = factorSentence(forecast.factors?.[0]);
  const lines = [
    `📈 <b>Haze forecast</b> · island-wide 1-hour PSI`,
    `<i>Now ${n(forecast.now)} · based on data to ${sgtTime(forecast.issuedAt)} SGT</i>`,
    '',
    `<pre>${table}</pre>`,
  ];
  if (factor) lines.push(`Biggest factor for the next hour (besides the current PSI): ${factor}`);
  lines.push('', `<i>Model forecast, not official. ${coverageNote(forecast.model?.backtest)}</i>`);
  return lines.join('\n');
}
