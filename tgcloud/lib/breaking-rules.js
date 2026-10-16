// @ts-check
// Which haze stories are breaking news, and when the official 24-hour PSI crossing counts.
// Pure (no sdk) so tests can load it; lib/breaking.js stores the events and lib/alerts.js sends them.
// It's our own reading of the headlines, sent without anyone checking it first, so the rules
// lean towards missing a story rather than sending a wrong one.

import { bandRank, nextAlertBand } from './alert-rules.js';
import { isHaze, storyKey } from './news-parse.js';
import { psiBand } from './psi.js';
import { sgtDateOf } from './time.js';

const H = 3600_000;
/** A story older than this when we first see it isn't breaking any more. */
export const FRESH_MS = 6 * H;
/** Events are sent to subscribers for this long, so a backlog or a late tick still delivers them. */
export const SEND_WITHIN_MS = 12 * H;
/** Events are kept this long, so a story isn't picked twice. */
export const KEEP_MS = 48 * H;
/** At most this many news events per Singapore day. */
export const MAX_NEWS_PER_DAY = 3;
/** News events only while some PSI is above Moderate. */
const GATE_PSI = 100;
/** The official 24-hour PSI bands worth breaking news. */
const PSI_BREAKING = ['very_unhealthy', 'hazardous'];

/** What the story is about, matched against the headline: a subject and an action, both needed. */
export const TOPICS = {
  schools: {
    label: 'Schools',
    subject: /\b(?:schools?|MOE|pre-?schools?|childcare|kindergartens?|students|lessons|classes)\b/i,
    action: /\b(?:clos(?:e|es|ed|ing|ures?)|shut(?:s|ting)?|suspend(?:s|ed|ing)?|home-based learning|HBL)\b/i,
  },
  outdoor: {
    label: 'Outdoor activities',
    subject:
      /\b(?:outdoor|sports?|races?|marathon|matches|training|NS|SAF|ActiveSG|concerts?|festival|parade|Grand Prix|F1|events?)\b/i,
    action: /\b(?:cancel(?:s|led|ling)?|called off|calls off|halt(?:s|ed)?|suspend(?:s|ed)?|postpone(?:s|d)?|scrap(?:s|ped)?|stop(?:s|ped)?|clos(?:e|es|ed)|shut)\b/i,
  },
  masks: {
    label: 'Masks',
    subject: /\b(?:N95|masks?)\b/i,
    action: /\b(?:distribut\w*|hand(?:s|ed|ing)? out|giv(?:e|es|ing|en) out|free|collect\w*)\b/i,
  },
  work: {
    label: 'Work',
    subject: /\b(?:MOM|employers?|workers?|outdoor work)\b/i,
    action: /\b(?:advisory|advis(?:e|es|ed)|stop(?:s|ped)?|stop-work|cease|suspend\w*|halt\w*)\b/i,
  },
};

