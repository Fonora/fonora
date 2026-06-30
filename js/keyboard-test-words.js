/**
 * Keyboard testing prompts: explicit Fonora phoneme sequences (not ambiguous roman).
 * Expected glyphs = concatenation of each phoneme's symbols — matches correct keyboard output.
 */
import { buildSoundToSymbolsMap, getDefinedSounds } from './rules.js';

/** All consonant and vowel phoneme keys on the keyboard. */
export const KEYBOARD_PHONEMES = {
  consonants: [
    'p', 't', 'ch', 'k', 'h', 'b', 'd', 'j', 'g', 'gh', 'f', 's', 'sh', 'x', 'kh',
    'm', 'n', 'ñ', 'ng', 'w', 'l', 'r', 'y', 'th', 'dh', 'v', 'z',
  ],
  vowels: ['ee', 'i', 'e', 'a', 'ae', 'o', 'oh', 'u', 'eye', 'ow', 'oy', 'ay'],
};

/** Roman-key typing hints for phonemes that need more than one keypress. */
const TYPING_HINTS = {
  ch: 'c',
  th: 't + h',
  dh: 'd + h',
  sh: 's + h',
  kh: 'k + h',
  gh: 'g + h',
  ng: 'n + g',
  ñ: 'n + n or n → ñ',
  eye: 'e + y',
  ay: 'a + y',
  ow: 'o + w',
  oy: 'o + y',
  ee: 'e + e',
  ae: 'a + e',
  oh: 'o + h',
};

/**
 * @typedef {{ phonemes: string[], label?: string, hint?: string }} KeyboardTestCase
 * @typedef {{ spelling: string, meaning: string, expected: string, phonemes: string[] }} TestWord
 */

/** @param {string[]} phonemes */
export function formatPhonemePrompt(phonemes) {
  return phonemes.join(' · ');
}

/** @param {string[]} phonemes */
function typingHintFor(phonemes) {
  const hints = phonemes
    .map((p) => TYPING_HINTS[p])
    .filter(Boolean);
  if (hints.length === 0) return '';
  return `Type: ${hints.join(', ')}`;
}

/**
 * @param {string[]} phonemes
 * @param {object} rules
 * @returns {string | null}
 */
export function expectedGlyphsFromPhonemes(phonemes, rules) {
  if (!rules || !phonemes?.length) return null;
  const map = buildSoundToSymbolsMap(rules);
  const defined = new Set(getDefinedSounds(rules));
  const parts = [];
  for (const phoneme of phonemes) {
    if (!defined.has(phoneme)) return null;
    const symbols = map[phoneme];
    if (!symbols) return null;
    parts.push(symbols);
  }
  return parts.join('');
}

/** @param {string[]} phonemes */
export function hasRepeatedConsonantPhoneme(phonemes) {
  const consonants = new Set(KEYBOARD_PHONEMES.consonants);
  const seen = new Set();
  for (const phoneme of phonemes) {
    if (!consonants.has(phoneme)) continue;
    if (seen.has(phoneme)) return true;
    seen.add(phoneme);
  }
  return false;
}

