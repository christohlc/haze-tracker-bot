// @ts-check
// One retry for a request that fails before any response. The platform's fetch gives up after
// about 5 s ("fetch: request failed"), and a feed's CDN is often that slow only on a cache miss,
// so the second try usually comes straight back. HTTP errors are responses, so they aren't retried.
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
