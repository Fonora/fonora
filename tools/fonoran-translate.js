/**
 * Unified Fonoran translate API — routes to LLM compiler (default), legacy English compiler,
 * or reverse Fonoran → natural-language path.
 */

import { translateViaLlm, translatorLlmConfigured } from './fonoran-llm-translate.js';
import { translateEnglishLegacy } from './fonoran-translator.js';
import { ANTHROPIC_TRANSLATOR_API_KEY_ENV } from './fonoran-llm-client.js';
import {
  translateFromFonoran,
  isFonoranSourceLang,
  resolveInputMode,
  normalizeTargetLang,
} from './fonoran-reverse-translate.js';

function resolveEngine(requested) {
  const fromEnv = process.env.FONORAN_TRANSLATOR_ENGINE?.trim().toLowerCase();
  const engine = (requested ?? fromEnv ?? 'llm').toLowerCase();
  if (engine === 'legacy' || engine === 'lexical') return engine;
  return 'llm';
}

function resolveDirection(options = {}) {
  const explicit = String(options.direction ?? '').trim().toLowerCase();
  if (explicit === 'from-fonoran' || explicit === 'reverse') return 'from-fonoran';
  if (explicit === 'to-fonoran' || explicit === 'forward') return 'to-fonoran';
  if (isFonoranSourceLang(options.sourceLang)) return 'from-fonoran';
  return 'to-fonoran';
}

/**
 * @param {string} text
 * @param {{
 *   sourceLang?: string,
 *   targetLang?: string,
 *   direction?: string,
 *   inputMode?: string,
 *   lab?: object,
 *   engine?: string,
 *   skipCache?: boolean,
 *   cacheOnly?: boolean,
 *   simplify?: boolean|'auto',
 *   devLab?: boolean,
 * }} [options]
 */
export async function translate(text, options = {}) {
  const direction = resolveDirection(options);

  if (direction === 'from-fonoran') {
    return translateFromFonoran(text, {
      lab: options.lab,
      sourceLang: options.sourceLang,
      inputMode: resolveInputMode(options.sourceLang, options.inputMode),
      targetLang: normalizeTargetLang(options.targetLang),
      engine: resolveEngine(options.engine),
      skipCache: options.skipCache,
      devLab: options.devLab,
    });
  }

  const engine = resolveEngine(options.engine);

  if (engine === 'legacy' || engine === 'lexical') {
    const result = await translateEnglishLegacy(text, { lab: options.lab });
    return { ...result, engine: 'legacy', direction: 'to-fonoran' };
  }

  // Cache-only mode never calls the API, so it does not require a configured key.
  if (!options.cacheOnly && !translatorLlmConfigured()) {
    return {
      ok: false,
      error: `${ANTHROPIC_TRANSLATOR_API_KEY_ENV} not set. Configure translator API key or use engine=legacy.`,
      engine: 'llm',
      status: 503,
    };
  }

  const result = await translateViaLlm(text, {
    sourceLang: options.sourceLang,
    lab: options.lab,
    skipCache: options.skipCache,
    cacheOnly: options.cacheOnly,
    simplify: options.simplify,
    devLab: options.devLab,
  });

  if (result.ok === false) {
    return result;
  }

  return { ...result, direction: 'to-fonoran' };
}

export { translateViaLlm } from './fonoran-llm-translate.js';
export { translateEnglishLegacy, translateFromFrame } from './fonoran-translator.js';
export { translateFromFonoran } from './fonoran-reverse-translate.js';
