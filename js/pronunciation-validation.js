/**
 * Pronunciation Validation Mode — tests whether Fonora preserves pronunciation
 * through encode/decode without modifying language rules or mappings.
 */
import { textToIpa } from './ipa.js';
import { normalizeIpa } from './ipa-normalize.js';
import { ipaPhonemesToFonora } from './ipa-to-fonora.js';
import { decodeToPhonemeKeys } from './decode.js';
import { findConcatenationCollisions } from './collision-audit.js';
import { reverseLookup } from './rules.js';

const IPA_COMPARE_STRIP = /[ˈˌˑ\.˞ˤ˥˦˧˨˩ⁿʰʲʷ\u0303\u031E\u032A\u1D5D-\s\/\[\]]/g;

export const DEFAULT_VALIDATION_WORDS = [
  'bar', 'boy', 'bor', 'car', 'core', 'coy', 'far', 'for', 'four',
  'saw', 'soy', 'father', 'farther', 'eight', 'ate', 'hat', 'hot', 'hut',
  'cat', 'cot', 'cut', 'hello',
];

/** Normalize IPA strings for equality comparison. */
export function normalizeIpaForComparison(ipa) {
  return String(ipa || '')
    .replace(IPA_COMPARE_STRIP, '')
    .replace(/\d/g, '')
    .trim();
}

/** Build IPA string from decoded symbol groups (static cell metadata — may list variants). */
export function groupsToIpa(groups) {
  return (groups || [])
    .map((g) => String(g.ipa || '').replace(/^\/+|\/+$/g, '').trim())
    .filter(Boolean)
    .join('');
}

function parseIpaVariants(ipaField) {
  return String(ipaField || '')
    .replace(/^\/+|\/+$/g, '')
    .split(/[,，]/)
    .map((v) => v.trim())
    .filter(Boolean);
}

/** Map phoneme keys to IPA using rule cell metadata, preferring variants found in source IPA. */
export function phonemeKeysToRecoveredIpa(phonemeKeys, rules, sourceIpa = '') {
  const keys = String(phonemeKeys || '')
    .split(/\s+/)
    .filter(Boolean);
  const sourceNorm = normalizeIpaForComparison(sourceIpa);
  const segments = [];

  for (const key of keys) {
    const cells = reverseLookup(key, rules);
    const cell = cells?.[0];
    if (!cell?.ipa) {
      segments.push('?');
      continue;
    }
    const variants = parseIpaVariants(cell.ipa);
    const match = variants.find((v) => sourceNorm.includes(normalizeIpaForComparison(v)));
    segments.push(match || variants[0] || '?');
  }

  return segments.join('');
}

/** Recover IPA from Fonora symbols via decode → group IPA metadata. */
export function symbolsToRecoveredIpa(symbols, rules) {
  const decoded = decodeToPhonemeKeys(symbols, rules);
  return {
    ipa: groupsToIpa(decoded.groups),
    phonemeKeys: decoded.phonemeKeys,
    groups: decoded.groups,
    decoderPath: (decoded.groups || [])
      .map((g) => `${g.symbols}→${g.sound}${g.ipa ? ` (${String(g.ipa).replace(/^\/+|\/+$/g, '')})` : ''}`)
      .join(' · '),
    warnings: decoded.warnings || [],
  };
}

/** Join phoneme keys into a speech-friendly string for browser TTS readback. */
export function phonemeKeysToSpeechText(phonemeKeys) {
  return String(phonemeKeys || '')
    .split(/\s+/)
    .filter(Boolean)
    .join('');
}

function containsSubsequence(keys, seq) {
  if (!seq.length || keys.length < seq.length) return false;
  for (let i = 0; i <= keys.length - seq.length; i++) {
    if (seq.every((k, j) => keys[i + j] === k)) return true;
  }
  return false;
}

let collisionPatternCache = null;