/** A headline that says it's not happening, might happen, is over, or is only a question. */
const NEGATION =
  /\b(?:not|won't|wont|isn't|aren't|don't|doesn't|no plans?|no need|no decision|remain(?:s)? open|stay(?:s)? open|reopen\w*|resum(?:e|es|ed)|lifted|rul(?:e|es|ed) out|unlikely|fake|hoax|myths?|false|rumou?rs?|den(?:y|ies|ied)|clarif\w*|if|could|may|might|consider\w*|mull\w*|prepared to|ready to|possibl[ey]|contingenc\w*)\b|\?\s*$/i;
/** Another country's closures, which the publishers' Singapore feeds sometimes carry. */
const ELSEWHERE =
  /\b(?:Malaysia\w*|Johor|KL|Kuala Lumpur|Selangor|Penang|Sarawak|Sabah|Indonesia\w*|Jakarta|Thailand|Thai|Bangkok|Brunei)\b/i;

/** @param {string} title @returns {keyof typeof TOPICS | null} */
export function storyTopic(title) {
  if (NEGATION.test(title) || ELSEWHERE.test(title)) return null;
  for (const [id, t] of Object.entries(TOPICS)) {
    if (t.subject.test(title) && t.action.test(title)) return /** @type {keyof typeof TOPICS} */ (id);
  }
  return null;
}

/**
 * Topic of a freshly fetched story, or null unless it's haze, recent and breaking.
 * @param {{ title: string, description?: string, publishedAt: string }} item
 * @param {number} nowMs
 */
export function classifyStory(item, nowMs) {
  const t = Date.parse(item.publishedAt);
  if (!(t >= nowMs - FRESH_MS) || t > nowMs + H) return null;
  if (!isHaze(item.title, item.description)) return null;
  return storyTopic(item.title);
}

/** Is there haze right now? Official 24-hour or our 3-hour PSI above Moderate. @param {any} snap */
export function hazeGateOpen(snap) {
  return (snap?.worst?.psi24h?.value ?? 0) > GATE_PSI || (snap?.worst?.psi3h?.value ?? 0) > GATE_PSI;
}

/** Short, LIKE-safe id for a story key (it ends up in alerts_sent keys). @param {string} s */
function hashId(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/**
 * @typedef {{ id: string, kind: 'news', topic: string, title: string, link: string, source: string, at: number, cancelled?: boolean }} NewsEvent
 * @typedef {{ id: string, kind: 'psi24', band: string, value: number, at: number, cancelled?: boolean }} PsiEvent
 * @typedef {NewsEvent | PsiEvent} BreakingEvent
 */

/**
 * New news events from freshly fetched stories: one per topic per Singapore day (the first
 * publisher to report it), at most MAX_NEWS_PER_DAY a day, none twice.
 * @param {BreakingEvent[]} prev
 * @param {Array<{ source: string, title: string, link: string, publishedAt: string, description?: string }>} fresh
 * @param {number} nowMs
 * @returns {NewsEvent[]}
 */
export function pickBreaking(prev, fresh, nowMs) {
  const day = sgtDateOf(nowMs);
  const today = prev.filter((e) => e.kind === 'news' && sgtDateOf(e.at) === day);
  const topics = new Set(today.map((e) => /** @type {NewsEvent} */ (e).topic));
  const seen = new Set(prev.map((e) => e.id));
  let left = MAX_NEWS_PER_DAY - today.length;
  /** @type {NewsEvent[]} */
  const out = [];
  const sorted = [...fresh].sort((a, b) => a.publishedAt.localeCompare(b.publishedAt));
  for (const item of sorted) {
    if (left <= 0) break;
    const key = storyKey(item);
    const topic = key && classifyStory(item, nowMs);
    if (!key || !topic || topics.has(topic)) continue;
    const id = `n${hashId(key)}`;
    if (seen.has(id)) continue;
    out.push({ id, kind: 'news', topic, title: item.title, link: item.link, source: item.source, at: nowMs });
    topics.add(topic);
    seen.add(id);
    left--;
  }
  return out;
}

/**
 * The official 24-hour PSI band we've announced, and an event when it rises into Very
 * unhealthy or Hazardous, at most once per band per Singapore day. Drops wait 3 hours
 * (nextAlertBand), so a reading on a boundary doesn't announce the same rise twice.
 * @param {{ id: string, at: number } | null} prev
 * @param {number | null | undefined} psi24h
 * @param {number} nowMs
 * @param {BreakingEvent[]} [events] already stored, so a band isn't announced twice in a day
 * @returns {{ band: { id: string, at: number } | null, event: PsiEvent | null }}
 */
export function psiCrossing(prev, psi24h, nowMs, events = []) {
  const raw = psiBand(psi24h ?? null)?.id ?? null;
  const band = nextAlertBand(prev, raw, nowMs);
  const rose = band && prev && band !== prev && bandRank(band.id) > bandRank(prev.id);
  if (!band || !rose || !PSI_BREAKING.includes(band.id) || psi24h == null) return { band, event: null };
  const id = `p${band.id}${sgtDateOf(nowMs)}`;
  if (events.some((e) => e.id === id)) return { band, event: null };
  return { band, event: { id, kind: 'psi24', band: band.id, value: psi24h, at: nowMs } };
}

/** Events still worth keeping. @param {BreakingEvent[]} events @param {number} nowMs */
export const pruneEvents = (events, nowMs) => events.filter((e) => e.at >= nowMs - KEEP_MS);

/** Events still to send, oldest first. @param {BreakingEvent[]} events @param {number} nowMs */
export const sendableEvents = (events, nowMs) =>
  events.filter((e) => !e.cancelled && e.at >= nowMs - SEND_WITHIN_MS).sort((a, b) => a.at - b.at);
