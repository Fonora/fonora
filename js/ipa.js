import ESpeakNg from '../vendor/espeak-ng/espeak-ng.js';
import { DEFAULT_ENGLISH_VOICE, resolveEspeakVoice } from './language-preferences.js';

export const SUPPORTED_LANGUAGES = {
  en: DEFAULT_ENGLISH_VOICE,
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

const WASM_URL = new URL('../vendor/espeak-ng/espeak-ng.wasm', import.meta.url);
let wasmPromise = null;

/**
 * The compiled eSpeak binary, fetched and compiled once.
 *
 * eSpeak's Emscripten module runs its `main()` at instantiation, so a fresh
 * instance really is needed per phrase. Re-downloading and re-compiling 18 MB for
 * each one is not: the home page renders around thirty pronunciations, which came
 * to over half a gigabyte of transfer for a file that never changes.
 *
 * Returns null when the binary cannot be fetched, which is the normal case under
 * Node, where the URL is a `file:` path that `fetch` will not read. Emscripten
 * then loads the binary itself exactly as it did before.
 */
function espeakWasm() {
  if (!wasmPromise) {
    wasmPromise = (async () => {
      try {
        const res = await fetch(WASM_URL);
        if (!res.ok) return null;
        return await WebAssembly.compile(await res.arrayBuffer());
      } catch {
        return null;
      }
    })();
  }
  return wasmPromise;
}

async function runEspeak(text, voice) {
  const outfile = `ipa-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.out`;
  const wasmModule = await espeakWasm();

  const config = { arguments: ['--phonout', outfile, '-q', '--ipa=3', '-v', voice, text] };
  if (wasmModule) {
    // Hand Emscripten the module we already compiled instead of letting it fetch again.
    config.instantiateWasm = (imports, done) => {
      WebAssembly.instantiate(wasmModule, imports).then((instance) => done(instance, wasmModule));
      return {};
    };
  }

  const espeak = await ESpeakNg(config);
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
 * @param {{ voice?: string, englishDialect?: string } | string} [options] - voice override or options bag
 */
export async function textToIpa(text, lang = 'en', options = {}) {
  const trimmed = text.trim();
  if (!trimmed) return '';

  const opts = typeof options === 'string' ? { voice: options } : options;
  const voice = resolveEspeakVoice(lang, opts);
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
