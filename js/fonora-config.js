/** Default markdown paths — symbols are never hardcoded here. */
export const LANGUAGE_RULES_PATH = 'language-rules.md';

/** Active rules bundle set at app startup from markdown. */
let activeBundle = null;

export function setActiveLanguageRulesBundle(bundle) {
  activeBundle = bundle;
}

export function getActiveLanguageRulesBundle() {
  return activeBundle;
}

export function getActiveRules() {
  return activeBundle?.rules ?? null;
}

export function getActiveRegistry() {
  return activeBundle?.registry ?? null;
}

export function getActiveIpaVowelMode() {
  return activeBundle?.ipaVowelMode ?? 'default';
}

export function resolvePipelineOptions(options = {}) {
  const fonoraVersion = options.fonoraVersion ?? activeBundle?.fonoraVersion ?? 'v2';
  const vowelMode = options.vowelMode ?? activeBundle?.ipaVowelMode ?? 'default';
  return {
    ...options,
    fonoraVersion,
    vowelMode,
  };
}
