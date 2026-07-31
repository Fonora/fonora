/**
 * Unified Fonoran translate API: the deterministic forward compiler, or the reverse
 * Fonoran to English gloss.
 *
 * There is one forward engine, and it is the language. The source language selects a
 * parser from fonoran-source-parsers.js (English is the one installed today); a language
 * with no parser is answered honestly rather than silently read as English. A
 * model-backed compiler used to sit behind `engine: 'llm'` here, which meant every
 * consumer of this module loaded LLM code and any caller could silently opt into output
 * no rule can reproduce. It is gone.
 *
 * `legacy` and `lexical` remain accepted engine names, since scripts and tests pass them.
 */

import { translateFromSource } from './fonoran-translator.js';
import { getSourceParser, supportedSourceLangs } from './fonoran-source-parsers.js';
import {
  translateFromFonoran,
  isFonoranSourceLang,
  resolveInputMode,
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
      skipCache: options.skipCache,
      devLab: options.devLab,
    });
  }

  const parser = getSourceParser(options.sourceLang);
  if (!parser) {
    // An honest refusal beats reading Spanish with the English parser: the output
    // would be fluent-looking and wrong, which is exactly what the engine never does.
    return {
      input: String(text ?? ''),
      mode: 'unsupported-source-language',
      error: `no parser installed for source language "${options.sourceLang}"`,
      supported_source_langs: supportedSourceLangs(),
      tokens: [],
      surface: { roman: '', parts: [], pronunciation: { sayLine: '', englishLine: '' } },
      semantic: null,
      frame: null,
      interpretations: [],
      unresolved: [],
      engine: 'legacy',
      direction: 'to-fonoran',
    };
  }

  const result = await translateFromSource(text, {
    parser,
    lab: options.lab,
    devLab: options.devLab,
  });
  return { ...result, engine: 'legacy', direction: 'to-fonoran' };
}

export { translateEnglishLegacy } from './fonoran-translator.js';
export { translateFromFonoran } from './fonoran-reverse-translate.js';