function getCollisionPatterns(rules) {
  if (collisionPatternCache?.rules === rules) return collisionPatternCache.patterns;
  const hits = findConcatenationCollisions(rules);
  const patterns = hits
    .filter((h) => h.collisionType === 'sequence-equals-single' || h.collisionType === 'sequence-equals-sequence')
    .map((h) => ({
      sequenceA: h.sequenceA,
      sequenceB: h.sequenceB,
      symbols: h.symbols,
      collisionType: h.collisionType,
      recommendation: h.recommendation,
      label:
        h.collisionType === 'sequence-equals-single'
          ? `${h.sequenceA} ↔ ${h.sequenceB}`
          : `${h.sequenceA} vs ${h.sequenceB}`,
    }));
  collisionPatternCache = { rules, patterns };
  return patterns;
}

/** Detect known collision-class patterns in source phoneme keys. */
export function detectCollisionWarnings(phonemeKeysDisplay, rules) {
  const keys = String(phonemeKeysDisplay || '')
    .split(/\s+/)
    .filter(Boolean);
  const patterns = getCollisionPatterns(rules);
  const warnings = [];

  for (const pattern of patterns) {
    const seq = pattern.sequenceA.split(' + ').map((k) => k.trim());
    if (!containsSubsequence(keys, seq)) continue;
    warnings.push({
      ...pattern,
      message: `Contains known vowel+glide collision pattern (${pattern.label})`,
    });
  }

  return warnings;
}

function buildMismatchNotes(source, recovery, fonora, normalized) {
  const notes = [];
  if (source.phonemeKeys !== recovery.phonemeKeys) {
    notes.push('Recovered phoneme keys differ from source phoneme keys.');
  }
  if (fonora.decoded !== normalized.display) {
    notes.push('Pipeline round-trip phoneme keys differ (encode → decode within pipeline).');
  }
  if (normalized.unmapped?.length) {
    notes.push(`Unmapped IPA segments: ${normalized.unmapped.join(', ')}`);
  }
  if (recovery.warnings?.length) {
    notes.push(...recovery.warnings);
  }
  return notes;
}

/**
 * Validate one English word through the full pronunciation pipeline.
 * Validate whether Fonora preserves pronunciation through the full pipeline.
 */
export async function validatePronunciation(word, rules, bundle, options = {}) {
  const trimmed = String(word || '').trim();
  if (!trimmed) return null;

  const lang = options.lang || 'en';
  const ipa = await textToIpa(trimmed, lang, options);
  const normalized = normalizeIpa(ipa, {
    vowelMode: bundle?.ipaVowelMode,
    vowelMap: bundle?.ipaVowelMap,
  });
  const fonora = ipaPhonemesToFonora(normalized.phonemeString, rules);
  const recovery = symbolsToRecoveredIpa(fonora.symbols, rules);
  const recoveredIpa = recovery.phonemeKeys === normalized.display
    ? normalized.ipaFromSegments
    : phonemeKeysToRecoveredIpa(recovery.phonemeKeys, rules, ipa);
  const recoveredFromCellMetadata = groupsToIpa(recovery.groups);

  const sourceIpaNorm = normalizeIpaForComparison(ipa);
  const recoveredIpaNorm = normalizeIpaForComparison(recoveredIpa);
  const ipaMatch = sourceIpaNorm === recoveredIpaNorm && sourceIpaNorm.length > 0;
  const phonemeKeysMatch = normalized.display === recovery.phonemeKeys;
  const collisionWarnings = detectCollisionWarnings(normalized.display, rules);

  return {
    word: trimmed,
    lang,
    voice: options.voice || options.englishDialect || null,
    sourceIpa: ipa,
    sourceIpaNormalized: sourceIpaNorm,
    sourcePhonemeKeys: normalized.display,
    sourcePhonemeString: normalized.phonemeString,
    symbols: fonora.symbols,
    pipelineDecodedKeys: fonora.decoded,
    recoveredPhonemeKeys: recovery.phonemeKeys,
    recoveredIpa,
    recoveredIpaFromCells: recoveredFromCellMetadata,
    recoveredIpaNormalized: recoveredIpaNorm,
    decoderPath: recovery.decoderPath,
    ipaMatch,
    phonemeKeysMatch,
    collisionWarnings,
    mismatchNotes: ipaMatch ? [] : buildMismatchNotes(
      { phonemeKeys: normalized.display },
      recovery,
      fonora,
      normalized,
    ),
    encodeWarnings: [...(normalized.warnings || []), ...(fonora.warnings || []), ...(fonora.decodeWarnings || [])],
    recoveryWarnings: recovery.warnings,
    hasFallback: fonora.symbols.includes('?') || (normalized.unmapped?.length ?? 0) > 0,
  };
}

