// @ts-check
// The bot is resting between haze seasons (November 2026). While RETIRED, /haze, inline mode,
// the Mini App and the tick all stand down, so nobody is shown a stale reading as if it were
// current; /stop still deletes a chat's data. Pure: the Mini App imports it.
//
// Retiring took `npm run deploy` and `npx wrangler@4 deploy --config cron/wrangler.jsonc` (with
// `"crons": []`, which removes the Worker's triggers).
// To bring it back: set RETIRED to false, put back the `schedule` in .github/workflows/tick.yml
// and the crons in cron/wrangler.jsonc (reverting the retiring commit does all three), run
// `npm run psi:history`, then the same two deploys. Inline answers may say “resting” for up to an
// hour after that (Telegram caches them).

export const RETIRED = true;

/** NEA's haze site, where people should look instead. */
export const NEA_HAZE_URL = 'https://www.haze.gov.sg/';

const BODY = 'Singapore’s air has cleared, so the bot no longer checks NEA’s readings or sends alerts.';

/** The reply to any command in chat (Telegram HTML). */
export const RETIRED_TEXT = [
  '<b>I’m going hazelnuts!</b> is resting.',
  '',
  `${BODY} For the latest PSI, see <a href="${NEA_HAZE_URL}">haze.gov.sg</a>.`,
  '',
  '<i>/stop deletes this chat’s ID and alert settings.</i>',
].join('\n');

/** The one inline-mode result: what gets sent when someone taps it. */
export const retiredInlineResults = () => [
  {
    type: 'article',
    id: 'retired',
    title: 'I’m going hazelnuts! is resting',
    description: 'No more haze readings for now. Tap to send a link to NEA’s haze site.',
    input_message_content: {
      message_text: `For Singapore’s latest PSI, see NEA’s haze site: <a href="${NEA_HAZE_URL}">haze.gov.sg</a>.`,
      parse_mode: 'HTML',
    },
  },
];

/** The pop-up for a button on an old message. */
export const RETIRED_ALERT = 'The bot is resting, so alerts are off. Send /stop to delete this chat’s settings.';

/** The Mini App's whole screen. */
export const RETIRED_SCREEN = { title: 'Resting till the next haze', body: BODY, link: 'Latest PSI at haze.gov.sg' };
