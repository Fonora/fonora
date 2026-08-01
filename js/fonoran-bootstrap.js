/**
 * One fetch of the lab bootstrap per page.
 *
 * Seven modules asked for `/api/fonoran/bootstrap` independently and none of them
 * shared, so a single visit to the home page requested the same payload many times.
 * The endpoint is `no-store`, so the browser could not collapse them either.
 *
 * Caching the promise rather than the resolved value is the part that matters. The
 * callers all start during page setup, within milliseconds of each other, so a
 * result cache is still empty when the second one looks and every one of them
 * misses.
 *
 * Payload is lab + health only; English lexicon is `/api/fonoran/lexicon` on demand.
 */
let pending = null;

/**
 * @param {{ refresh?: boolean }} [options] `refresh` re-reads after the lab changes.
 * @returns {Promise<{ lab: object, health?: object }>}
 */
export function loadFonoranBootstrap({ refresh = false } = {}) {
  if (refresh) pending = null;
  if (!pending) {
    pending = fetch('/api/fonoran/bootstrap', { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .catch((err) => {
        // A failed load must not be remembered, or the page can never recover.
        pending = null;
        throw err;
      });
  }
  return pending;
}
