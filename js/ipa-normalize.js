/**
 * IPA → Fonora phoneme normalization.
 * Vowel maps load from language-rules.md at runtime (see setActiveIpaVowelMap).
 * Consonant maps merge markdown grid/derived IPA with supplemental multilingual variants.
 */

export const IPA_MULTIGRAPHS = [
  'tʃ', 'dʒ', 'ʈʃ', 'dz', 'pf', 'kx',
  'aɪ', 'aʊ', 'eɪ', 'oʊ', 'ɔɪ', 'əʊ', 'ɪə', 'iə', 'eə', 'ʊə',
  'iː', 'uː', 'oː', 'aː', 'eː', 'ɑː', 'ɔː', 'ɜː', 'yː', 'ɛː', 'æː',
  'ᵻ',
];

/**
 * Temporary engineering mappings: English IPA vowels → Fonora vowel categories.
 * Merged on top of language-rules.md vowel maps for consistency while the vowel
 * inventory is refined. Not linguistic truth, keeps the encoder functional.
 */
export const ENGLISH_IPA_VOWEL_NORMALIZATION = {
  ɪ: 'i',
  i: 'i',
  ᵻ: 'i',
  ɛ: 'e',
  e: 'e',
  æ: 'ae',
  ʌ: 'a',
  ə: 'a',
  ɚ: 'a',
  ɜ: 'a',
  'ɜː': 'a',
  ɔ: 'o',
  ɑ: 'o',
  o: 'o',
  ʊ: 'u',
  u: 'u',
  ɪə: 'i',
  iə: 'i',
  eə: 'a',
  'ʊə': 'u',
};

/** Safe vowel phoneme used when an IPA token has no explicit mapping. */
export const DEFAULT_VOWEL_FALLBACK_PHONEME = 'a';

/** Multilingual IPA variants not declared as separate rows in language-rules.md. */
export const SUPPLEMENTAL_CONSONANT_MAP = {
  ɡ: 'g',
  q: 'k',
  β: 'v',
  ʒ: 'j',
  ʎ: 'l',
  ɹ: 'r',
  /** American English intervocalic flap, preserve spelling-like /t/ in Fonora keys. */
  ɾ: 't',
  ɽ: 'r',
  ʁ: 'r',
  χ: 'kh',
  ɕ: 'sh',
  ʐ: 'j',
  ɣ: 'gh',
  ç: 'sh',
  ʈʃ: 'ch',
  dʒ: 'j',
  dz: 'j',
  pf: 'f',
  kx: 'x',
  ʔ: '?',
};

/** @type {Record<string, string>} */
let activeConsonantMap = { ...SUPPLEMENTAL_CONSONANT_MAP };

/**
 * Parse IPA notation from a rules cell (e.g. `/p/`, `/tʃ/`).
 * @param {string} ipaField
 * @returns {string[]}
 */
export function parseIpaNotation(ipaField) {
  if (!ipaField || ipaField === '?') return [];
  return ipaField.split(/\s+or\s+/i).flatMap((part) => {
    const tokens = [];
    const re = /\/([^/]+)\//g;
    let match;
    while ((match = re.exec(part)) !== null) tokens.push(match[1]);
    return tokens;
  });
}

function derivedSoundLists(rules) {
  return [
    rules?.derivedSounds,
    rules?.experimentalDerivedSounds,
  ];
}

/**
 * IPA tokens declared in sound grid + derived sounds and their expected phoneme keys.
 * @param {object} rules
 * @returns {{ token: string, sound: string, source: string }[]}
 */
export function collectRulesIpaConsonantExpectations(rules) {
  /** @type {{ token: string, sound: string, source: string }[]} */
  const expectations = [];

  const add = (ipaField, sound, source) => {
    if (!sound || sound === '?') return;
    for (const token of parseIpaNotation(ipaField)) {
      expectations.push({ token, sound, source });
    }
  };

  for (const cell of rules.soundGrid || []) {
    if (cell.status === 'defined') add(cell.ipa, cell.sound, 'sound grid');
  }

  for (const list of derivedSoundLists(rules)) {
    for (const cell of list || []) {
      if (cell.status === 'defined' || cell.status === 'experimental') {
        add(cell.ipa, cell.sound, 'derived sounds');
      }
    }
  }

  return expectations;
}

