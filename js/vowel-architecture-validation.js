/**
 * V3 vowel architecture validation — dedicated word set with grammar checks.
 */
import { validatePronunciation, validatePronunciationBatch } from './pronunciation-validation.js';
import { containsDoubleVowelMarker, validateVowelSymbolString } from './vowel-grammar.js';
import { getVowelEntries } from './vowel-display.js';
import { VOWEL_ARCHITECTURE_WORDS } from './vowel-architecture-set.js';

/** @typedef {{ word: string, ipa?: string, phonemes?: string, symbols?: string, decoded?: string, grammarOk: boolean, hasDoubleVowel: boolean, error?: string }} VowelArchitectureRow */

function vowelSymbolsInOutput(symbols, rules) {
  const vowelSyms = new Set(getVowelEntries(rules).map((v) => v.symbols).filter(Boolean));
  return String(symbols || '')
    .split(/\s+/)
    .filter((chunk) => vowelSyms.has(chunk));
}

/**
 * @param {Awaited<ReturnType<typeof validatePronunciation>>} result
 * @param {object} rules
 * @returns {VowelArchitectureRow}
 */
export function summarizeVowelArchitectureResult(result, rules) {
  if (!result || result.error) {
    return {
      word: result?.word || '',
      error: result?.error || 'No result',
      grammarOk: false,
      hasDoubleVowel: false,
    };
  }

  const vowelChunks = vowelSymbolsInOutput(result.symbols, rules);
  const grammarOk =
    !containsDoubleVowelMarker(result.symbols) &&
    vowelChunks.every((sym) => validateVowelSymbolString(sym).ok);

  return {
    word: result.word,
    ipa: result.sourceIpa,
    phonemes: result.sourcePhonemeKeys,
    symbols: result.symbols,
    decoded: result.recoveredPhonemeKeys,
    grammarOk,
    hasDoubleVowel: containsDoubleVowelMarker(result.symbols),
  };
}

export async function validateVowelArchitectureSet(rules, bundle, options = {}) {
  const words = options.words || VOWEL_ARCHITECTURE_WORDS;
  const results = await validatePronunciationBatch(words, rules, bundle, options);
  return results.map((r) => summarizeVowelArchitectureResult(r, rules));
}

export function summarizeVowelArchitectureRows(rows) {
  const list = rows || [];
  return {
    wordsTested: list.length,
    grammarPass: list.filter((r) => r.grammarOk && !r.error).length,
    doubleVowelHits: list.filter((r) => r.hasDoubleVowel).length,
    errors: list.filter((r) => r.error).length,
  };
}
