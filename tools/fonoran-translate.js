/**
 * Unified Fonoran translate API: the deterministic English compiler, or the reverse
 * Fonoran to natural-language path.
 *
 * There is one forward engine, and it is the language. A model-backed compiler used to sit
 * behind `engine: 'llm'` here, which meant every consumer of this module loaded LLM code and
 * any caller could silently opt into output no rule can reproduce. It is gone.
 *
 * `legacy` and `lexical` remain accepted engine names, since scripts and tests pass them.
 */

import { translateEnglishLegacy } from './fonoran-translator.js';
import {
  translateFromFonoran,
  isFonoranSourceLang,
  resolveInputMode,
  normalizeTargetLang,
} from './fonoran-reverse-translate.js';

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
 *   skipCache?: boolean,
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
      skipCache: options.skipCache,
      devLab: options.devLab,
    });
  }

  const result = await translateEnglishLegacy(text, { lab: options.lab });
  return { ...result, engine: 'legacy', direction: 'to-fonoran' };
}

export { translateEnglishLegacy, translateFromFrame } from './fonoran-translator.js';
export { translateFromFonoran } from './fonoran-reverse-translate.js';
