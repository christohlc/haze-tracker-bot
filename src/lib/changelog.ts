// "What's new" in the Mini App, newest first. Rules for entries: docs/design.md#whats-new.

export interface ChangelogEntry {
  id: string;
  date: string; // YYYY-MM-DD, SGT
  title: string;
  body: string;
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    id: '2026-10-18-opens-faster',
    date: '2026-10-18',
    title: 'Opens straight away',
    body: 'The dashboard now shows the last readings it loaded on your phone the moment you open it, then swaps in the newest ones. While it says “checking…” at the top, the update is still on its way.',
  },
  {
    id: '2026-10-18-pass-it-on',
    date: '2026-10-18',
    title: 'Pass the bot on',
    body: 'Send /start to the bot for two new buttons: add it to a group so everyone there gets the alerts, or share the haze update in any chat. The pictures now carry the bot’s name, so anyone they’re forwarded to can find it.',
  },
  {
    id: '2026-10-18-bottom-tabs',
    date: '2026-10-18',
    title: 'Tabs within thumb reach',
    body: 'Now, Outlook and More moved to a bar at the bottom of the screen: tap a tab, or slide your finger along the bar. “Get haze alerts” is now a button in the Alerts card.',
  },
  {
    id: '2026-10-18-where-its-worst',
    date: '2026-10-18',
    title: 'Updates say where it’s worst',
    body: 'The haze picture shows each region’s own band instead of one for the whole island, with the last hour’s PM2.5 at the foot of each region, coloured by its own band. The message under it says which regions are in which band, like “Very unhealthy in West, Unhealthy elsewhere”.',
  },
  {
    id: '2026-10-18-region-morph',
    date: '2026-10-18',
    title: 'Smoother moves into a region',
    body: 'Tap a region in Around the island and its page slides in, like a new screen, then slides back when you leave. Taps that open something now give a light buzz.',
  },
  {
    id: '2026-10-18-living-map',
    date: '2026-10-18',
    title: 'Fires and wind you can see moving',
    body: 'On Outlook, fires on the map glow and a ring pulses round Singapore. The wind dial streams the way the air is moving, and rain falls on it when it’s raining.',
  },
  {
    id: '2026-10-18-chart-draw',
    date: '2026-10-18',
    title: 'Charts that draw themselves in',
    body: 'History charts now draw themselves in when you reach them, and a soft pulse marks the latest hour.',
  },
  {
    id: '2026-10-18-living-sky',
    date: '2026-10-18',
    title: 'A sky that shows the haze',
    body: 'The reading up top now sits in a sky with haze slowly drifting across it. It thickens as the PSI rises, and on a clear day the sun comes out.',
  },
  {
    id: '2026-10-18-shorter-copy',
    date: '2026-10-18',
    title: 'Read alerts at a glance',
    body: 'Alerts say each number once, with times like 1 pm, and /alerts settings fit on one screen. What to do shows mask and window tips only once they apply.',
  },
  {
    id: '2026-10-18-haze-message',
    date: '2026-10-18',
    title: 'A shorter /haze message',
    body: 'The band and your area come first, then what to do, with advice for vulnerable people on a line of its own.',
  },
  {
    id: '2026-10-17-inline',
    date: '2026-10-17',
    title: 'Share the haze in any chat',
    body: 'Type the bot’s @name in any chat to send the haze picture or a short summary. Add a region, like “west”, for its readings.',
  },
  {
    id: '2026-10-17-offline',
    date: '2026-10-17',
    title: 'Readings on a patchy connection',
    body: 'If the latest readings can’t load, you’ll see the last ones you opened, with the time they’re from, instead of an error.',
  },
  {
    id: '2026-10-17-region-week',
    date: '2026-10-17',
    title: 'Look back over a week',
    body: 'Tap a region in Around the island to see its readings and the past 7 days. The history chart on Outlook can show 7 days too.',
  },
  {
    id: '2026-10-17-hero-ahead',
    date: '2026-10-17',
    title: 'The next few hours up top',
    body: 'When we can estimate them, our ranges for the next few hours’ PSI now sit right under the reading. They’re our calculation, not NEA’s. Tap them for the details.',
  },
  {
    id: '2026-10-17-alert-level',
    date: '2026-10-17',
    title: 'Choose when alerts reach you',
    body: 'Hear about band changes only from Unhealthy up, and you’ll still be told when it clears. Turn on Quiet at night and alerts from 11 pm to 7 am SGT arrive without sound.',
  },
  {
    id: '2026-10-17-one-alert',
    date: '2026-10-17',
    title: 'Clearer haze alerts',
    body: 'Alerts now name your area and give NEA’s 24-hour PSI next to ours, so they match the picture. When the official reading jumps at the same time, you get one message instead of two.',
  },
  {
    id: '2026-10-17-area-first',
    date: '2026-10-17',
    title: 'Your area at the top',
    body: 'Around the island now lists your area first, highlighted, so your reading is the first one you see.',
  },
  {
    id: '2026-10-17-daily-forecast',
    date: '2026-10-17',
    title: 'The forecast in your daily update',
    body: 'On hazy days, the daily haze update now comes with the forecast picture too.',
  },
  {
    id: '2026-10-17-forecast-picture',
    date: '2026-10-17',
    title: 'The forecast as a picture',
    body: 'Send /forecast to the bot and it now answers with a picture of NEA’s forecast dial and the next few hours, ready to share.',
  },
  {
    id: '2026-10-17-ahead-colour',
    date: '2026-10-17',
    title: 'See what’s ahead at a glance',
    body: 'NEA’s forecast is now a colour dial like the one on haze.gov.sg, with NEA’s forecast numbers and a mark at today’s reading, and each of the next few hours shows its likely range in band colours.',
  },
  {
    id: '2026-10-17-my-area',
    date: '2026-10-17',
    title: 'See the haze where you are',
    body: 'Tap the area at the top to pick your part of Singapore, or use your location. The reading, what to do and your alerts then follow your area instead of the worst one.',
  },
  {
    id: '2026-10-17-one-answer',
    date: '2026-10-17',
    title: 'One answer on what to do',
    body: 'The advice under the big number now matches What to do, and follows your General public or Vulnerable people choice. It no longer changes when you switch between 1, 3 and 24 hours.',
  },
  {
    id: '2026-10-17-outside-now',
    date: '2026-10-17',
    title: 'Know if it’s OK to go out',
    body: 'What to do now opens with one plain answer for right now, following whichever of NEA’s readings is stricter, and whether the haze is rising or easing. Switch to Vulnerable people for the stricter advice for the elderly, children, pregnant women and anyone with lung or heart disease.',
  },
  {
    id: '2026-10-17-haze-map',
    date: '2026-10-17',
    title: 'See where the haze is coming from',
    body: 'The Outlook tab now has NEA’s map of fires and smoke haze around Singapore, with the wind that carries it and NEA’s own write-up of the haze situation.',
  },
  {
    id: '2026-10-17-wind-forecast',
    date: '2026-10-17',
    title: 'See which way the wind will blow',
    body: 'Wind and rain now shows NEA’s wind forecast for today and the next four days. During a haze episode, it also tells you when the forecast wind could bring smoke from Sumatra.',
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
    body: 'A PSI forecast from the next hour to the next day, with a likely range and what’s pushing it up or down (also in the chat with /forecast). It’s our estimate, not an official forecast.',
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
