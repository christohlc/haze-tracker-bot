// "What's new" in the Mini App, newest first. Written for users: what they can now do, no
// file names or internals. Give each entry a new, unique `id`; the newest id is what marks
// the header button as seen (see docs/design.md).

export interface ChangelogEntry {
  id: string;
  date: string; // YYYY-MM-DD, SGT
  title: string;
  body: string;
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    id: '2026-10-16-forecast',
    date: '2026-10-16',
    title: 'See the next 24 hours',
    body: 'A PSI forecast from the next hour to the next day, with a likely range and what’s pushing it up or down (also in the chat with /forecast). It’s our model, not an official forecast.',
  },
  {
    id: '2026-10-16-app-alerts',
    date: '2026-10-16',
    title: 'Turn on alerts from here',
    body: 'Get haze alerts with one tap, pick a time for a daily update, or stop them, without typing a command.',
  },
  {
    id: '2026-10-16-new-look',
    date: '2026-10-16',
    title: 'See the haze at a glance',
    body: 'Meet I’m going hazelnuts! The top card is now a sky that clears or turns hazy with the PSI, and regions are shown as bars for the period you pick.',
  },
  {
    id: '2026-10-16-chat-alerts',
    date: '2026-10-16',
    title: 'Haze alerts in your chat',
    body: 'Send /subscribe to get a message when the haze band changes, and /alerts to add a daily update.',
  },
  {
    id: '2026-10-16-dashboard',
    date: '2026-10-16',
    title: 'Check the haze anytime',
    body: 'Send /haze for the PSI by region and NEA’s advice, or /cigs for how many cigarettes’ worth you’ve breathed in. The dashboard adds the past day’s readings, updated every hour.',
  },
];

export const LATEST_ID = CHANGELOG[0].id;
