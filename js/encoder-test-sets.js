const CV_SYLLABLES = [
  'pa', 'pe', 'pi', 'po', 'pu',
  'ba', 'be', 'bi', 'bo', 'bu',
  'ta', 'te', 'ti', 'to', 'tu',
  'da', 'de', 'di', 'do', 'du',
  'ka', 'ke', 'ki', 'ko', 'ku',
  'ga', 'ge', 'gi', 'go', 'gu',
  'fa', 'fe', 'fi', 'fo', 'fu',
  'sa', 'se', 'si', 'so', 'su',
  'ha', 'he', 'hi', 'ho', 'hu',
  'ma', 'me', 'mi', 'mo', 'mu',
  'na', 'ne', 'ni', 'no', 'nu',
  'la', 'le', 'li', 'lo', 'lu',
  'ra', 're', 'ri', 'ro', 'ru',
  'wa', 'we', 'wi', 'wo', 'wu',
  'ya', 'ye', 'yi', 'yo', 'yu',
];

export const TEST_CATEGORIES = [
  {
    id: 'single-consonants',
    label: 'Single consonants',
    words: ['p', 'b', 't', 'd', 'k', 'g', 'f', 's', 'sh', 'h', 'm', 'n', 'ng', 'w', 'y', 'r', 'l'],
  },
  {
    id: 'simple-vowels',
    label: 'Simple vowels',
    words: ['a', 'e', 'i', 'o', 'u'],
  },
  {
    id: 'vowel-length-english',
    label: 'Vowel length (English IPA)',
    words: ['bit', 'beat', 'pull', 'pool', 'met', 'mate', 'hop', 'hope', 'cap', 'cape'],
  },
  {
    id: 'cv-syllables',
    label: 'Consonant + vowel syllables',
    words: CV_SYLLABLES,
  },
  {
    id: 'vc-syllables',
    label: 'Vowel + consonant syllables',
    words: ['at', 'et', 'it', 'ot', 'ut', 'an', 'en', 'in', 'on', 'un', 'am', 'em', 'im', 'om', 'um'],
  },
  {
    id: 'cvc-words',
    label: 'CVC words',
    words: ['cat', 'dog', 'run', 'red', 'sun', 'big', 'hot', 'cup', 'pen', 'map', 'sit', 'top', 'bug', 'fan', 'leg'],
  },
  {
    id: 'doubled-consonants',
    label: 'Doubled consonants',
    words: ['hello', 'shell', 'letter', 'butter', 'coffee', 'apple', 'little', 'summer', 'better', 'pass'],
  },
  {
    id: 'silent-letters',
    label: 'Silent letters',
    words: ['know', 'write', 'light', 'night', 'knee', 'knife', 'ghost', 'listen', 'castle', 'island'],
  },
  {
    id: 'english-digraphs',
    label: 'English digraphs',
    words: ['phone', 'laugh', 'enough', 'rough', 'through', 'though', 'eight', 'weight', 'sight', 'fight'],
  },
  {
    id: 'th-dh-words',
    label: 'th/dh words',
    words: ['thin', 'this', 'thing', 'that', 'think', 'the', 'they', 'there', 'then', 'those'],
  },
  {
    id: 'sh-ch-j-words',
    label: 'sh/ch/j words',
    words: ['shell', 'change', 'cheese', 'judge', 'ship', 'shop', 'church', 'chase', 'joy', 'jump'],
  },
  {
    id: 'ng-nk-words',
    label: 'ng/nk words',
    words: ['king', 'sink', 'ring', 'sing', 'long', 'song', 'think', 'bank', 'tank', 'pink'],
  },
  {
    id: 'glide-liquid-words',
    label: 'Glide/liquid words',
    words: ['way', 'we', 'you', 'yes', 'law', 'low', 'lay', 'ray', 'row', 'real', 'wheel', 'year'],
  },
  {
    id: 'common-short-words',
    label: 'Common short words',
    words: ['he', 'hi', 'me', 'my', 'no', 'go', 'so', 'see', 'say', 'low', 'lay', 'run', 'red', 'cat', 'dog', 'man', 'name', 'sun', 'moon'],
  },
  {
    id: 'same-sound-groups',
    label: 'Same-sound groups',
    words: [
      'eight', 'ate', 'ayt',
      'rain', 'rane', 'rayn', 'reign',
      'say', 'sei', 'sae',
      'see', 'sea',
      'meet', 'meat',
      'toe', 'tow',
      'night', 'nite',
      'phone', 'fone',
      'right', 'write',
      'know', 'no',
      'there', 'their',
    ],
  },
  {
    id: 'ch-and-z-words',
    label: 'ch → c and z derived sound',
    words: ['chat', 'chip', 'change', 'church', 'ship', 'zoo', 'zero', 'zip', 'lazy', 'amazing'],
  },
  {
    id: 'pronunciation-normalization',
    label: 'Pronunciation normalization',
    words: [
      'hello', 'shell', 'phone', 'laugh', 'enough', 'weigh', 'night', 'light',
      'king', 'sink', 'thing', 'this', 'change', 'letter', 'name', 'make',
    ],
  },
  {
    id: 'known-problem-words',
    label: 'Known problem words',
    words: ['hello', 'hell', 'shell', 'thin', 'this', 'thing', 'that', 'change', 'cheese', 'judge', 'king', 'sink', 'know', 'write', 'phone', 'enough', 'laugh', 'light', 'night'],
  },
  {
    id: 'english-dialect-comparison',
    label: 'English dialect comparison',
    words: ['tomato', 'water', 'car', 'dance', 'route'],
  },
];

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Pick words from selected categories, deduped, shuffled, capped at count.
 * @returns {{ word: string, testSet: string }[]}
 */
