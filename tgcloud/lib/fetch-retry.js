// @ts-check
// Retry a request once if it throws: the platform's fetch gives up after about 5 s (see the
// alerts note in AGENTS.md). fetch resolves on HTTP errors, so a 4xx/5xx isn't retried.
// Pure (the request is passed in) so node --test can load it.

/**
 * @template T
 * @param {() => Promise<T>} request
 * @returns {Promise<T>}
 */
export async function retryOnce(request) {
  try {
    return await request();
  } catch {
    return request();
  }
}
