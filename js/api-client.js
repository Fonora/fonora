/**
 * The one way page modules talk to the JSON API.
 *
 * Seven admin pages each carried their own copy of this function, in two variants
 * that differed only in whether they noticed a 401. Sharing it means an expired
 * session is reported the same way everywhere instead of surfacing as a confusing
 * "Request failed" on half the tabs.
 */
import { refreshAuth } from './auth-session.js';

/**
 * @param {string} path
 * @param {RequestInit} [opts]
 * @returns {Promise<any>} the parsed body, or a thrown Error carrying the server's message
 */
export async function api(path, opts = {}) {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(opts.headers ?? {}) },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    await refreshAuth();
    throw new Error('Sign in required');
  }
  if (!res.ok) throw new Error(data.error || res.statusText || 'Request failed');
  return data;
}
