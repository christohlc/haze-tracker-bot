// @ts-check
// How a failed Bot API call should be treated. Shared by alerts, the summary card and endpoints.

import { BotApiError } from 'sdk';

/** The bot can't message this chat (blocked, never started, left, deleted). @param {unknown} e */
export function isUnreachable(e) {
  return e instanceof BotApiError && (e.code === 403 || /chat not found/i.test(e.description));
}

/** Telegram's rate limit; `parameters.retry_after` says how long to wait. @param {unknown} e */
export function isRateLimited(e) {
  return e instanceof BotApiError && e.code === 429;
}
