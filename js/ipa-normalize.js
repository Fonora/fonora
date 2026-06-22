/**
 * IPA → Fonora phoneme normalization.
 * Vowel maps load from language-rules.md at runtime (see setActiveIpaVowelMap).
 * Consonant maps merge markdown grid/derived IPA with supplemental multilingual variants.
 */

const IPA_MULTIGRAPHS = [
  'tʃ', 'dʒ', 'ʈʃ', 'ts', 'dz', 'pf', 'kx',
  'aɪ', 'aʊ', 'eɪ', 'oʊ', 'ɔɪ', 'əʊ', 'ɪə', 'eə', 'ʊə',
  'iː', 'uː', 'oː', 'aː', 'eː', 'ɑː', 'ɔː', 'ɜː', 'yː', 'ɛː', 'æː',
];

/** Multilingual IPA variants not declared as separate rows in language-rules.md. */
export const SUPPLEMENTAL_CONSONANT_MAP = {
  ɡ: 'g',
  q: 'k',
  β: 'v',
  ʒ: 'j',
  ʎ: 'l',
  ɹ: 'r',
  ɾ: 'r',
  ɽ: 'r',
  ʁ: 'r',
  χ: 'x',
  ɕ: 'sh',
  ʐ: 'j',
  ɣ: 'g',
  ç: 'sh',
  ʈʃ: 'c',
  dʒ: 'j',
  ts: 'c',
  dz: 'j',
  pf: 'f',
  kx: 'x',
  ʔ: '?',
};

/** @type {Record<string, string>} */
let activeConsonantMap = { ...SUPPLEMENTAL_CONSONANT_MAP };

/**
 * Parse IPA notation from a rules cell (e.g. `/p/`, `/tʃ/ or /c/`).
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

function resolveVowelMap(options = {}) {
  if (options.vowelMap) return options.vowelMap;
  const mode = options.vowelMode;
  if (mode && vowelMapsByMode[mode]) return vowelMapsByMode[mode];
  if (Object.keys(activeVowelMap).length) return activeVowelMap;
  return {};
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

function mapToken(token, vowelMap) {
  if (!token) return { phonemes: [], unmapped: [] };
  const consonantMap = getConsonantMap();
  if (consonantMap[token]) return { phonemes: [consonantMap[token]], unmapped: [] };
  if (vowelMap[token]) {
    const mapped = vowelMap[token];
    return {
      phonemes: Array.isArray(mapped) ? mapped : [mapped],
      unmapped: [],
    };
  }
  return { phonemes: ['?'], unmapped: [token] };
}

/**
 * Convert raw IPA into Fonora-reduced phoneme inventory.
 * @param {string} rawIpa
 * @param {{ vowelMode?: string, vowelMap?: Record<string, string | string[]> }} [options]
 */
export function normalizeIpa(rawIpa, options = {}) {
  const vowelMap = resolveVowelMap(options);
  const multigraphs = sortedMultigraphs(vowelMap);
  const cleaned = stripStressAndMarks(String(rawIpa || '').trim());
  const phonemes = [];
  const ipaSegments = [];
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
      const result = mapToken(graph, vowelMap);
      phonemes.push(...result.phonemes);
      ipaSegments.push(graph);
      if (result.unmapped.length) {
        unmapped.push(...result.unmapped);
        warnings.push(`Unmapped IPA "${graph}" → ?`);
      }
      i += graph.length;
      matched = true;
      break;
    }

    if (matched) continue;

    const single = cleaned[i];
    const result = mapToken(single, vowelMap);
    phonemes.push(...result.phonemes);
    ipaSegments.push(result.unmapped.length ? '?' : single);
    if (result.unmapped.length) {
      unmapped.push(single);
      warnings.push(`Unmapped IPA "${single}" → ?`);
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
    warnings,
    unmapped: [...new Set(unmapped)],
  };
}
