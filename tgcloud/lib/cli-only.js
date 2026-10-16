// Endpoints like tick/admin are operator tools, not Mini App APIs. A real Mini App call
// always carries platform-verified init data; `npx tgcloud run` (which needs the bot's
// CLI token) does not. Refuse anything that came from a Telegram user.
// Copied from telegram-assistant-bot (pre-Railway).

import { EndpointError } from 'sdk';

export function requireCli(ctx) {
  if (ctx?.initData) throw new EndpointError('Not available', { code: 'CLI_ONLY' });
}
