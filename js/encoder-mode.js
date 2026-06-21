export const ENCODER_MODES = {
  IPA: 'ipa',
  LEGACY: 'legacy',
};

export const DEFAULT_ENCODER_MODE = ENCODER_MODES.IPA;

export const ENCODER_MODE_STORAGE_KEY = 'fonora-encoder-mode-v1';

export const LANGUAGE_OPTIONS = [
  { code: 'en', label: 'English', voice: 'en-us' },
  { code: 'es', label: 'Spanish', voice: 'es' },
  { code: 'fr', label: 'French', voice: 'fr-fr' },
  { code: 'de', label: 'German', voice: 'de' },
  { code: 'ja', label: 'Japanese', voice: 'ja' },
  { code: 'ar', label: 'Arabic', voice: 'ar' },
  { code: 'zh', label: 'Mandarin', voice: 'zh' },
];

export function loadEncoderPreferences() {
  try {
    const raw = localStorage.getItem(ENCODER_MODE_STORAGE_KEY);
    if (!raw) {
      return { mode: DEFAULT_ENCODER_MODE, compareLegacy: false, lang: 'en' };
    }
    const parsed = JSON.parse(raw);
    return {
      mode: parsed.mode === ENCODER_MODES.LEGACY ? ENCODER_MODES.LEGACY : ENCODER_MODES.IPA,
      compareLegacy: Boolean(parsed.compareLegacy),
      lang: parsed.lang || 'en',
    };
  } catch {
    return { mode: DEFAULT_ENCODER_MODE, compareLegacy: false, lang: 'en' };
  }
}

export function saveEncoderPreferences({ mode, compareLegacy, lang }) {
  localStorage.setItem(
    ENCODER_MODE_STORAGE_KEY,
    JSON.stringify({
      mode: mode === ENCODER_MODES.LEGACY ? ENCODER_MODES.LEGACY : ENCODER_MODES.IPA,
      compareLegacy: Boolean(compareLegacy),
      lang: lang || 'en',
    }),
  );
}

export function voiceForLang(lang) {
  const match = LANGUAGE_OPTIONS.find((item) => item.code === lang);
  return match?.voice || 'en-us';
}
