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

/** Telegram refused the request as sent (400). @param {unknown} e */
export function isBadRequest(e) {
  return e instanceof BotApiError && e.code === 400;
}

/** The group became a supergroup: its new chat id, else undefined. @param {unknown} e @returns {number | undefined} */
export function movedTo(e) {
  return e instanceof BotApiError ? e.parameters?.migrate_to_chat_id : undefined;
}

/** The forum topic the message was for has been deleted. @param {unknown} e */
export function isTopicGone(e) {
  return isBadRequest(e) && /thread not found/i.test(/** @type {any} */ (e).description);
}

/** For logs: the Bot API code and description, never the chat. @param {unknown} e */
export const describeError = (e) => (e instanceof BotApiError ? `${e.code} ${e.description}` : String(e));
