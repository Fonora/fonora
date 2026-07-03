/**
 * Fonoran learning display mode: roman (my language) vs Fonora script (full stack).
 */
const STORAGE_KEY = 'fonoran-learn-display-mode-v1';

/** @typedef {'roman' | 'script'} FonoranDisplayMode */

/** @returns {FonoranDisplayMode} */
export function loadFonoranDisplayMode() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === 'script' ? 'script' : 'roman';
  } catch {
    return 'roman';
  }
}

/** @param {FonoranDisplayMode} mode */
export function saveFonoranDisplayMode(mode) {
  localStorage.setItem(STORAGE_KEY, mode === 'script' ? 'script' : 'roman');
}

/**
 * Wire a roman/script toggle within a panel.
 * @param {string} containerId
 * @param {(mode: FonoranDisplayMode) => void} onChange
 * @param {string} [inputName]
 */
export function setupFonoranDisplayModeToggle(containerId, onChange, inputName = 'fonoran-display-mode') {
  const container = document.getElementById(containerId);
  if (!container) return;

  const current = loadFonoranDisplayMode();
  container.querySelectorAll(`input[type="radio"][name="${inputName}"]`).forEach((input) => {
    if (!(input instanceof HTMLInputElement)) return;
    input.checked = input.value === current;
    input.addEventListener('change', () => {
      if (!input.checked) return;
      const mode = /** @type {FonoranDisplayMode} */ (input.value === 'script' ? 'script' : 'roman');
      saveFonoranDisplayMode(mode);
      onChange(mode);
    });
  });

  onChange(current);
}