/**
 * Build consonant IPA→phoneme map from language-rules.md grid and derived sounds.
 * @param {object} rules
 * @returns {Record<string, string>}
 */
export function buildConsonantMapFromRules(rules) {
  /** @type {Record<string, string>} */
  const map = {};
  for (const { token, sound } of collectRulesIpaConsonantExpectations(rules)) {
    map[token] = sound;
  }
  return map;
}

/**
 * Merge rules-derived consonant map with supplemental multilingual variants.
 * Rules entries take precedence over supplemental keys on conflict.
 * @param {Record<string, string>} rulesMap
 * @param {Record<string, string>} [supplemental]
 */
export function mergeConsonantMaps(rulesMap, supplemental = SUPPLEMENTAL_CONSONANT_MAP) {
  return { ...supplemental, ...rulesMap };
}

export function getConsonantMap() {
  return activeConsonantMap;
}

/**
 * Rebuild active consonant map from loaded rules.
 * @param {object} rules
 */
export function registerConsonantMapFromRules(rules) {
  activeConsonantMap = mergeConsonantMaps(buildConsonantMapFromRules(rules));
}

/**
 * Compare active consonant map against language-rules.md consonant IPA declarations.
 * @param {object} rules
 * @param {Record<string, string>} [map]
 * @returns {string[]}
 */
export function findConsonantMapSyncIssues(rules, map = getConsonantMap()) {
  const issues = [];
  for (const { token, sound, source } of collectRulesIpaConsonantExpectations(rules)) {
    if (!(token in map)) {
      issues.push(`Missing consonant map["${token}"] for ${source} (expected phoneme "${sound}")`);
      continue;
    }
    if (map[token] !== sound) {
      issues.push(
        `consonant map["${token}"] is "${map[token]}" but ${source} expects "${sound}"`,
      );
    }
  }
  return issues;
}

/** @type {Record<string, Record<string, string | string[]>>} */
const vowelMapsByMode = {};

/** @type {Record<string, string | string[]>} */
let activeVowelMap = {};

/**
 * Register IPA vowel maps derived from markdown (keyed by ipa_vowel_mode).
 * @param {string} mode
 * @param {Record<string, string | string[]>} map
 */
export function registerIpaVowelMap(mode, map) {
  vowelMapsByMode[mode] = map;
}

/**
 * Set the active vowel map used when vowelMode is omitted.
 * @param {Record<string, string | string[]>} map
 */
export function setActiveIpaVowelMap(map) {
  activeVowelMap = map || {};
}

/**
 * Build a vowel map object from parsed language rules.
 * @param {object} rules
 */
export function buildVowelMapFromRules(rules) {
  return rules.ipaVowelMap || {};
}

function resolveBaseVowelMap(options = {}) {
  if (options.vowelMap) return options.vowelMap;
  const mode = options.vowelMode;
  if (mode && vowelMapsByMode[mode]) return vowelMapsByMode[mode];
  if (Object.keys(activeVowelMap).length) return activeVowelMap;
  return {};
}

/**
 * Merge rules-derived vowel map with English engineering normalization.
 * Engineering entries override rules on conflict (e.g. ɚ → a instead of a+r).
 * @param {Record<string, string | string[]>} [baseMap]
 */
export function mergeEnglishVowelNormalization(baseMap = {}) {
  return { ...baseMap, ...ENGLISH_IPA_VOWEL_NORMALIZATION };
}

/**
 * Effective vowel map used by normalizeIpa unless skipEnglishNormalization is set.
 * English engineering overlays apply only when lang is en (default).
 * @param {{ lang?: string, vowelMode?: string, vowelMap?: Record<string, string | string[]>, skipEnglishNormalization?: boolean }} [options]
 */
export function buildEffectiveVowelMap(options = {}) {
  const base = resolveBaseVowelMap(options);
  if (options.skipEnglishNormalization) return base;
  const lang = options.lang || 'en';
  if (lang !== 'en') return base;
  return mergeEnglishVowelNormalization(base);
}

function resolveVowelMap(options = {}) {
  return buildEffectiveVowelMap(options);
}

const STRIP_CHARS = /[ˈˌˑ\.˞ˤ˥˦˧˨˥˩ⁿʰʲʷ\u0303\u031E\u032A\u1D5D-]/g;

function stripStressAndMarks(ipa) {
  return ipa.replace(STRIP_CHARS, '').replace(/\d/g, '');
}

