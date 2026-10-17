// @ts-check
// Telegram HTML for chat replies. Pure: takes a snapshot, returns strings.

import { verdict } from './advice.js';
import { escapeHtml } from './html.js';
import { PUBLISHERS } from './news-parse.js';
import { outlookLabel, psiRangeText } from './outlook-parse.js';
import { bandById, PSI_BANDS, psiBand } from './psi.js';
import { RANGE_RECORD } from './range.js';
import { readingsFor } from './snapshot.js';
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
 * Where a reading is from: the chat's area, and the highest region if that's elsewhere, or for a
 * chat without one, the worst region.
 * @param {any} snap @param {any} area @param {'psi3h' | 'psi24h'} key
 */
function whereOf(snap, area, key) {
  const top = snap.worst[key];
  if (!area) return `worst region (${top?.name ?? '–'})`;
  return `${area.name}${top && top.region !== area.id ? `; highest ${top.name} ${n(top.value)}` : ''}`;
}

/** " in East": the chat's area, or for a chat without one the highest region (nothing without a reading). @param {any} snap @param {any} area */
const placeOf = (snap, area) => (area ? ` in ${area.name}` : snap.worst.psi3h ? ` in ${snap.worst.psi3h.name}, the highest` : '');

/** " · West highest at 244" when the highest 3-hour PSI is outside the chat's area. @param {any} snap @param {any} area */
function highestElsewhere(snap, area) {
  const top = snap.worst.psi3h;
  return area && top && top.region !== area.id ? ` · ${top.name} highest at ${n(top.value)}` : '';
}

/**
 * The readings a chat's messages lead with, and the 3-hour PSI's caption.
 * @param {any} snap @param {string | null | undefined} region
 */
function focus(snap, region) {
  const r = readingsFor(snap, region);
  return { area: r.area, psi3h: r.psi3h?.value ?? null, psi24h: r.psi24h?.value ?? null, pm25: r.pm25?.value ?? null, where: whereOf(snap, r.area, 'psi3h') };
}

/**
 * The /haze and daily-update text, leading with `region`'s readings when the chat follows one.
 * With `table: false` it's the caption under the summary card, which already shows each region's
 * readings (photo captions are capped at 1,024 characters).
 * @param {any} snap @param {import('./ahead.js').Ahead | null} [ahead] @param {{ table?: boolean, region?: string | null }} [opts]
 */
export function formatHaze(snap, ahead, { table = true, region = null } = {}) {
  const f = focus(snap, region);
  const band = psiBand(f.psi3h);
  const advice = adviceLines(f.psi24h, f.pm25);

  const lines = [
    `${band?.emoji ?? '⚪️'} <b>${band?.label ?? 'No data'}</b> · 3-hr PSI ${n(f.psi3h)}${placeOf(snap, f.area)}`,
    `<i>Our calculation from PM2.5 · ${sgtTime(snap.asOf)} SGT${highestElsewhere(snap, f.area)}</i>`,
    ...(snap.stale ? ['⚠️ <i>NEA hasn’t updated recently, so this may be out of date.</i>'] : []),
    '',
    ...advice,
  ];
  const soon = ahead?.range?.steps.find((s) => s.h === 3);
  if (ahead?.outlook) lines.push(`📅 NEA’s forecast for ${sgtDayName(ahead.outlook.forDate)}: <b>${escapeHtml(ahead.outlook.psi ? psiRangeText(ahead.outlook.psi) : ahead.outlook.text)}</b> · /forecast`);
  else if (soon) lines.push(`📈 Island-wide 1-hr PSI in 3 hours: likely <b>${soon.lo}–${soon.hi}</b>, our calculation · /forecast`);
  lines.push(`🚬 <b>${n(snap.cigs.past24h, 1)}</b> cigarettes’ worth in 24h, island-wide, outdoors all day`, '');
  if (table) lines.push(`<pre>${regionTable(snap)}</pre>`, '<i>PM2.5 in µg/m³. 1h/3h PSI computed from PM2.5; 24h PSI is NEA’s.</i>', '');
  lines.push(table ? '<i>Not official. Check haze.gov.sg for NEA advisories.</i>' : '<i>The picture is NEA’s official 24-hr PSI. Advisories: haze.gov.sg.</i>');
  return lines.join('\n');
}

/**
 * The advice lines, in one order for every message: "Outside now", vulnerable people's own line
 * if their advice is stricter, then the 😷 line. All from one verdict, so they can't disagree.
 * Empty without readings.
 * @param {number | null} psi24h  @param {number | null} pm25Now
 */
function adviceLines(psi24h, pm25Now) {
  const all = verdict(psi24h, pm25Now, 'general');
  if (!all) return [];
  const vul = verdict(psi24h, pm25Now, 'vulnerable');
  return [
    `👉 <b>Outside now:</b> ${all.headline}`,
    ...(vul && vul.rank > all.rank ? [`🧓 <b>Vulnerable people:</b> ${vul.headline}`] : []),
    `😷 <b>${all.mask.title}.</b> ${all.mask.text}`,
  ];
}

/** Caption for the summary card. @param {any} snap @param {import('./ahead.js').Ahead | null} [ahead] @param {string | null} [region] */
export const formatHazeCaption = (snap, ahead, region = null) => formatHaze(snap, ahead, { table: false, region });

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
 * Short alert when the band the chat follows changes: its region's, or the highest region's.
 * The band is our 3-hour PSI's, so it also gives NEA's 24-hour PSI, which the picture above it
 * shows. `official` is an official 24-hour PSI crossing (breaking news) due to the same chat in
 * the same tick: it leads the message instead of going as a message of its own.
 * @param {any} snap
 * @param {string} fromId previous band id
 * @param {string} toId new band id
 * @param {string | null} [region]
 * @param {any} [official] a PsiEvent (breaking-rules.js)
 */
