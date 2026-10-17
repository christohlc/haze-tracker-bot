// @ts-check
// Retry a request once if it throws: the platform's fetch gives up after about 5 s (see the
// alerts note in AGENTS.md). fetch resolves on HTTP errors, so a 4xx/5xx isn't retried.
// Pure (the request is passed in) so node --test can load it.

/** How long the platform's fetch waits before it throws "fetch: request failed". */
export const FETCH_GIVES_UP_MS = 5_000;

/**
 * @template T
 * @param {() => Promise<T>} request
 * @param {number} [retryUntil] no retry once Date.now() reaches this (a caller with a time budget)
 * @returns {Promise<T>}
 */
export async function retryOnce(request, retryUntil = Infinity) {
  try {
    return await request();
  } catch (e) {
    if (Date.now() >= retryUntil) throw e;
    return request();
  }
}