function sortedMultigraphs(vowelMap) {
  const consonantMap = getConsonantMap();
  const keys = new Set([...Object.keys(consonantMap), ...Object.keys(vowelMap), ...IPA_MULTIGRAPHS]);
  return [...keys].sort((a, b) => b.length - a.length);
}

function mapToken(token, vowelMap, fallbackPhoneme = DEFAULT_VOWEL_FALLBACK_PHONEME) {
  if (!token) return { phonemes: [], unmapped: [], usedFallback: false };
  const consonantMap = getConsonantMap();
  if (consonantMap[token]) {
    return { phonemes: [consonantMap[token]], unmapped: [], usedFallback: false };
  }
  if (vowelMap[token]) {
    const mapped = vowelMap[token];
    return {
      phonemes: Array.isArray(mapped) ? mapped : [mapped],
      unmapped: [],
      usedFallback: false,
    };
  }
  return {
    phonemes: [fallbackPhoneme],
    unmapped: [token],
    usedFallback: true,
  };
}

/**
 * Resolve current mapping for an IPA token (consonant map, then effective vowel map).
 * @param {string} token
 * @param {{ vowelMode?: string, vowelMap?: Record<string, string | string[]>, skipEnglishNormalization?: boolean }} [options]
 * @returns {{ phonemes: string[], source: 'consonant' | 'vowel' | 'fallback' | 'none' }}
 */
export function lookupIpaTokenMapping(token, options = {}) {
  if (!token) return { phonemes: [], source: 'none' };
  const consonantMap = getConsonantMap();
  if (consonantMap[token]) {
    return { phonemes: [consonantMap[token]], source: 'consonant' };
  }
  const vowelMap = buildEffectiveVowelMap(options);
  if (vowelMap[token]) {
    const mapped = vowelMap[token];
    return {
      phonemes: Array.isArray(mapped) ? mapped : [mapped],
      source: 'vowel',
    };
  }
  return {
    phonemes: [DEFAULT_VOWEL_FALLBACK_PHONEME],
    source: 'fallback',
  };
}

/**
 * Convert raw IPA into Fonora-reduced phoneme inventory.
 * @param {string} rawIpa
 * @param {{ lang?: string, vowelMode?: string, vowelMap?: Record<string, string | string[]>, skipEnglishNormalization?: boolean, fallbackPhoneme?: string }} [options]
 */
export function normalizeIpa(rawIpa, options = {}) {
  const vowelMap = resolveVowelMap(options);
  const fallbackPhoneme = options.fallbackPhoneme || DEFAULT_VOWEL_FALLBACK_PHONEME;
  const multigraphs = sortedMultigraphs(vowelMap);
  const cleaned = stripStressAndMarks(String(rawIpa || '').trim());
  const phonemes = [];
  const ipaSegments = [];
  const normalizedIpaSegments = [];
  const unmapped = [];
  const warnings = [];
  let i = 0;

  while (i < cleaned.length) {
    const ch = cleaned[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    let matched = false;
    for (const graph of multigraphs) {
      if (cleaned.slice(i, i + graph.length) !== graph) continue;
      const result = mapToken(graph, vowelMap, fallbackPhoneme);
      phonemes.push(...result.phonemes);
      ipaSegments.push(graph);
      normalizedIpaSegments.push(result.phonemes.join(''));
      if (result.unmapped.length) {
        unmapped.push(...result.unmapped);
        warnings.push(
          `Unmapped IPA "${graph}" → fallback vowel "${fallbackPhoneme}"`,
        );
      }
      i += graph.length;
      matched = true;
      break;
    }

    if (matched) continue;

    const single = cleaned[i];
    const result = mapToken(single, vowelMap, fallbackPhoneme);
    phonemes.push(...result.phonemes);
    ipaSegments.push(single);
    normalizedIpaSegments.push(result.phonemes.join(''));
    if (result.unmapped.length) {
      unmapped.push(single);
      warnings.push(
        `Unmapped IPA "${single}" → fallback vowel "${fallbackPhoneme}"`,
      );
    }
    i++;
  }

  const phonemeString = phonemes.join('');
  return {
    phonemes,
    phonemeString,
    display: phonemes.join(' '),
    ipaSegments,
    ipaFromSegments: ipaSegments.join(''),
    normalizedIpa: normalizedIpaSegments.join(''),
    warnings,
    unmapped: [...new Set(unmapped)],
  };
}
