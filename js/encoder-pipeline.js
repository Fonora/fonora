import { encodeSounds } from './encode.js';
import { decodeSymbols } from './decode.js';
import { normalizeEnglishWord } from './normalize.js';
import { findDictionaryEntry } from './glossary.js';
import { getDefinedSounds } from './rules.js';

function parseSoundUnits(sounds, rules) {
  const defined = getDefinedSounds(rules);
  const units = [];
  let i = 0;
  const text = sounds.trim();

  while (i < text.length) {
    if (/\s/.test(text[i])) {
      units.push(text[i]);
      i++;
      continue;
    }
    let matched = false;
    for (const sound of defined) {
      if (text.slice(i, i + sound.length) !== sound) continue;
      units.push(sound);
      i += sound.length;
      matched = true;
      break;
    }
    if (!matched) {
      units.push(text[i]);
      i++;
    }
  }

  return units;
}

function resolveSource(encoded, primarySource) {
  const hasFallback = encoded.symbols.includes('?') || encoded.warnings.length > 0;
  if (hasFallback) return { source: 'fallback', hasFallback: true, primarySource };
  return { source: primarySource, hasFallback: false, primarySource };
}

function buildPipelineResult(base, encoded, decoded, rules) {
  const soundUnits = parseSoundUnits(base.sounds, rules);
  const { source, hasFallback, primarySource } = resolveSource(encoded, base.primarySource);

  return {
    ...base,
    soundUnits,
    phoneticParse: soundUnits.filter((u) => !/\s/.test(u)).join(' + '),
    symbols: encoded.symbols,
    breakdown: encoded.groups,
    decoded: decoded.pronunciation,
    source,
    hasFallback,
    primarySource,
    warnings: [...base.warnings, ...encoded.warnings, ...decoded.warnings],
  };
}

/**
 * Legacy Encoder — full English spelling → sound → Fonora pipeline for testing/debug.
 * @param {string} input
 * @param {object} rules
 * @param {{ mode?: 'english'|'sound', testSet?: string, testMode?: string, id?: string, rerunOf?: string }} options
 */
export function runEncoderPipeline(input, rules, options = {}) {
  const trimmed = input.trim();
  const id = options.id || `card-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const testSet = options.testSet || '';
  const testMode = options.testMode || 'manual';
  const rerunOf = options.rerunOf || null;

  if (!trimmed) return null;

  if (options.mode === 'sound') {
    const encoded = encodeSounds(trimmed, rules);
    const decoded = decodeSymbols(encoded.symbols, rules);
    return buildPipelineResult(
      {
        id,
        input: trimmed,
        testSet,
        testMode,
        rerunOf,
        original: trimmed,
        cleaned: trimmed,
        pronunciationForm: trimmed,
        normalizedSpelling: trimmed,
        sounds: trimmed,
        pronunciationActions: [],
        conversionActions: [],
        actions: [],
        warnings: [],
        glossaryEntry: null,
        primarySource: 'auto-encoded',
      },
      encoded,
      decoded,
      rules,
    );
  }

  const dictMatch = findDictionaryEntry(trimmed);
  if (dictMatch) {
    const encoded = encodeSounds(dictMatch.pronunciation, rules);
    const decoded = decodeSymbols(dictMatch.languageSpelling, rules);
    return buildPipelineResult(
      {
        id,
        input: trimmed,
        testSet,
        testMode,
        rerunOf,
        original: trimmed,
        cleaned: trimmed.toLowerCase(),
        pronunciationForm: dictMatch.pronunciation,
        normalizedSpelling: dictMatch.pronunciation,
        sounds: dictMatch.pronunciation,
        pronunciationActions: ['dictionary override'],
        conversionActions: [],
        actions: ['dictionary override'],
        warnings: [],
        glossaryEntry: dictMatch,
        primarySource: 'dictionary',
      },
      { ...encoded, symbols: dictMatch.languageSpelling },
      decoded,
      rules,
    );
  }

  const norm = normalizeEnglishWord(trimmed);
  const encoded = encodeSounds(norm.sounds, rules);
  const decoded = decodeSymbols(encoded.symbols, rules);

  return buildPipelineResult(
    {
      id,
      input: trimmed,
      testSet,
      testMode,
      rerunOf,
      original: norm.original,
      cleaned: norm.cleaned,
      pronunciationForm: norm.pronunciationForm,
      normalizedSpelling: norm.pronunciationForm,
      sounds: norm.sounds,
      pronunciationActions: norm.pronunciationActions,
      conversionActions: norm.conversionActions,
      actions: norm.actions,
      warnings: norm.warnings,
      glossaryEntry: null,
      primarySource: 'auto-encoded',
    },
    encoded,
    decoded,
    rules,
  );
}

/** Alias for clarity when comparing against the IPA pipeline. */
export const runLegacyEncoderPipeline = runEncoderPipeline;
