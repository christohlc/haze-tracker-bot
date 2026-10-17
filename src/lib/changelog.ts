// "What's new" in the Mini App, newest first. Rules for entries: docs/design.md#whats-new.

export interface ChangelogEntry {
  id: string;
  date: string; // YYYY-MM-DD, SGT
  title: string;
  body: string;
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    id: '2026-10-17-my-area',
    date: '2026-10-17',
    title: 'See the haze where you are',
    body: 'Tap the area at the top to pick your part of Singapore, or use your location. The reading, what to do and your alerts then follow your area instead of the worst one.',
  },
  {
    id: '2026-10-17-outside-now',
    date: '2026-10-17',
    title: 'Know if it’s OK to go out',
    body: 'What to do now opens with one plain answer for right now, following whichever of NEA’s readings is stricter, and whether the haze is rising or easing. Switch to Vulnerable people for the stricter advice for the elderly, children, pregnant women and anyone with lung or heart disease.',
  },
  {
    id: '2026-10-17-haze-picture-map',
    date: '2026-10-17',
    title: 'A clearer haze picture',
    body: 'In the picture you share, each region now sits where it is on the map, and the overall reading is shown in its band’s colour.',
  },
  {
    id: '2026-10-17-polish',
    date: '2026-10-17',
    title: 'Clearer alert settings',
    body: 'Alerts now have proper on/off switches that change the moment you tap them, and “Stop all alerts” checks with you first. The region list, chart and cigarette count are also easier to read.',
  },
  {
    id: '2026-10-16-groups',
    date: '2026-10-16',
    title: 'Get haze alerts in your group',
    body: 'Add the bot to a group chat and an admin can turn on alerts for everyone. Check the haze from the command menu and only you see the answer.',
  },
  {
    id: '2026-10-16-fullscreen',
    date: '2026-10-16',
    title: 'See more without scrolling',
    body: 'On your phone, the app now opens full screen, so more of the readings fit before you scroll.',
  },
  {
    id: '2026-10-16-nea-outlook',
    date: '2026-10-16',
    title: 'Check NEA’s forecast for tomorrow',
    body: 'During a haze episode, What’s ahead shows NEA’s official 24-hour PSI forecast. For the next few hours there’s now a simple likely range from recent readings. Over the past four years it held the actual reading about 8 times in 10.',
  },
  {
    id: '2026-10-16-breaking-news',
    date: '2026-10-16',
    title: 'Hear about school closures first',
    body: 'Alerts now include breaking haze news the bot picks from the headlines: schools closing, outdoor activities called off, free masks, and NEA’s 24-hour PSI turning Very unhealthy or Hazardous. It’s on if you have alerts, and you can turn it off under Alerts.',
  },
  {
    id: '2026-10-16-tabs',
    date: '2026-10-16',
    title: 'Find things faster with tabs',
    body: 'The app is now split into Now, Outlook and More, so today’s readings come first and you don’t have to scroll past everything else. What’s new lives under More.',
  },
  {
    id: '2026-10-16-wind-rain',
    date: '2026-10-16',
    title: 'See where the wind is coming from',
    body: 'Live wind and rain from NEA’s weather stations, and whether the wind is blowing in from the areas where haze fires usually burn.',
  },
  {
    id: '2026-10-16-haze-picture',
    date: '2026-10-16',
    title: 'Share a picture of the haze',
    body: 'Every region’s 24-hour PSI and 1-hour PM2.5 on one map, ready to send to a chat. /haze and the alerts now come with it too.',
  },
  {
    id: '2026-10-16-live-views',
    date: '2026-10-16',
    title: 'See the haze for yourself',
    body: 'Live pictures from the road cameras at Woodlands, Tuas and Sentosa, plus satellite pictures of the smoke and a map of fire hotspots around the region.',
  },
  {
    id: '2026-10-16-privacy',
    date: '2026-10-16',
    title: 'Know what we keep',
    body: 'If you turn on alerts, the bot keeps only your chat ID and alert settings. Send /stop to delete them. /help says the same.',
  },
  {
    id: '2026-10-16-news',
    date: '2026-10-16',
    title: 'Haze in the news',
    body: 'The latest haze stories from The Straits Times, CNA and Mothership, in one place. Tap a headline to read it on their site.',
  },
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
