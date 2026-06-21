export const LANGUAGE_STORAGE_KEY = 'fonora-language-v1';

export const LANGUAGE_OPTIONS = [
  { code: 'en', label: 'English', voice: 'en-us' },
  { code: 'es', label: 'Spanish', voice: 'es' },
  { code: 'fr', label: 'French', voice: 'fr-fr' },
  { code: 'de', label: 'German', voice: 'de' },
  { code: 'ja', label: 'Japanese', voice: 'ja' },
  { code: 'ar', label: 'Arabic', voice: 'ar' },
  { code: 'zh', label: 'Mandarin', voice: 'zh' },
];

export function loadLanguagePreference() {
  try {
    const raw = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (!raw) return 'en';
    const parsed = JSON.parse(raw);
    return parsed.lang || 'en';
  } catch {
    return 'en';
  }
}

export function saveLanguagePreference(lang) {
  localStorage.setItem(LANGUAGE_STORAGE_KEY, JSON.stringify({ lang: lang || 'en' }));
}

export function voiceForLang(lang) {
  const match = LANGUAGE_OPTIONS.find((item) => item.code === lang);
  return match?.voice || 'en-us';
}
