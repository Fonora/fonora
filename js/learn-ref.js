/**
 * First-touch referral capture for Learn share links (?ref=usr_…).
 */

const STORAGE_KEY = 'fonora-learn-ref';
const REF_PATTERN = /^usr-[a-z0-9-]+$/i;

/** @param {string | null | undefined} ref */
export function isValidReferralId(ref) {
  return typeof ref === 'string' && REF_PATTERN.test(ref);
}

/** @returns {string | null} */
export function getStoredLearnRef() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isValidReferralId(value) ? value : null;
  } catch {
    return null;
  }
}

/** Persist ?ref= from the URL (first-touch only) and clean the address bar. */
export function captureLearnRef() {
  try {
    if (getStoredLearnRef()) return;
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (!isValidReferralId(ref)) return;
    localStorage.setItem(STORAGE_KEY, ref);
    params.delete('ref');
    const query = params.toString();
    const next = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
    history.replaceState(null, '', next);
  } catch {
    /* ignore storage / history errors */
  }
}

/**
 * Append stored referral to OAuth login URLs.
 * @param {string | null | undefined} url
 */
export function appendRefToAuthUrl(url) {
  const ref = getStoredLearnRef();
  if (!ref || !url) return url ?? '/auth/google';
  try {
    const parsed = new URL(url, window.location.origin);
    parsed.searchParams.set('ref', ref);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}