export async function validatePronunciationBatch(words, rules, bundle, options = {}) {
  const list = [...new Set((words || []).map((w) => String(w).trim()).filter(Boolean))];
  const results = [];
  for (const word of list) {
    try {
      results.push(await validatePronunciation(word, rules, bundle, options));
    } catch (err) {
      results.push({
        word,
        error: err.message || String(err),
        ipaMatch: false,
        phonemeKeysMatch: false,
        collisionWarnings: [],
      });
    }
  }
  return results;
}

export function summarizeValidationResults(results) {
  const rows = (results || []).filter(Boolean);
  const tested = rows.length;
  const errors = rows.filter((r) => r.error).length;
  const matches = rows.filter((r) => r.ipaMatch && !r.error).length;
  const mismatches = rows.filter((r) => !r.ipaMatch && !r.error).length;
  const keyMismatches = rows.filter((r) => !r.phonemeKeysMatch && !r.error).length;
  const collisionWarningCount = rows.filter((r) => (r.collisionWarnings?.length ?? 0) > 0).length;
  const successRate = tested ? Math.round((matches / tested) * 100) : 0;

  return {
    wordsTested: tested,
    exactIpaMatches: matches,
    mismatches,
    phonemeKeyMismatches: keyMismatches,
    errors,
    collisionWarnings: collisionWarningCount,
    recoverySuccessRate: successRate,
  };
}

/** Browser speech synthesis helpers (no-op safe outside browser). */
export function speechLangFromDialect(dialect) {
  if (!dialect) return 'en-US';
  if (dialect.startsWith('en-')) {
    const region = dialect.slice(3).toUpperCase();
    return region === 'UK-RP' ? 'en-GB' : `en-${region}`;
  }
  return dialect;
}

export function cancelBrowserSpeech() {
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

export function listSpeechVoices(langPrefix = 'en') {
  if (typeof window === 'undefined' || !window.speechSynthesis) return [];
  const prefix = String(langPrefix || 'en').toLowerCase();
  return window.speechSynthesis.getVoices()
    .filter((voice) => voice.lang?.toLowerCase().startsWith(prefix))
    .sort((a, b) => {
      const score = (voice) => {
        let s = 0;
        if (voice.default) s += 4;
        if (/google|natural|premium|enhanced|samantha|alex|karen|daniel|zira|david/i.test(voice.name)) s += 3;
        if (/microsoft.*online|neural/i.test(voice.name)) s += 2;
        if (/microsoft.*desktop|sam\b/i.test(voice.name)) s -= 3;
        return s;
      };
      return score(b) - score(a) || a.name.localeCompare(b.name);
    });
}

export function speakAsync(text, lang = 'en-US', options = {}) {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      reject(new Error('Speech synthesis unavailable'));
      return;
    }
    const trimmed = String(text || '').trim();
    if (!trimmed) {
      resolve();
      return;
    }
    const utterance = new SpeechSynthesisUtterance(trimmed);
    utterance.lang = lang;
    if (options.voiceName) {
      const voice = window.speechSynthesis.getVoices().find((item) => item.name === options.voiceName);
      if (voice) utterance.voice = voice;
    }
    utterance.onend = () => resolve();
    utterance.onerror = (event) => {
      reject(event.error || new Error('Speech synthesis failed'));
    };
    window.speechSynthesis.speak(utterance);
  });
}

export function speakOriginal(word, lang = 'en-US') {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    return { ok: false, error: 'Speech synthesis unavailable' };
  }
  cancelBrowserSpeech();
  const utterance = new SpeechSynthesisUtterance(word);
  utterance.lang = lang;
  window.speechSynthesis.speak(utterance);
  return { ok: true };
}

export function speakFonoraReadback(phonemeKeys, lang = 'en-US') {
  const text = phonemeKeysToSpeechText(phonemeKeys);
  if (!text) return { ok: false, error: 'No phoneme keys to speak' };
  return speakOriginal(text, lang);
}
