// @ts-check
// Telegram HTML for chat replies. Pure: takes a snapshot, returns strings.

import { verdict } from './advice.js';
import { escapeHtml } from './html.js';
import { PUBLISHERS } from './news-parse.js';
import { outlookLabel, psiRangeText } from './outlook-parse.js';
import { REGIONS } from './config.js';
import { bandById, bandGroups, groupRange, PM25_BANDS, pm25Band, PSI_BANDS, psiBand } from './psi.js';
import { RANGE_RECORD } from './range.js';
import { readingsFor, STALE_NOTE } from './snapshot.js';
import { sgtDayMonth, sgtDayName, sgtHour } from './time.js';

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

/** The highest region for `key` if it isn't the chat's area, else null. @param {any} snap @param {any} area @param {'psi3h' | 'psi24h'} key */
function highestElsewhere(snap, area, key) {
  const top = snap.worst[key];
  return area && top && top.region !== area.id ? top : null;
}

/**
 * Where a reading is from: "in East (highest: West 245)", or for a chat without an area
 * "in Central, the highest".
 * @param {any} snap @param {any} area @param {'psi3h' | 'psi24h'} key
 */
function whereOf(snap, area, key) {
  if (!area) return `in ${snap.worst[key]?.name ?? '–'}, the highest`;
  const top = highestElsewhere(snap, area, key);
  return `in ${area.name}${top ? ` (highest: ${top.name} ${n(top.value)})` : ''}`;
}

/** The readings a chat's messages lead with. @param {any} snap @param {string | null | undefined} region */
function focus(snap, region) {
  const r = readingsFor(snap, region);
  return { area: r.area, psi3h: r.psi3h?.value ?? null, psi24h: r.psi24h?.value ?? null, pm25: r.pm25?.value ?? null };
}

/**
 * The /haze and daily-update text, leading with `region`'s readings when the chat follows one.
 * With `table: false` it's the caption under the summary card, which already shows each region's
 * readings (photo captions are capped at 1,024 characters).
 * @param {any} snap @param {import('./ahead.js').Ahead | null} [ahead] @param {{ table?: boolean, region?: string | null }} [opts]
 */
export function formatHaze(snap, ahead, { table = true, region = null } = {}) {
  const f = focus(snap, region);
  const lines = [
    ...psiLines(snap, f.area),
    `💨 Last hour’s PM2.5: ${pm25Words(snap)} · ${sgtHour(snap.asOf)} SGT`,
    ...(snap.stale ? [`⚠️ <i>${STALE_NOTE}</i>`] : []),
    '',
    ...adviceLines(f.psi24h, f.pm25),
  ];
  const soon = ahead?.range?.steps.find((s) => s.h === 3);
  if (ahead?.outlook) lines.push(`📅 ${outlookLine(ahead.outlook, true)} · /forecast`);
  else if (soon) lines.push(`📈 Island-wide 1-hr PSI in 3 hours: likely <b>${soon.lo}–${soon.hi}</b>, our calculation · /forecast`);
  lines.push(`🚬 <b>${n(snap.cigs.past24h, 1)}</b> cigarettes’ worth over 24 hrs outdoors, island-wide`, '');
  if (table)
    lines.push(
      `<pre>${regionTable(snap)}</pre>`,
      '<i>PM2.5 in µg/m³. 1h/3h PSI: ours. 24h: NEA’s. Advisories: haze.gov.sg.</i>',
    );
  else lines.push('<i>PSI and PM2.5: NEA’s. Advisories: haze.gov.sg.</i>');
  return lines.join('\n');
}

/**
 * Where each band group is: "in West, East"; "island-wide" for a group with every region; and for
 * the last of several groups "elsewhere", but only when every region has a reading, so it never
 * covers a region we know nothing about.
 * @param {Array<{ names: string[] }>} groups from bandGroups (psi.js) @param {number} [named] regions named before these (a chat's area)
 */
function groupPlaces(groups, named = 0) {
  const total = groups.reduce((sum, g) => sum + g.names.length, named);
  return groups.map((g, i) =>
    (named || i) && i === groups.length - 1 && total === REGIONS.length
      ? 'elsewhere'
      : g.names.length === REGIONS.length
        ? 'island-wide'
        : `in ${g.names.join(', ')}`,
  );
}

/**
 * The official 24-hour PSI, one line per band, worst first, the chat's area leading:
 * "🟠 <b>Very unhealthy in West</b> · 24-hr PSI 228" then "🟡 Unhealthy elsewhere · 129–186".
 * There's no band for the whole island: the summary card gives each region's, and this says where
 * each applies.
 * @param {any} snap @param {any} area
 */
