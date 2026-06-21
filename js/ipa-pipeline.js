import { textToIpa } from './ipa.js';
import { normalizeIpa } from './ipa-normalize.js';
import { ipaPhonemesToFonora } from './ipa-to-fonora.js';
import { findDictionaryEntry } from './glossary.js';
import { decodeSymbols } from './decode.js';

function resolveSource(encoded, unmapped, primarySource) {
  const hasFallback = encoded.symbols.includes('?') || encoded.warnings.length > 0 || unmapped.length > 0;
  if (hasFallback) return { source: 'fallback', hasFallback: true, primarySource };
  return { source: primarySource, hasFallback: false, primarySource };
}

/**
 * IPA pronunciation pipeline: Text → eSpeak NG → IPA → Fonora phonemes → symbols.
 */
export async function runIpaPipeline(input, rules, options = {}) {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const lang = options.lang || 'en';
  const id = options.id || `card-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const testSet = options.testSet || '';
  const testMode = options.testMode || 'manual';
  const rerunOf = options.rerunOf || null;

  const dictMatch = findDictionaryEntry(trimmed);
  if (dictMatch) {
    const fonora = ipaPhonemesToFonora(dictMatch.pronunciation, rules);
    const decoded = decodeSymbols(dictMatch.languageSpelling, rules);
    const { source, hasFallback, primarySource } = resolveSource(fonora, [], 'dictionary');
    return {
      id,
      input: trimmed,
      testSet,
      testMode,
      rerunOf,
      original: trimmed,
      lang,
      ipa: dictMatch.pronunciation,
      normalizedPhonemes: dictMatch.pronunciation.split('').join(' '),
      phonemeString: dictMatch.pronunciation,
      sounds: dictMatch.pronunciation,
      phoneticParse: dictMatch.pronunciation.split('').join(' + '),
      symbols: dictMatch.languageSpelling,
      decoded: decoded.pronunciation,
      breakdown: fonora.groups,
      warnings: fonora.warnings,
      unmapped: [],
      source,
      primarySource,
      hasFallback,
      glossaryEntry: dictMatch,
    };
  }

  const ipa = await textToIpa(trimmed, lang);
  const normalized = normalizeIpa(ipa);
  const fonora = ipaPhonemesToFonora(normalized.phonemeString, rules);
  const { source, hasFallback, primarySource } = resolveSource(fonora, normalized.unmapped, 'ipa');

  return {
    id,
    input: trimmed,
    testSet,
    testMode,
    rerunOf,
    original: trimmed,
    lang,
    ipa,
    normalizedPhonemes: normalized.display,
    phonemeString: normalized.phonemeString,
    sounds: normalized.phonemeString,
    phoneticParse: normalized.display.replace(/ /g, ' + '),
    symbols: fonora.symbols,
    decoded: fonora.decoded,
    breakdown: fonora.groups,
    warnings: [...normalized.warnings, ...fonora.warnings, ...(fonora.decodeWarnings || [])],
    unmapped: normalized.unmapped,
    source,
    primarySource,
    hasFallback,
    glossaryEntry: null,
  };
}

/**
 * Translate a phrase word-by-word through the IPA pipeline.
 */
export async function translateIpaPhrase(text, rules, lang = 'en') {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return null;

  const wordResults = [];
  for (const word of words) {
    wordResults.push(await runIpaPipeline(word, rules, { lang, testMode: 'phrase' }));
  }

  return {
    original: text,
    lang,
    ipa: wordResults.map((r) => r.ipa).join(' '),
    normalizedPhonemes: wordResults.map((r) => r.normalizedPhonemes).join(' '),
    phonemeString: wordResults.map((r) => r.phonemeString).join(' '),
    sounds: wordResults.map((r) => r.sounds).join(' '),
    symbols: wordResults.map((r) => r.symbols).join(' '),
    decoded: wordResults.map((r) => r.decoded).join(' '),
    words: wordResults,
    warnings: wordResults.flatMap((r) => r.warnings || []),
    source: wordResults.some((r) => r.source === 'fallback') ? 'fallback' : 'ipa',
  };
}

export async function translateIpaWord(word, rules, lang = 'en') {
  const result = await runIpaPipeline(word, rules, { lang, testMode: 'word' });
  if (!result) return null;
  return {
    ...result,
    english: result.original,
    normalized: result.phonemeString,
    soundUnits: result.normalizedPhonemes,
  };
}
