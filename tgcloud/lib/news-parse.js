// @ts-check
// Haze headlines from publishers' RSS feeds. Pure (no sdk) so tests and the Mini App
// can load it; lib/news.js does the fetching and storing.

import { decodeEntities } from './html.js';

/** The one list of news sources: display name and RSS feed. Story links must be on the feed's host. */
export const PUBLISHERS = {
  st: { name: 'The Straits Times', feed: 'https://www.straitstimes.com/news/singapore/rss.xml' },
  cna: { name: 'CNA', feed: 'https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml&category=10416' },
  mothership: { name: 'Mothership', feed: 'https://mothership.sg/feed/' },
};

// The Serverless runtime has no URL global, so links are split by hand: https only,
// host (anything before / ? #, so user@host or host:port never match), then path.
const HTTPS_LINK = /^https:\/\/([^/?#]+)([^?#]*)/i;

/** @type {Record<string, string>} */
const HOSTS = Object.fromEntries(Object.entries(PUBLISHERS).map(([id, p]) => [id, p.feed.match(HTTPS_LINK)?.[1] ?? '']));

const KEEP_DAYS = 14;
const MAX_ITEMS = 30;

/** Text of the first <tag>, with CDATA unwrapped, entities decoded and markup stripped. @param {string} xml @param {string} tag */
function field(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i'));
  if (!m) return '';
  const raw = m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  // Decode first: feeds escape their HTML (&lt;p&gt;), so tags only appear after decoding.
  return decodeEntities(raw)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** RFC-822 or ISO date to ms. Mothership's ISO dates have no offset; they're SGT. @param {string} s */
function parseDate(s) {
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(s)) s += '+08:00';
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

/**
 * @param {string} xml
 * @param {keyof typeof PUBLISHERS} source
 * @returns {Array<{ source: string, title: string, link: string, publishedAt: string, description: string }>}
 */
export function parseFeed(xml, source) {
  const out = [];
  for (const [, item] of xml.matchAll(/<item[\s>]([\s\S]*?)<\/item>/gi)) {
    const title = field(item, 'title');
    const link = field(item, 'link');
    const t = parseDate(field(item, 'pubDate'));
    if (!title || !link || t == null) continue;
    out.push({ source, title, link, publishedAt: new Date(t).toISOString(), description: field(item, 'description') });
  }
  return out;
}

const HAZE = /\b(?:haze|hazy|PSI|PM2\.5|air quality|hotspots?|transboundary|forest fires?|peat(?:land)? fires?)\b/i;

/** @param {string} title @param {string} [description] */
export function isHaze(title, description = '') {
  return HAZE.test(title) || HAZE.test(description);
}

/**
 * Key for spotting the same story twice (link without query, hash or trailing slash),
 * or null unless the link is https on the publisher's own site.
 * @param {{ source: string, link: string }} item
 */
function storyKey(item) {
  const m = item.link.match(HTTPS_LINK);
  if (!m || m[1].toLowerCase() !== HOSTS[item.source]) return null;
  return `${m[1].toLowerCase()}${m[2].replace(/\/+$/, '')}`;
}

/**
 * Add newly fetched haze stories to the stored list: deduped, newest first, last 14 days, at most 30.
 * Stored items carry no description; it's only used to filter.
 * @param {Array<{ source: string, title: string, link: string, publishedAt: string }>} prev
 * @param {Array<{ source: string, title: string, link: string, publishedAt: string, description?: string }>} fresh
 * @param {number} nowMs
 */
export function mergeNews(prev, fresh, nowMs) {
  const cutoff = nowMs - KEEP_DAYS * 86400_000;
  const byKey = new Map();
  const matches = fresh.filter((i) => isHaze(i.title, i.description));
  for (const i of [...prev, ...matches]) {
    const key = storyKey(i);
    const t = Date.parse(i.publishedAt);
    if (!key || !(t >= cutoff) || t > nowMs + 3600_000) continue;
    // Fresh copies win so an edited headline replaces the old one.
    byKey.set(key, { source: i.source, title: i.title, link: i.link, publishedAt: i.publishedAt });
  }
  // publishedAt is always toISOString() (UTC), so string order is time order.
  return [...byKey.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, MAX_ITEMS);
}
