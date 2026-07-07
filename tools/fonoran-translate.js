/**
 * Unified Fonoran translate API — routes to LLM compiler (default) or legacy English compiler.
 */

import { translateViaLlm, translatorLlmConfigured } from './fonoran-llm-translate.js';
import { translateEnglishLegacy } from './fonoran-translator.js';
import { ANTHROPIC_TRANSLATOR_API_KEY_ENV } from './fonoran-llm-client.js';

function resolveEngine(requested) {
  const fromEnv = process.env.FONORAN_TRANSLATOR_ENGINE?.trim().toLowerCase();
  const engine = (requested ?? fromEnv ?? 'llm').toLowerCase();
  return engine === 'legacy' ? 'legacy' : 'llm';
}

/**
 * @param {string} text
 * @param {{ sourceLang?: string, lab?: object, engine?: string, skipCache?: boolean, simplify?: boolean|'auto' }} [options]
 */
export async function translate(text, options = {}) {
  const engine = resolveEngine(options.engine);

  if (engine === 'legacy') {
    const result = await translateEnglishLegacy(text, { lab: options.lab });
    return { ...result, engine: 'legacy' };
  }

  if (!translatorLlmConfigured()) {
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
    simplify: options.simplify,
  });

  if (result.ok === false) {
    return result;
  }

  return result;
}

export { translateViaLlm } from './fonoran-llm-translate.js';
export { translateEnglishLegacy, translateFromFrame } from './fonoran-translator.js';