/** @returns {KeyboardTestCase[]} */
function buildTestCases() {
  const { consonants, vowels } = KEYBOARD_PHONEMES;
  /** @type {KeyboardTestCase[]} */
  const cases = [];
  const seen = new Set();

  function add(phonemes, options = {}) {
    if (hasRepeatedConsonantPhoneme(phonemes)) return;
    const key = phonemes.join('|');
    if (seen.has(key)) return;
    seen.add(key);
    cases.push({ phonemes, ...options });
  }

  for (const v of vowels) {
    add([v], { hint: typingHintFor([v]) });
  }

  for (const c of consonants) {
    add([c, 'a']);
  }

  const words = [
    { phonemes: ['p', 'eye'], label: 'pie' },
    { phonemes: ['b', 'oy'], label: 'boy' },
    { phonemes: ['n', 'ow'], label: 'now' },
    { phonemes: ['s', 'ay'], label: 'say' },
    { phonemes: ['g', 'oh'], label: 'go' },
    { phonemes: ['b', 'u', 't'], label: 'boot' },
    { phonemes: ['s', 'ee'], label: 'see' },
    { phonemes: ['k', 'ae', 't'], label: 'cat' },
    { phonemes: ['f', 'ae', 'dh', 'a', 'r'], label: 'father' },
    { phonemes: ['p', 'e', 'ñ', 'a'], label: 'peña', hint: 'p, e, n+n→ñ, a' },
    { phonemes: ['k', 'a', 'ñ', 'y', 'oh', 'n'], label: 'canyon' },
    { phonemes: ['t', 'h', 'i', 'ng'], label: 'thing' },
    { phonemes: ['s', 'p', 'r', 'i', 'ng'], label: 'spring' },
    { phonemes: ['s', 't', 'r', 'o', 'ng'], label: 'strong' },
    { phonemes: ['w', 'r', 'o', 'ng'], label: 'wrong' },
    { phonemes: ['l', 'e', 'ng', 'th'], label: 'length' },
    { phonemes: ['m', 'e', 'n'], label: 'men' },
    { phonemes: ['b', 'e', 'n'], label: 'ben' },
    { phonemes: ['t', 'e', 'n'], label: 'ten' },
    { phonemes: ['d', 'e', 'n'], label: 'den' },
    { phonemes: ['k', 'e', 'n'], label: 'ken' },
    { phonemes: ['p', 'e', 'n'], label: 'pen' },
    { phonemes: ['s', 'i', 't'], label: 'sit' },
    { phonemes: ['b', 'e', 'd'], label: 'bed' },
    { phonemes: ['r', 'u', 'n'], label: 'run' },
    { phonemes: ['w', 'i', 'n'], label: 'win' },
    { phonemes: ['z', 'u'], label: 'zoo' },
    { phonemes: ['v', 'ae', 'n'], label: 'van' },
    { phonemes: ['x', 'r', 'ay'], label: 'x-ray' },
    { phonemes: ['k', 'h', 'a', 'n'], label: 'khan' },
    { phonemes: ['l', 'o', 'ch'], label: 'loch' },
    { phonemes: ['g', 'h', 'a', 'r'], label: 'ghar' },
    { phonemes: ['j', 'a', 'm'], label: 'jam' },
    { phonemes: ['ch', 'ae', 't'], label: 'chat' },
    { phonemes: ['sh', 'i', 'p'], label: 'ship' },
    { phonemes: ['dh', 'ae', 't'], label: 'that' },
    { phonemes: ['th', 'i', 'n'], label: 'thin' },
    { phonemes: ['y', 'e', 's'], label: 'yes' },
    { phonemes: ['r', 'ae', 'ng'], label: 'rang' },
    { phonemes: ['s', 'i', 'ng'], label: 'sing' },
    { phonemes: ['f', 'a', 'ng'], label: 'fang' },
    { phonemes: ['b', 'a', 'ng'], label: 'bang' },
    { phonemes: ['h', 'a', 'ng'], label: 'hang' },
    { phonemes: ['l', 'o', 'ng'], label: 'long' },
    { phonemes: ['k', 'i', 'ng'], label: 'king' },
    { phonemes: ['w', 'i', 'ng'], label: 'wing' },
    { phonemes: ['r', 'i', 'ng'], label: 'ring' },
    { phonemes: ['t', 'o', 'y'], label: 'toy' },
    { phonemes: ['j', 'oy'], label: 'joy' },
    { phonemes: ['d', 'ay'], label: 'day' },
    { phonemes: ['w', 'ay'], label: 'way' },
    { phonemes: ['h', 'ow', 's'], label: 'house' },
    { phonemes: ['m', 'ow', 's'], label: 'mouse' },
    { phonemes: ['n', 'oy', 'z'], label: 'noise' },
    { phonemes: ['ch', 'oy', 's'], label: 'choice' },
    { phonemes: ['b', 'r', 'i', 'j'], label: 'bridge' },
    { phonemes: ['p', 'ae', 'j'], label: 'page' },
    { phonemes: ['e', 'd', 'j'], label: 'edge' },
    { phonemes: ['v', 'oy', 's'], label: 'voice' },
    { phonemes: ['p', 'o'], label: 'paw' },
    { phonemes: ['t', 'o', 'r'], label: 'tore' },
    { phonemes: ['sh', 'o', 'r'], label: 'shore' },
    { phonemes: ['f', 'o', 'r'], label: 'four' },
    { phonemes: ['ch', 'ae', 'r'], label: 'chair' },
    { phonemes: ['sh', 'ae', 'r'], label: 'share' },
    { phonemes: ['p', 'ae', 'r'], label: 'pair' },
    { phonemes: ['p', 'ee', 'k'], label: 'peak' },
    { phonemes: ['w', 'ee', 'k'], label: 'week' },
    { phonemes: ['l', 'ee', 'k'], label: 'leak' },
    { phonemes: ['r', 'ee', 'k'], label: 'reek' },
    { phonemes: ['b', 'ee', 'k'], label: 'beak' },
    { phonemes: ['m', 'ee', 'k'], label: 'meek' },
    { phonemes: ['t', 'ee', 'th'], label: 'teeth' },
    { phonemes: ['ch', 'ee', 'z'], label: 'cheese' },
    { phonemes: ['k', 'ee', 'p'], label: 'keep' },
    { phonemes: ['dh', 'ae', 'y'], label: 'they' },
    { phonemes: ['dh', 'ae', 'n'], label: 'than' },
    { phonemes: ['th', 'ae', 'ng', 'k'], label: 'thank' },
    { phonemes: ['w', 'i', 'dh'], label: 'width' },
    { phonemes: ['d', 'e', 'p', 'th'], label: 'depth' },
    { phonemes: ['h', 'ae', 'p', 'th'], label: 'happy' },
    { phonemes: ['g', 'r', 'ow', 'th'], label: 'growth' },
    { phonemes: ['y', 'ae', 'ng'], label: 'yang' },
    { phonemes: ['y', 'i', 'ng'], label: 'ying' },
    { phonemes: ['y', 'o', 'ng'], label: 'yong' },
    { phonemes: ['y', 'u', 'ng'], label: 'young' },
    { phonemes: ['ñ', 'ay'], label: 'ñay' },
    { phonemes: ['ñ', 'ee'], label: 'ñee' },
    { phonemes: ['ñ', 'oh'], label: 'ñoh' },
    { phonemes: ['ñ', 'ow'], label: 'ñow' },
    { phonemes: ['ñ', 'ae'], label: 'ñae' },
    { phonemes: ['p', 'a', 't'], label: 'pat' },
    { phonemes: ['t', 'a', 'p'], label: 'tap' },
    { phonemes: ['h', 'a', 't'], label: 'hat' },
    { phonemes: ['b', 'a', 't'], label: 'bat' },
    { phonemes: ['f', 'a', 'n'], label: 'fan' },
    { phonemes: ['r', 'a', 'w'], label: 'raw' },
    { phonemes: ['z', 'a', 'p'], label: 'zap' },
    { phonemes: ['d', 'o', 'r'], label: 'door' },
    { phonemes: ['m', 'o', 'r'], label: 'more' },
    { phonemes: ['n', 'o', 'r'], label: 'nor' },
    { phonemes: ['l', 'o', 'r'], label: 'lore' },
    { phonemes: ['y', 'o', 'r'], label: 'your' },
    { phonemes: ['p', 'o', 'r'], label: 'pour' },
    { phonemes: ['t', 'ae', 'k'], label: 'tack' },
    { phonemes: ['d', 'ae', 'k'], label: 'dack' },
    { phonemes: ['s', 'ae', 'k'], label: 'sack' },
    { phonemes: ['b', 'ae', 'k'], label: 'back' },
    { phonemes: ['m', 'ae', 'k'], label: 'mack' },
    { phonemes: ['n', 'ae', 'k'], label: 'nack' },
    { phonemes: ['l', 'ae', 'k'], label: 'lack' },
    { phonemes: ['r', 'ae', 'k'], label: 'rack' },
    { phonemes: ['w', 'ae', 'k'], label: 'wack' },
    { phonemes: ['y', 'ae', 'k'], label: 'yack' },
    { phonemes: ['v', 'ae', 'k'], label: 'vack' },
    { phonemes: ['z', 'ae', 'k'], label: 'zack' },
    { phonemes: ['j', 'ae', 'k'], label: 'jack' },
    { phonemes: ['g', 'ae', 'k'], label: 'gack' },
    { phonemes: ['f', 'ae', 'k'], label: 'fack' },
    { phonemes: ['h', 'ae', 'k'], label: 'hack' },
    { phonemes: ['p', 'ae', 'k'], label: 'pack' },
    { phonemes: ['t', 'ae', 'ng'], label: 'tang' },
    { phonemes: ['ch', 'ae', 'ng'], label: 'chang' },
    { phonemes: ['k', 'ae', 'ng'], label: 'kang' },
    { phonemes: ['s', 'ae', 'ng'], label: 'sang' },
    { phonemes: ['sh', 'ae', 'ng'], label: 'shang' },
    { phonemes: ['m', 'ae', 'ng'], label: 'mang' },
    { phonemes: ['n', 'ae', 'ng'], label: 'nang' },
    { phonemes: ['w', 'ae', 'ng'], label: 'wang' },
    { phonemes: ['l', 'ae', 'ng'], label: 'lang' },
    { phonemes: ['p', 'o', 'ng'], label: 'pong' },
    { phonemes: ['t', 'o', 'ng'], label: 'tong' },
    { phonemes: ['k', 'o', 'ng'], label: 'kong' },
    { phonemes: ['h', 'o', 'ng'], label: 'hong' },
    { phonemes: ['b', 'o', 'ng'], label: 'bong' },
    { phonemes: ['d', 'o', 'ng'], label: 'dong' },
    { phonemes: ['g', 'o', 'ng'], label: 'gong' },
    { phonemes: ['f', 'o', 'ng'], label: 'fong' },
    { phonemes: ['s', 'o', 'ng'], label: 'song' },
    { phonemes: ['sh', 'o', 'ng'], label: 'shong' },
    { phonemes: ['m', 'o', 'ng'], label: 'mong' },
    { phonemes: ['n', 'o', 'ng'], label: 'nong' },
    { phonemes: ['w', 'o', 'ng'], label: 'wong' },
    { phonemes: ['r', 'o', 'ng'], label: 'rong' },
    { phonemes: ['p', 'i', 'ng'], label: 'ping' },
    { phonemes: ['t', 'i', 'ng'], label: 'ting' },
    { phonemes: ['h', 'i', 'ng'], label: 'hing' },
    { phonemes: ['b', 'i', 'ng'], label: 'bing' },
    { phonemes: ['d', 'i', 'ng'], label: 'ding' },
    { phonemes: ['g', 'i', 'ng'], label: 'ging' },
    { phonemes: ['f', 'i', 'ng'], label: 'fing' },
    { phonemes: ['s', 'i', 'ng'], label: 'sing2' },
    { phonemes: ['sh', 'i', 'ng'], label: 'shing' },
    { phonemes: ['v', 'i', 'ng'], label: 'ving' },
    { phonemes: ['z', 'i', 'ng'], label: 'zing' },
    { phonemes: ['m', 'i', 'ng'], label: 'ming' },
    { phonemes: ['n', 'i', 'ng'], label: 'ning' },
    { phonemes: ['l', 'i', 'ng'], label: 'ling' },
  ];

  for (const entry of words) {
    add(entry.phonemes, { label: entry.label, hint: entry.hint });
  }

  return cases;
}

