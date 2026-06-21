export const LANGUAGE_STORAGE_KEY = 'fonora-language-v1';

export const DEFAULT_ENGLISH_VOICE = 'en-us';

export const ENGLISH_DIALECT_OPTIONS = [
  { code: 'en-us', label: 'American English (en-us)' },
  { code: 'en-gb', label: 'British English (en-gb)' },
  { code: 'en-uk-rp', label: 'Received Pronunciation (en-uk-rp)' },
  { code: 'en-au', label: 'Australian English (en-au)' },
  { code: 'en-nz', label: 'New Zealand English (en-nz)' },
  { code: 'en-sc', label: 'Scottish English (en-sc)' },
];

export const ENGLISH_DIALECT_CODES = ENGLISH_DIALECT_OPTIONS.map((item) => item.code);

export const LANGUAGE_OPTIONS = [
  { code: 'en', label: 'English', voice: DEFAULT_ENGLISH_VOICE },
  { code: 'es', label: 'Spanish', voice: 'es' },
  { code: 'fr', label: 'French', voice: 'fr-fr' },
  { code: 'de', label: 'German', voice: 'de' },
  { code: 'ja', label: 'Japanese', voice: 'ja' },
  { code: 'ar', label: 'Arabic', voice: 'ar' },
  { code: 'zh', label: 'Mandarin', voice: 'zh' },
];

export function loadLanguagePreferences() {
  try {
    const raw = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (!raw) return { lang: 'en', englishDialect: DEFAULT_ENGLISH_VOICE };
    const parsed = JSON.parse(raw);
    const dialect = parsed.englishDialect || DEFAULT_ENGLISH_VOICE;
    return {
      lang: parsed.lang || 'en',
      englishDialect: ENGLISH_DIALECT_CODES.includes(dialect) ? dialect : DEFAULT_ENGLISH_VOICE,
    };
  } catch {
    return { lang: 'en', englishDialect: DEFAULT_ENGLISH_VOICE };
  }
}

export function loadLanguagePreference() {
  return loadLanguagePreferences().lang;
}

export function loadEnglishDialectPreference() {
  return loadLanguagePreferences().englishDialect;
}

export function saveLanguagePreference(lang, englishDialect) {
  const current = loadLanguagePreferences();
  localStorage.setItem(
    LANGUAGE_STORAGE_KEY,
    JSON.stringify({
      lang: lang || current.lang || 'en',
      englishDialect: englishDialect ?? current.englishDialect ?? DEFAULT_ENGLISH_VOICE,
    }),
  );
}

export function saveEnglishDialectPreference(englishDialect) {
  const current = loadLanguagePreferences();
  saveLanguagePreference(current.lang, englishDialect);
}

export function voiceForLang(lang) {
  const match = LANGUAGE_OPTIONS.find((item) => item.code === lang);
  return match?.voice || DEFAULT_ENGLISH_VOICE;
}

/**
 * Resolve the eSpeak NG voice for a language and optional English dialect override.
 * @param {string} lang - UI language code (en, es, fr, …)
 * @param {{ voice?: string, englishDialect?: string }} [options]
 */
export function resolveEspeakVoice(lang, options = {}) {
  if (options.voice) return options.voice;
  if (lang === 'en') {
    const dialect = options.englishDialect;
    if (dialect && ENGLISH_DIALECT_CODES.includes(dialect)) return dialect;
    return DEFAULT_ENGLISH_VOICE;
  }
  return voiceForLang(lang);
}
