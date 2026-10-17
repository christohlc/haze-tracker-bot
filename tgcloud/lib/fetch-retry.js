// @ts-check
// Retry a request once if it throws: the platform's fetch gives up after about 5 s (see the
// alerts note in AGENTS.md). fetch resolves on HTTP errors, so a 4xx/5xx isn't retried.
// Pure (the request is passed in) so node --test can load it.

/** How long the platform's fetch waits before it throws "fetch: request failed". */
const FETCH_GIVES_UP_MS = 5_000;

/**
 * @template T
 * @param {() => Promise<T>} request
 * @param {number} [deadline] a caller's time budget: no retry that could run past it
 * @returns {Promise<T>}
 */
export async function retryOnce(request, deadline = Infinity) {
  try {
    return await request();
  } catch (e) {
    if (Date.now() + FETCH_GIVES_UP_MS > deadline) throw e;
    return request();
  }
}
