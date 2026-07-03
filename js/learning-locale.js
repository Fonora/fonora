/**
 * Learning locale wrapper — keeps exercise prompts multi-language ready.
 */
import {
  LANGUAGE_OPTIONS,
  loadLanguagePreferences,
  loadLanguagePreference,
  saveLanguagePreference,
} from './language-preferences.js';

export { LANGUAGE_OPTIONS, loadLanguagePreferences, loadLanguagePreference, saveLanguagePreference };

/** @param {string} [code] */
export function languageLabelForCode(code) {
  const lang = code || loadLanguagePreference();
  return LANGUAGE_OPTIONS.find((item) => item.code === lang)?.label || lang;
}

/**
 * @param {string} template e.g. "Type the {language} word"
 * @param {{ language?: string }} [vars]
 */
export function learningPrompt(template, vars = {}) {
  const language = vars.language || languageLabelForCode();
  return template.replace(/\{language\}/g, language);
}
