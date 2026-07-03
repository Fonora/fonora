/**
 * Language selector for Script learning exercises (multi-language ready).
 */
import { escapeHtml } from './utils.js';
import {
  LANGUAGE_OPTIONS,
  loadLanguagePreference,
  saveLanguagePreference,
} from './learning-locale.js';

function resolveLanguageCode() {
  const saved = loadLanguagePreference();
  return LANGUAGE_OPTIONS.some((item) => item.code === saved) ? saved : 'en';
}

/**
 * @param {HTMLSelectElement} select
 */
export function populateLearningLanguageSelect(select) {
  const saved = resolveLanguageCode();
  select.innerHTML = LANGUAGE_OPTIONS.map(
    (item) =>
      `<option value="${escapeHtml(item.code)}"${item.code === saved ? ' selected' : ''}>${escapeHtml(item.label)}</option>`,
  ).join('');
}

/**
 * @param {string} selectId
 * @param {() => void} [onChange]
 */
export function setupLearningLanguageSelect(selectId, onChange) {
  const select = document.getElementById(selectId);
  if (!select) return;

  populateLearningLanguageSelect(select);

  if (select.dataset.languageWired !== '1') {
    select.dataset.languageWired = '1';
    select.addEventListener('change', () => {
      saveLanguagePreference(select.value);
      onChange?.();
    });
  }
}

/** @param {string} selectId */
export function ensureLearningLanguageSelect(selectId) {
  const select = document.getElementById(selectId);
  if (!select) return;
  if (select.options.length < LANGUAGE_OPTIONS.length) {
    populateLearningLanguageSelect(select);
  }
}

/**
 * @param {string} noteId
 */
export function updateLearningLanguageNote(noteId) {
  const note = document.getElementById(noteId);
  if (!note) return;
  const lang = loadLanguagePreference();
  if (lang === 'en') {
    note.hidden = true;
    note.textContent = '';
    return;
  }
  note.hidden = false;
  note.textContent =
    'Practice words use the English list for now; IPA pronunciation follows your selected language where supported.';
}