export function formatBandAlert(snap, fromId, toId, region = null, official = null) {
  const to = bandById(toId);
  const from = bandById(fromId);
  const f = focus(snap, region);
  const worse = PSI_BANDS.indexOf(/** @type {any} */ (to)) > PSI_BANDS.indexOf(/** @type {any} */ (from));
  const lines = [
    ...(official ? [...officialLines(official, snap), ''] : []),
    `${to?.emoji ?? '⚪️'} <b>Haze${f.area ? ` in ${f.area.name}` : ''} ${worse ? 'up' : 'down'} to ${to?.label ?? toId}</b> (was ${from?.label ?? fromId})`,
    `Our 3-hour PSI <b>${n(f.psi3h)}</b>, ${f.where}${official ? '' : ` · ${sgtTime(snap.asOf)} SGT`}`,
  ];
  // The worst region's 24-hour PSI is already the official lines' number.
  if (f.area || !official) lines.push(`NEA’s 24-hour PSI <b>${n(f.psi24h)}</b>, ${whereOf(snap, f.area, 'psi24h')}`);
  lines.push(...adviceLines(f.psi24h, f.pm25), '', '<i>/alerts to change or stop these.</i>');
  return lines.join('\n');
}

/** The headline of an official 24-hour PSI crossing. @param {any} event a PsiEvent @param {any} snap */
function officialLines(event, snap) {
  const band = bandById(event.band);
  return [
    `${band?.emoji ?? '⚪️'} <b>Official 24-hour PSI now ${band?.label ?? event.band}</b>`,
    `NEA’s 24-hour PSI is <b>${n(event.value)}</b>, worst in ${snap.worst.psi24h?.name ?? '–'} · ${sgtTime(snap.asOf)} SGT`,
  ];
}

/** "NEA’s 24-hr PSI forecast for tomorrow: <b>150–230 (Unhealthy to Very Unhealthy)</b>" @param {import('./outlook-parse.js').Outlook} o */
const outlookLine = (o) => `NEA’s 24-hr PSI forecast for ${sgtDayName(o.forDate)}: <b>${escapeHtml(outlookLabel(o))}</b>`;

/**
 * A breaking-news message: a story we picked from the news, or the official 24-hour PSI rising
 * into Very unhealthy or Hazardous. Only the 24-hour PSI is called official.
 * @param {any} event a BreakingEvent (breaking-rules.js) @param {any} snap
 */
export function formatBreaking(event, snap) {
  const psi = snap.worst.psi24h;
  const footer = ['', '<i>/alerts to change or stop these.</i>'];
  if (event.kind === 'psi24') {
    return [...officialLines(event, snap), ...adviceLines(event.value, snap.worst.pm25?.value ?? null), ...footer].join('\n');
  }
  const publisher = PUBLISHERS[/** @type {keyof typeof PUBLISHERS} */ (event.source)]?.name ?? event.source;
  return [
    `🚨 <b>Breaking: ${escapeHtml(event.title)}</b>`,
    `${escapeHtml(publisher)} · <a href="${escapeHtml(event.link)}">Read the story</a>`,
    '',
    `Official 24-hour PSI <b>${n(psi?.value)}</b>, worst in ${psi?.name ?? '–'} · ${sgtTime(snap.asOf)} SGT`,
    '<i>Picked from the news automatically by this bot.</i>',
    ...footer,
  ].join('\n');
}


/** The forecast card's caption, and the text sent if the picture fails. @param {import('./ahead.js').Ahead} ahead */
export const forecastMessage = (ahead) => ({ caption: formatForecast(ahead, { table: false }), text: formatForecast(ahead) });

/**
 * /forecast: NEA's outlook when there is one, then our range for the next few hours. With
 * `table: false` it's the caption under the forecast card, so the range fits on one line.
 * @param {import('./ahead.js').Ahead} ahead @param {{ table?: boolean }} [opts]
 */
export function formatForecast({ outlook, range }, { table = true } = {}) {
  const lines = ['📈 <b>What’s ahead</b>', ''];
  if (outlook) lines.push(`📅 ${outlookLine(outlook)}`, `<i>Issued by NEA ${sgtDayMonth(outlook.issuedAt)}, ${sgtTime(outlook.issuedAt)} SGT.</i>`, '');
  else lines.push('<i>NEA hasn’t issued a 24-hr PSI forecast. It does daily during haze episodes, at haze.gov.sg.</i>', '');
  if (range) {
    const rows = range.steps.map((s) => `${`+${s.h}h`.padEnd(5)}${sgtTime(s.t).padStart(9)}  ${`${s.lo}–${s.hi}`}`);
    const likely = range.steps.map((s) => `${s.h} h <b>${s.lo === s.hi ? s.lo : `${s.lo}–${s.hi}`}</b>`).join(' · ');
    lines.push(
      `<b>Next few hours</b> · island-wide 1-hour PSI, now ${range.now}`,
      table ? `<pre>${[`${'In'.padEnd(5)}${'SGT'.padStart(9)}  Likely`, ...rows].join('\n')}</pre>` : `Likely in ${likely}`,
      `<i>Our calculation, not official: how much the reading moved over the same hours in the past two weeks. ${RANGE_RECORD}</i>`,
    );
  }
  return lines.join('\n');
}
