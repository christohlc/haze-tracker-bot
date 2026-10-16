import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isHaze, mergeNews, parseFeed } from '../tgcloud/lib/news-parse.js';

const ST = `<rss><channel><title>ST</title>
    <item>
      <title>Purple Parade postponed to first half of 2027 amid haze concerns</title>
      <link>https://www.straitstimes.com/singapore/purple-parade-postponed</link>
      <description>&lt;p&gt;A new event date will be shared once confirmed.&lt;/p&gt;</description>
      <pubDate>Fri, 16 Oct 2026 15:40:00 +0800</pubDate>
    </item>
  </channel></rss>`;

const CNA = `<rss><channel>
    <item>
  <title>NTU student creates website that estimates how many cigarettes&#039; worth of haze you&#039;ve breathed in</title>
  <link>https://www.channelnewsasia.com/singapore/ntu-haze-website-123</link>
    <description>Coaches say it&amp;nbsp;is hard.</description>
  <pubDate>Fri, 16 Oct 2026 15:12:15 +0800</pubDate>
    <media:thumbnail url="https://dam.mediacorp.sg/x.jpg" />
    </item>
  </channel></rss>`;

const MOTHERSHIP = `<rss><channel>
                <item>
                    <title>ActiveSG closes outdoor facilities in east &amp; central due to haze</title>
                    <link>https://mothership.sg/2026/10/activesg-haze/</link>
                    <pubDate>2026-10-16T10:09:13</pubDate>
                    <description>
                        <![CDATA[ Facilities will reopen when <b>air quality</b> improves. ]]>
                    </description>
                </item>
  </channel></rss>`;

test('parseFeed reads each publisher’s shape', () => {
  const [st] = parseFeed(ST, 'st');
  assert.equal(st.title, 'Purple Parade postponed to first half of 2027 amid haze concerns');
  assert.equal(st.publishedAt, '2026-10-16T07:40:00.000Z');
  assert.equal(st.description, 'A new event date will be shared once confirmed.');

  const [cna] = parseFeed(CNA, 'cna');
  assert.equal(cna.title, 'NTU student creates website that estimates how many cigarettes’ worth of haze you’ve breathed in'.replace(/’/g, "'"));
  assert.equal(cna.link, 'https://www.channelnewsasia.com/singapore/ntu-haze-website-123');

  const [ms] = parseFeed(MOTHERSHIP, 'mothership');
  assert.equal(ms.title, 'ActiveSG closes outdoor facilities in east & central due to haze');
  assert.equal(ms.publishedAt, '2026-10-16T02:09:13.000Z', 'no-offset dates are SGT');
  assert.equal(ms.description, 'Facilities will reopen when air quality improves.');
});

test('parseFeed skips items without a title, link or date', () => {
  assert.deepEqual(parseFeed('<item><title>x</title><pubDate>nope</pubDate></item>', 'st'), []);
});

test('isHaze', () => {
  for (const t of ['Haze in S’pore: PSI very unhealthy', 'Hazy skies ahead', 'PM2.5 readings high', 'Air quality worsens', 'Hotspots detected in Sumatra', 'Transboundary pollution law', 'Peatland fires in Riau']) {
    assert.ok(isHaze(t), t);
  }
  for (const t of ['Hazelnut latte sales up', 'Psionic thriller tops box office', 'Fire at HDB block']) {
    assert.ok(!isHaze(t), t);
  }
  assert.ok(isHaze('Sports coaches hit by cancellations', 'Coaches say the haze made it difficult'));
});

const NOW = Date.parse('2026-10-16T08:00:00Z');
const item = (o) => ({ source: 'st', title: 'Haze update', link: 'https://www.straitstimes.com/singapore/a', publishedAt: '2026-10-16T07:00:00Z', ...o });

test('mergeNews keeps haze stories, newest first, without descriptions', () => {
  const out = mergeNews(
    [item({ link: 'https://www.straitstimes.com/singapore/old', publishedAt: '2026-10-15T00:00:00Z' })],
    [item({ description: 'x' }), item({ title: 'Budget day', link: 'https://www.straitstimes.com/singapore/b' })],
    NOW,
  );
  assert.deepEqual(out.map((i) => i.link), ['https://www.straitstimes.com/singapore/a', 'https://www.straitstimes.com/singapore/old']);
  assert.ok(!('description' in out[0]));
});

test('mergeNews dedupes by link, ignoring query and trailing slash', () => {
  const out = mergeNews([item({ title: 'Old haze title' })], [item({ title: 'New haze title', link: 'https://www.straitstimes.com/singapore/a/?utm=rss' })], NOW);
  assert.equal(out.length, 1);
  assert.equal(out[0].title, 'New haze title');
});

test('mergeNews drops stories older than 14 days and caps the list at 30', () => {
  assert.deepEqual(mergeNews([item({ publishedAt: '2026-10-01T00:00:00Z' })], [], NOW), []);
  const many = Array.from({ length: 40 }, (_, i) => item({ link: `https://www.straitstimes.com/singapore/${i}`, publishedAt: new Date(NOW - i * 60_000).toISOString() }));
  const out = mergeNews([], many, NOW);
  assert.equal(out.length, 30);
  assert.equal(out[0].link, 'https://www.straitstimes.com/singapore/0');
});

test('mergeNews only keeps https links on the publisher’s own site', () => {
  const bad = [
    item({ link: 'http://www.straitstimes.com/singapore/a' }),
    item({ link: 'https://evil.example/haze' }),
    item({ source: 'cna', link: 'https://www.straitstimes.com/singapore/a' }),
    item({ link: 'javascript:alert(1)' }),
    item({ link: 'not a url' }),
  ];
  assert.deepEqual(mergeNews([], bad, NOW), []);
});
