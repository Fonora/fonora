/**
 * IPA → Fonora phoneme normalization.
 * Vowel maps are loaded from language-rules.md at runtime (see setActiveIpaVowelMap).
 */

const IPA_MULTIGRAPHS = [
  'tʃ', 'dʒ', 'ʈʃ', 'ts', 'dz', 'pf', 'kx',
  'aɪ', 'aʊ', 'eɪ', 'oʊ', 'ɔɪ', 'əʊ', 'ɪə', 'eə', 'ʊə',
  'iː', 'uː', 'oː', 'aː', 'eː', 'ɑː', 'ɔː', 'ɜː', 'yː', 'ɛː', 'æː',
];

const CONSONANT_MAP = {
  p: 'p',
  b: 'b',
  t: 't',
  d: 'd',
  k: 'k',
  g: 'g',
  ɡ: 'g',
  q: 'k',
  f: 'f',
  β: 'v',
  v: 'v',
  s: 's',
  z: 'z',
  h: 'h',
  m: 'm',
  n: 'n',
  ŋ: 'ng',
  ʃ: 'sh',
  ʒ: 'j',
  θ: 'th',
  ð: 'dh',
  j: 'y',
  w: 'w',
  l: 'l',
  ʎ: 'l',
  r: 'r',
  ɹ: 'r',
  ɾ: 'r',
  ɽ: 'r',
  ʁ: 'r',
  x: 'x',
  χ: 'x',
  ɕ: 'sh',
  ʐ: 'j',
  ɣ: 'g',
  ç: 'sh',
  ɲ: 'ñ',
  tʃ: 'c',
  ʈʃ: 'c',
  dʒ: 'j',
  ts: 'c',
  dz: 'j',
  pf: 'f',
  kx: 'x',
  ʔ: '?',
};

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
 * @param {import('./load-language-rules.js').parseLanguageRulesMarkdown extends (...args: any) => infer R ? R : never} rules
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
  const keys = new Set([...Object.keys(CONSONANT_MAP), ...Object.keys(vowelMap), ...IPA_MULTIGRAPHS]);
  return [...keys].sort((a, b) => b.length - a.length);
}

function mapToken(token, vowelMap) {
  if (!token) return { phonemes: [], unmapped: [] };
  if (CONSONANT_MAP[token]) return { phonemes: [CONSONANT_MAP[token]], unmapped: [] };
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
    warnings,
    unmapped: [...new Set(unmapped)],
  };
}
