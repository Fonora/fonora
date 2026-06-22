/** Default markdown paths — symbols are never hardcoded here. */
export const LANGUAGE_RULES_PATH = 'docs/language-rules.md';

/** Production site origin for canonical URLs and sharing metadata. */
export const SITE_ORIGIN = 'https://fonora.org';

/** Piper voice model CDN — browser fetches .onnx files lazily on first Listen. */
export const PIPER_VOICE_BASE_URL =
  'https://huggingface.co/rhasspy/piper-voices/resolve/main/';

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
  const fonoraVersion = options.fonoraVersion ?? activeBundle?.fonoraVersion ?? 'v3';
  const vowelMode = options.vowelMode ?? activeBundle?.ipaVowelMode ?? 'default';
  return {
    ...options,
    fonoraVersion,
    vowelMode,
  };
}
