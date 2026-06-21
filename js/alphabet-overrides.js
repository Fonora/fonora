const STORAGE_KEY = 'fonora-alphabet-overrides';

export function loadAlphabetOverrides() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function saveAlphabetOverrides(overrides) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
}

export function clearAlphabetOverrides() {
  localStorage.removeItem(STORAGE_KEY);
}

export function hasAlphabetOverrides() {
  return Object.keys(loadAlphabetOverrides()).length > 0;
}