export function pickCuratedWords(selectedCategoryIds, count = 30) {
  const selected = TEST_CATEGORIES.filter((c) => selectedCategoryIds.includes(c.id));
  const pool = [];

  for (const cat of selected) {
    for (const word of cat.words) {
      pool.push({ word, testSet: cat.label });
    }
  }

  const seen = new Set();
  const deduped = [];
  for (const item of shuffle(pool)) {
    const key = item.word.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }

  return deduped.slice(0, Math.min(Math.max(count, 1), 50));
}

export const MULTILINGUAL_TEST_SET = [
  { word: 'knife', lang: 'en', category: 'English' },
  { word: 'island', lang: 'en', category: 'English' },
  { word: 'debt', lang: 'en', category: 'English' },
  { word: 'salmon', lang: 'en', category: 'English' },
  { word: 'colonel', lang: 'en', category: 'English' },
  { word: 'hola', lang: 'es', category: 'Spanish' },
  { word: 'gracias', lang: 'es', category: 'Spanish' },
  { word: 'perro', lang: 'es', category: 'Spanish' },
  { word: 'bonjour', lang: 'fr', category: 'French' },
  { word: 'merci', lang: 'fr', category: 'French' },
  { word: 'hallo', lang: 'de', category: 'German' },
  { word: 'konnichiwa', lang: 'ja', category: 'Japanese' },
  { word: 'marhaba', lang: 'ar', category: 'Arabic' },
];

export function getMultilingualTestEntries() {
  return MULTILINGUAL_TEST_SET.map((entry) => ({
    word: entry.word,
    lang: entry.lang,
    testSet: `${entry.category} (${entry.lang})`,
  }));
}

/** Words with well-known dialect-specific pronunciations. */
export const ENGLISH_DIALECT_COMPARISON_WORDS = ['tomato', 'water', 'car', 'dance', 'route'];

/**
 * Build test entries for each word × English dialect voice.
 * @param {string[]} dialects - eSpeak voice codes (e.g. en-us, en-gb)
 * @returns {{ word: string, lang: string, voice: string, testSet: string }[]}
 */
export function getEnglishDialectComparisonEntries(dialects) {
  return ENGLISH_DIALECT_COMPARISON_WORDS.flatMap((word) =>
    dialects.map((voice) => ({
      word,
      lang: 'en',
      voice,
      testSet: `English dialect (${voice})`,
    })),
  );
}

export function getCategoryById(id) {
  return TEST_CATEGORIES.find((c) => c.id === id);
}
