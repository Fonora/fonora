/**
 * Theme preference: system (default), light, or dark via data-theme on <html>.
 */

const STORAGE_KEY = 'fonora-theme';

/** @returns {'system' | 'light' | 'dark'} */
export function getStoredTheme() {
  const value = localStorage.getItem(STORAGE_KEY);
  if (value === 'light' || value === 'dark' || value === 'system') return value;
  return 'system';
}

/** @returns {boolean} */
export function isDarkTheme() {
  const explicit = document.documentElement.getAttribute('data-theme');
  if (explicit === 'dark') return true;
  if (explicit === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** @param {'system' | 'light' | 'dark'} theme */
export function applyTheme(theme = getStoredTheme()) {
  const root = document.documentElement;
  if (theme === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', theme);
  }
  document.dispatchEvent(new CustomEvent('fonora-themechange', { detail: { theme } }));
}

/** @returns {'system' | 'light' | 'dark'} */
export function cycleTheme() {
  const current = getStoredTheme();
  let next;
  if (current === 'system') {
    next = isDarkTheme() ? 'light' : 'dark';
  } else {
    const order = ['system', 'light', 'dark'];
    next = order[(order.indexOf(current) + 1) % order.length];
  }
  localStorage.setItem(STORAGE_KEY, next);
  applyTheme(next);
  return next;
}

applyTheme();
