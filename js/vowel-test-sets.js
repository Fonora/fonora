/**
 * Grouped English minimal-pair sets for vowel readability testing.
 * Tests whether the 5-vowel Fonora inventory preserves word distinctions after compression.
 */
export const VOWEL_MINIMAL_PAIR_GROUPS = [
  {
    id: 'trap-lot-strut',
    label: 'Group 1, TRAP / LOT / STRUT',
    words: ['cat', 'cot', 'cut'],
    note: 'Front open (æ) vs back open (ɑ) vs mid-central (ʌ)',
  },
  {
    id: 'bad-bod-bud',
    label: 'Group 2, bad / bod / bud',
    words: ['bad', 'bod', 'bud'],
    note: 'Same vowel contrast as Group 1 in CVC frame',
  },
  {
    id: 'man-mom',
    label: 'Group 3, man / mom',
    words: ['man', 'mom'],
    note: 'TRAP (æ) vs LOT (ɑ) in nasal coda',
  },
  {
    id: 'hat-hot',
    label: 'Group 4, hat / hot',
    words: ['hat', 'hot'],
    note: 'TRAP (æ) vs LOT (ɑ)',
  },
  {
    id: 'pan-pawn',
    label: 'Group 5, pan / pawn',
    words: ['pan', 'pawn'],
    note: 'TRAP (æ) vs THOUGHT (ɔː)',
  },
  {
    id: 'father-fodder',
    label: 'Group 6, father / fodder',
    words: ['father', 'fodder'],
    note: 'PALM/BATH (ɑ) vs LOT + rhotic schwa',
  },
  {
    id: 'car-core',
    label: 'Group 7, car / core',
    words: ['car', 'core'],
    note: 'PALM/START (ɑ) vs GOAT (o)',
  },
  {
    id: 'palm-pom',
    label: 'Group 8, palm / pom',
    words: ['palm', 'pom'],
    note: 'PALM (ɑ) vs unrelated homophone pressure',
  },
];

/** CV pairs where short vs long vowels must produce distinct Fonora spellings (phoneme keys). */
export const VOWEL_LENGTH_CV_PAIRS = [
  { short: 'pa', long: 'pā', label: 'open', demoShort: 'pa', demoLong: 'pay' },
  { short: 'pe', long: 'pē', label: 'front', demoShort: 'pe', demoLong: 'pee' },
  { short: 'pi', long: 'pī', label: 'middle', demoShort: 'pi', demoLong: 'pie' },
  { short: 'po', long: 'pō', label: 'back', demoShort: 'po', demoLong: 'poe' },
  { short: 'pu', long: 'pū', label: 'rounded', demoShort: 'pu', demoLong: 'pew' },
];

export function allVowelTestWords() {
  return VOWEL_MINIMAL_PAIR_GROUPS.flatMap((g) => g.words);
}
