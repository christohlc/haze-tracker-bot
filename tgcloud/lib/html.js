// @ts-check
// HTML entities in and out, for text from outside feeds and for Telegram HTML. Pure.

/** @type {Record<string, string>} */
const NAMED = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', micro: 'µ',
};

/** Named and numeric entities → characters; unknown ones stay as they are. @param {string} s */
export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = /x/i.test(e[1]) ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : m;
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

/** Text that's safe inside Telegram HTML, attributes included. @param {string} s */
export const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// The Serverless runtime has no URL global, so links are split by hand: https only,
// host (anything before / ? #, so user@host or host:port never match), then path.
export const HTTPS_LINK = /^https:\/\/([^/?#]+)([^?#]*)/i;

/**
 * The https address of a link on the page at `base`, for the kinds NEA writes: absolute,
 * "/root/…" or "same-folder.png", split by hand with HTTPS_LINK. Null for anything else
 * (another scheme, "//host", "./", "../", "?…", "#…").
 * @param {string} href @param {unknown} base
 */
export function resolveUrl(href, base) {
  if (HTTPS_LINK.test(href)) return href;
  const m = typeof base === 'string' ? base.match(HTTPS_LINK) : null;
  if (!m || !href || /^(?:[a-z][a-z\d+.-]*:|\/\/|[.?#])/i.test(href)) return null;
  const folder = href.startsWith('/') ? '' : m[2].replace(/[^/]*$/, '') || '/';
  return `https://${m[1]}${folder}${href}`;
}