/** @type {KeyboardTestCase[]} */
export const KEYBOARD_TEST_CASES = buildTestCases();

/**
 * @param {object} rules
 * @returns {TestWord[]}
 */
export function buildKeyboardTestWordList(rules) {
  if (!rules) return [];

  const words = [];
  for (const testCase of KEYBOARD_TEST_CASES) {
    const expected = expectedGlyphsFromPhonemes(testCase.phonemes, rules);
    if (!expected) continue;

    const spelling = formatPhonemePrompt(testCase.phonemes);
    const label = testCase.label ? `${testCase.label}` : '';
    const hint = testCase.hint || typingHintFor(testCase.phonemes);
    const meaning = [label, hint].filter(Boolean).join(' — ');

    words.push({
      spelling,
      meaning,
      expected,
      phonemes: testCase.phonemes,
    });
  }

  for (let i = words.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [words[i], words[j]] = [words[j], words[i]];
  }

  return words;
}

/**
 * @param {object} rules
 * @returns {string[]}
 */
export function uncoveredKeyboardPhonemes(rules) {
  const all = [...KEYBOARD_PHONEMES.consonants, ...KEYBOARD_PHONEMES.vowels];
  const covered = new Set();
  for (const testCase of KEYBOARD_TEST_CASES) {
    for (const p of testCase.phonemes) covered.add(p);
  }
  return all.filter((p) => !covered.has(p));
}
