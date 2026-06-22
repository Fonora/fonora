import { textToIpa } from './ipa.js';
import { normalizeIpa } from './ipa-normalize.js';
import { ipaPhonemesToFonora } from './ipa-to-fonora.js';
import { resolvePipelineOptions, getActiveLanguageRulesBundle } from './fonora-config.js';
import { resolveEspeakVoice } from './language-preferences.js';

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

  const pipelineOptions = resolvePipelineOptions(options);
  const lang = pipelineOptions.lang || 'en';
  const voice = resolveEspeakVoice(lang, pipelineOptions);
  const id = pipelineOptions.id || `card-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const testSet = pipelineOptions.testSet || '';
  const testMode = pipelineOptions.testMode || 'manual';
  const rerunOf = pipelineOptions.rerunOf || null;

  const ipa = await textToIpa(trimmed, lang, pipelineOptions);
  const activeBundle = getActiveLanguageRulesBundle();
  const normalized = normalizeIpa(ipa, {
    vowelMode: pipelineOptions.vowelMode,
    vowelMap: pipelineOptions.vowelMap ?? activeBundle?.ipaVowelMap,
  });
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
    voice,
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
  };
}

/**
 * Translate a phrase word-by-word through the IPA pipeline.
 */
export async function translateIpaPhrase(text, rules, lang = 'en', pipelineOptions = {}) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return null;

  const wordResults = [];
  for (const word of words) {
    wordResults.push(await runIpaPipeline(word, rules, { lang, testMode: 'phrase', ...pipelineOptions }));
  }

  const voice = resolveEspeakVoice(lang, pipelineOptions);

  return {
    original: text,
    lang,
    voice,
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

export async function translateIpaWord(word, rules, lang = 'en', pipelineOptions = {}) {
  const result = await runIpaPipeline(word, rules, { lang, testMode: 'word', ...pipelineOptions });
  if (!result) return null;
  return {
    ...result,
    english: result.original,
    normalized: result.phonemeString,
    soundUnits: result.normalizedPhonemes,
  };
}
