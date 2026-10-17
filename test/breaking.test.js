import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  classifyStory,
  hazeGateOpen,
  MAX_NEWS_PER_DAY,
  pickBreaking,
  psiCrossing,
  pruneEvents,
  sendableEvents,
  storyTopic,
} from '../tgcloud/lib/breaking-rules.js';
import { formatBreaking } from '../tgcloud/lib/format.js';

const H = 3600_000;
const NOW = Date.parse('2026-10-16T06:00:00Z'); // 2 pm SGT
const ago = (h) => new Date(NOW - h * H).toISOString();

test('headlines that change daily life are breaking', () => {
  const cases = {
    'MOE: All primary and secondary schools to close on Friday as PSI hits hazardous': 'schools',
    'Schools to switch to home-based learning amid haze': 'schools',
    'Haze: Pre-schools suspend outdoor play': 'schools',
    'Outdoor activities suspended at all ActiveSG venues due to haze': 'outdoor',
    'Marathon called off due to haze': 'outdoor',
    // Live headlines from 16 Oct 2026.
    'Purple Parade among events postponed, cancelled amid haze concerns': 'outdoor',
    'ActiveSG closes outdoor facilities across most of Singapore as haze worsens': 'outdoor',
    'Haze prompts closure of all outdoor and non-air-conditioned ActiveSG facilities': 'outdoor',
    'NS outdoor training halted as PSI climbs': 'outdoor',
    'Free N95 masks to be distributed to every household': 'masks',
    'MOM issues haze advisory for employers with outdoor workers': 'work',
  };
  for (const [title, topic] of Object.entries(cases)) assert.equal(storyTopic(title), topic, title);
});

test('denials, reopenings, questions, features and other countries are not', () => {
  for (const title of [
    // Both matched on the first live run (16 Oct 2026): a feature and an explainer.
    'Cancelled classes, lost income: Haze takes a toll on outdoor sports coaches in Singapore',
    'Are two free N95 masks enough? What to know about wearing and reusing them amid the haze',
    'How to protect your kids when schools close for haze',
    'Commentary: Schools should close sooner when the haze hits',
    'In pictures: Outdoor events called off as haze blankets Singapore',
    'Schools will not close despite haze, says MOE',
    'No plans for HBL: MOE',
    'Schools to remain open as PSI eases',
    'Outdoor activities resume as haze clears',
    'Will schools close if the haze gets worse?',
    'Johor schools shut as haze worsens',
    'Malaysia closes 1,000 schools over haze',
    'Fake message about school closures circulating, says MOE',
    'MOE prepared to close schools if PSI hits hazardous',
    'Organisers considering calling off marathon due to haze',
    'No decision yet to cancel race amid haze',
    'Schools could close next week as haze worsens',
    'Haze in Singapore: what you need to know',
  ]) {
    assert.equal(storyTopic(title), null, title);
  }
});

test('classifyStory needs haze and a recent story', () => {
  assert.equal(classifyStory({ title: 'Schools to close on Friday as haze worsens', publishedAt: ago(1) }, NOW), 'schools');
  // Haze only in the description still counts.
  assert.equal(classifyStory({ title: 'All schools to close on Friday', description: 'PSI in hazardous range', publishedAt: ago(1) }, NOW), 'schools');
  assert.equal(classifyStory({ title: 'Schools close for Deepavali holiday', publishedAt: ago(1) }, NOW), null, 'not haze');
  assert.equal(classifyStory({ title: 'Schools to close on Friday as haze worsens', publishedAt: ago(7) }, NOW), null, 'too old');
});

test('the haze gate opens above Moderate on either PSI', () => {
  assert.equal(hazeGateOpen({ worst: { psi24h: { value: 80 }, psi3h: { value: 90 } } }), false);
  assert.equal(hazeGateOpen({ worst: { psi24h: { value: 101 }, psi3h: { value: 90 } } }), true);
  assert.equal(hazeGateOpen({ worst: { psi24h: null, psi3h: { value: 140 } } }), true);
  assert.equal(hazeGateOpen(null), false);
});

const story = (source, path, title, h = 1) => ({
  source,
  title,
  link: `https://${{ st: 'www.straitstimes.com', cna: 'www.channelnewsasia.com', mothership: 'mothership.sg' }[source]}/${path}`,
  publishedAt: ago(h),
});

