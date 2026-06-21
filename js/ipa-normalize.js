const IPA_MULTIGRAPHS = [
  'tʃ', 'dʒ', 'ʈʃ', 'ts', 'dz', 'pf', 'kx',
  'aɪ', 'aʊ', 'eɪ', 'oʊ', 'ɔɪ', 'əʊ', 'ɪə', 'eə', 'ʊə',
  'iː', 'uː', 'oː', 'aː', 'eː', 'ɑː', 'ɔː', 'ɜː', 'yː',
];

const CONSONANT_MAP = {
  p: 'p',
  b: 'b',
  t: 't',
  d: 'd',
  k: 'k',
  g: 'g',
  f: 'f',
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
  r: 'r',
  ɹ: 'r',
  ɾ: 'r',
  ʁ: 'r',
  x: 'x',
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

const VOWEL_MAP = {
  a: 'a',
  ɑ: 'a',
  æ: 'a',
  ɐ: 'a',
  e: 'e',
  ɛ: 'e',
  ə: 'e',
  ɜ: 'e',
  ʌ: 'a',
  ɔ: 'o',
  o: 'o',
  i: 'i',
  ɪ: 'i',
  y: 'i',
  u: 'u',
  ʊ: 'u',
  ɨ: 'i',
  ʉ: 'u',
  aɪ: ['a', 'i'],
  aʊ: ['a', 'u'],
  eɪ: ['e', 'i'],
  oʊ: ['o', 'u'],
  əʊ: ['o', 'u'],
  ɔɪ: ['o', 'i'],
  ɪə: ['i', 'e'],
  eə: ['e', 'e'],
  ʊə: ['u', 'e'],
  iː: 'i',
  uː: 'u',
  oː: 'o',
  aː: 'a',
  eː: 'e',
  ɑː: 'a',
  ɔː: 'o',
  ɜː: 'e',
  yː: 'i',
};

const STRIP_CHARS = /[ˈˌːˑ\.˞ˤ˥˦˧˨˥˩ⁿʰʲʷ]/g;

function stripStressAndMarks(ipa) {
  return ipa.replace(STRIP_CHARS, '').replace(/\d/g, '');
}

function sortedMultigraphs() {
  const keys = new Set([...Object.keys(CONSONANT_MAP), ...Object.keys(VOWEL_MAP), ...IPA_MULTIGRAPHS]);
  return [...keys].sort((a, b) => b.length - a.length);
}

const MULTIGRAPHS = sortedMultigraphs();

function mapToken(token) {
  if (!token) return { phonemes: [], unmapped: [] };
  if (CONSONANT_MAP[token]) return { phonemes: [CONSONANT_MAP[token]], unmapped: [] };
  if (VOWEL_MAP[token]) {
    const mapped = VOWEL_MAP[token];
    return {
      phonemes: Array.isArray(mapped) ? mapped : [mapped],
      unmapped: [],
    };
  }
  return { phonemes: ['?'], unmapped: [token] };
}

/**
 * Convert raw IPA into Fonora-reduced phoneme inventory.
 */
export function normalizeIpa(rawIpa) {
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
    for (const graph of MULTIGRAPHS) {
      if (cleaned.slice(i, i + graph.length) !== graph) continue;
      const result = mapToken(graph);
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
    const result = mapToken(single);
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