function psiLines(snap, area) {
  const [lead] = area ? bandGroups([area], 'psi24h', psiBand, PSI_BANDS) : [];
  const groups = bandGroups(lead ? snap.regions.filter((/** @type {any} */ r) => r !== area) : snap.regions, 'psi24h', psiBand, PSI_BANDS);
  const places = groupPlaces(groups, lead ? 1 : 0);
  const rows = groups.map((g, i) => ({ g, where: places[i] === 'elsewhere' && g.band === lead?.band ? 'elsewhere too' : places[i] }));
  if (lead) rows.unshift({ g: lead, where: `in ${area.name}` });
  if (!rows.length) return ['⚪️ <b>No 24-hr PSI yet</b>'];
  return rows.map(({ g, where }, i) =>
    i ? `${g.band.emoji} ${g.band.label} ${where} · ${groupRange(g)}` : `${g.band.emoji} <b>${g.band.label} ${where}</b> · 24-hr PSI ${groupRange(g)}`,
  );
}

/** "High in West, Elevated elsewhere", "Elevated island-wide". @param {any} snap */
function pm25Words(snap) {
  const groups = bandGroups(snap.regions, 'pm25', pm25Band, PM25_BANDS);
  const places = groupPlaces(groups);
  return groups.length ? groups.map((g, i) => `${g.band.label} ${places[i]}`).join(', ') : 'no reading';
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
  return [`<b>Singapore haze</b> · ${sgtHour(snap.asOf)} SGT`, ...psiLines(snap, null), '<i>NEA’s readings.</i>'].join('\n');
}

/**
 * @param {ReturnType<import('./cigs.js').cigarettes>} c
 * @param {{ place: string, outdoorPct: number }} where
 */
export function formatCigs(c, { place, outdoorPct }) {
  return [
    `🚬 <b>${n(c.past24h, 1)}</b> cigarettes over the past 24 hours`,
    `<b>${n(c.lastHour, 2)}</b> in the last hour · <b>${n(c.perDayAtCurrent, 1)}</b>/day if this hour’s level continued`,
    `<i>${place}, ${outdoorPct}% outdoors. 22 µg/m³ of PM2.5 for 24 hrs ≈ 1 cigarette (Berkeley Earth).</i>`,
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
    `Our 3-hr PSI <b>${n(f.psi3h)}</b> ${whereOf(snap, f.area, 'psi3h')}${official ? '' : ` · ${sgtHour(snap.asOf)} SGT`}`,
  ];
  // The worst region's 24-hour PSI is already the official lines' number.
  if (f.area || !official) lines.push(`Official 24-hr PSI <b>${n(f.psi24h)}</b> ${whereOf(snap, f.area, 'psi24h')}`);
  lines.push('', ...adviceLines(f.psi24h, f.pm25), '', '<i>/alerts to change or stop these.</i>');
  return lines.join('\n');
}

/** The headline of an official 24-hour PSI crossing. @param {any} event a PsiEvent @param {any} snap */
function officialLines(event, snap) {
  const band = bandById(event.band);
  return [
    `${band?.emoji ?? '⚪️'} <b>Official 24-hr PSI now ${band?.label ?? event.band}</b>`,
    `<b>${n(event.value)}</b> ${whereOf(snap, null, 'psi24h')} · ${sgtHour(snap.asOf)} SGT`,
  ];
}

/**
 * "NEA’s 24-hr PSI forecast for tomorrow: <b>150–230 (Unhealthy to Very Unhealthy)</b>"; `short`
 * leaves out NEA's words when it gave numbers.
 * @param {import('./outlook-parse.js').Outlook} o @param {boolean} [short]
 */
const outlookLine = (o, short = false) => `NEA’s 24-hr PSI forecast for ${sgtDayName(o.forDate)}: <b>${escapeHtml(short && o.psi ? psiRangeText(o.psi) : outlookLabel(o))}</b>`;

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
    `Official 24-hr PSI <b>${n(psi?.value)}</b> ${whereOf(snap, null, 'psi24h')} · ${sgtHour(snap.asOf)} SGT`,
    '<i>Picked automatically by the bot.</i>',
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
  if (outlook) lines.push(`📅 ${outlookLine(outlook)}`, `<i>Issued by NEA ${sgtDayMonth(outlook.issuedAt)}, ${sgtHour(outlook.issuedAt)} SGT.</i>`, '');
  else lines.push('<i>No NEA forecast out. It issues one daily during haze episodes.</i>', '');
  if (range) {
    const rows = range.steps.map((s) => `${`+${s.h}h`.padEnd(5)}${sgtHour(s.t).padStart(9)}  ${`${s.lo}–${s.hi}`}`);
    const likely = range.steps.map((s) => `${s.h} h <b>${s.lo === s.hi ? s.lo : `${s.lo}–${s.hi}`}</b>`).join(' · ');
    lines.push(
      `<b>Next few hours</b> · island-wide 1-hr PSI, now ${range.now}`,
      table ? `<pre>${[`${'In'.padEnd(5)}${'SGT'.padStart(9)}  Likely`, ...rows].join('\n')}</pre>` : `Likely in ${likely}`,
      `<i>Our calculation, not official. ${RANGE_RECORD}</i>`,
    );
  }
  return lines.join('\n');
}