test('one event per topic per day, from the first publisher', () => {
  const fresh = [
    story('cna', 'singapore/schools-close', 'Schools to close on Friday as haze worsens', 1),
    story('st', 'singapore/schools-shut', 'All schools shut on Friday due to haze', 2),
    story('mothership', '2026/10/marathon', 'Marathon called off due to haze', 1),
  ];
  const events = pickBreaking([], fresh, NOW);
  assert.deepEqual(
    events.map((e) => [e.topic, e.source]),
    [
      ['schools', 'st'],
      ['outdoor', 'mothership'],
    ],
  );
  // The next fetch sees the same stories again: nothing new.
  assert.deepEqual(pickBreaking(events, fresh, NOW + H), []);
});

test('at most MAX_NEWS_PER_DAY news events a day; the next day starts afresh', () => {
  const fresh = [
    story('st', 'a', 'Schools to close as haze worsens'),
    story('st', 'b', 'Marathon called off due to haze'),
    story('st', 'c', 'Free N95 masks to be distributed amid haze'),
    story('st', 'd', 'MOM issues haze advisory for outdoor workers'),
  ];
  const first = pickBreaking([], fresh, NOW);
  assert.equal(first.length, MAX_NEWS_PER_DAY);
  const tomorrow = NOW + 24 * H;
  const later = [story('st', 'e', 'Schools to close again as haze worsens')].map((s) => ({ ...s, publishedAt: new Date(tomorrow - H).toISOString() }));
  assert.equal(pickBreaking(first, later, tomorrow).length, 1);
});

test('stories off the publisher’s site are skipped', () => {
  const s = { ...story('st', 'x', 'Schools to close as haze worsens'), link: 'https://evil.example/x' };
  assert.deepEqual(pickBreaking([], [s], NOW), []);
});

test('official 24h PSI: rising into Very unhealthy or Hazardous is an event, once', () => {
  let { band, event } = psiCrossing(null, 250, NOW);
  assert.equal(event, null, 'first reading only sets the band');
  ({ band, event } = psiCrossing({ id: 'unhealthy', at: 0 }, 210, NOW));
  assert.equal(event?.band, 'very_unhealthy');
  assert.equal(event?.value, 210);
  const prev = band;
  ({ event } = psiCrossing(prev, 220, NOW + H));
  assert.equal(event, null, 'same band');
  ({ band, event } = psiCrossing(prev, 190, NOW + H));
  assert.equal(band, prev, 'drops wait');
  assert.equal(event, null);
  ({ event } = psiCrossing({ id: 'very_unhealthy', at: 0 }, 320, NOW));
  assert.equal(event?.band, 'hazardous');
  ({ event } = psiCrossing({ id: 'moderate', at: 0 }, 150, NOW));
  assert.equal(event, null, 'Unhealthy is a band alert, not breaking');
  // Down for over 3 hours and back up the same day: already announced today.
  const first = psiCrossing({ id: 'unhealthy', at: 0 }, 210, NOW).event;
  assert.equal(psiCrossing({ id: 'unhealthy', at: 0 }, 215, NOW + 5 * H, [first]).event, null);
  assert.equal(psiCrossing({ id: 'unhealthy', at: 0 }, 215, NOW + 24 * H, [first]).event?.band, 'very_unhealthy', 'next day counts');
});

test('prune and sendable windows', () => {
  const events = [
    { id: 'a', kind: 'news', at: NOW - 50 * H },
    { id: 'b', kind: 'news', at: NOW - 13 * H },
    { id: 'c', kind: 'news', at: NOW - 2 * H, cancelled: true },
    { id: 'd', kind: 'news', at: NOW - 1 * H },
  ];
  assert.deepEqual(pruneEvents(events, NOW).map((e) => e.id), ['b', 'c', 'd']);
  assert.deepEqual(sendableEvents(events, NOW).map((e) => e.id), ['d']);
});

test('formatBreaking escapes the headline and says the PSI is NEA’s', () => {
  const snap = { asOf: '2026-10-16T14:00:00+08:00', worst: { psi24h: { value: 210, name: 'West' }, psi3h: { value: 230 }, pm25: { value: 120 } } };
  const news = formatBreaking({ kind: 'news', title: 'Schools <b>close</b> & more', link: 'https://www.straitstimes.com/x?a="1"', source: 'st' }, snap);
  assert.match(news, /Breaking: Schools &lt;b&gt;close&lt;\/b&gt; &amp; more/);
  assert.match(news, /href="https:\/\/www\.straitstimes\.com\/x\?a=&quot;1&quot;"/);
  assert.match(news, /The Straits Times/);
  assert.match(news, /Official 24-hr PSI <b>210<\/b>/);
  const psi = formatBreaking({ kind: 'psi24', band: 'hazardous', value: 320 }, snap);
  assert.match(psi, /Official 24-hr PSI now Hazardous/);
});
