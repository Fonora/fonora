import ESpeakNg from '../vendor/espeak-ng/espeak-ng.js';
import { voiceForLang } from './language-preferences.js';

export const SUPPORTED_LANGUAGES = {
  en: 'en-us',
  es: 'es',
  fr: 'fr-fr',
  de: 'de',
  ja: 'ja',
  ar: 'ar',
  zh: 'zh',
};

let initPromise = null;
let initError = null;
let ready = false;

function stripIpaDecorations(ipa) {
  return ipa
    .replace(/^\/+|\/+$/g, '')
    .replace(/[\u200d\u200c\u2060\ufeff]/g, '')
    .replace(/\([^)]*\)/g, '')
    .trim();
}

async function runEspeak(text, voice) {
  const outfile = `ipa-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.out`;
  const espeak = await ESpeakNg({
    arguments: ['--phonout', outfile, '-q', '--ipa=3', '-v', voice, text],
  });
  try {
    return espeak.FS.readFile(outfile, { encoding: 'utf8' });
  } finally {
    try {
      espeak.FS.unlink(outfile);
    } catch {
      // ignore cleanup errors
    }
  }
}

/**
 * Preload eSpeak NG WASM. Safe to call multiple times.
 */
export async function initEspeak() {
  if (ready) return { ok: true };
  if (initError) return { ok: false, error: initError.message };
  if (!initPromise) {
    initPromise = textToIpa('test', 'en')
      .then(() => {
        ready = true;
        return { ok: true };
      })
      .catch((err) => {
        initError = err;
        initPromise = null;
        return { ok: false, error: err.message };
      });
  }
  return initPromise;
}

/**
 * Canonical pronunciation source: text → raw IPA string.
 * @param {string} text
 * @param {string} lang - UI language code (en, es, fr, de, ja, ar, zh)
 */
export async function textToIpa(text, lang = 'en') {
  const trimmed = text.trim();
  if (!trimmed) return '';

  const voice = SUPPORTED_LANGUAGES[lang] || voiceForLang(lang) || 'en-us';
  const raw = await runEspeak(trimmed, voice);
  return stripIpaDecorations(raw.replace(/\s+/g, ' '));
}

export function isEspeakReady() {
  return ready;
}

export function getEspeakInitError() {
  return initError?.message || null;
}

export function listSupportedLanguages() {
  return Object.entries(SUPPORTED_LANGUAGES).map(([code, voice]) => ({ code, voice }));
}
