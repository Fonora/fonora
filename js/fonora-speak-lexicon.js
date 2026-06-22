/**
 * Map Fonora phoneme-key sequences to English words for phonetic playback.
 */
import { textToIpa } from './ipa.js';
import { normalizeIpa } from './ipa-normalize.js';
import { DEFAULT_VALIDATION_WORDS } from './pronunciation-validation.js';
import { TEST_CATEGORIES } from './encoder-test-sets.js';

const COMMON_WORDS = [
  'the', 'a', 'an', 'and', 'or', 'but', 'to', 'of', 'in', 'on', 'at', 'is', 'are', 'was', 'were',
  'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'must', 'shall', 'can',
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
  'my', 'your', 'his', 'its', 'our', 'their', 'this', 'that', 'these', 'those',
  'what', 'which', 'who', 'where', 'when', 'why', 'how',
  'not', 'no', 'yes', 'all', 'some', 'than', 'too', 'very', 'just', 'also', 'now', 'here', 'there',
  'with', 'from', 'by', 'for', 'about', 'into', 'through', 'before', 'after', 'under', 'over',
  'then', 'once', 'hello', 'goodbye', 'one', 'two', 'three', 'four', 'five', 'six', 'seven',
  'eight', 'nine', 'ten', 'big', 'small', 'good', 'bad', 'new', 'old', 'long', 'short',
  'man', 'woman', 'child', 'day', 'night', 'time', 'way', 'life', 'world', 'hand', 'eye',
  'dog', 'cat', 'fish', 'bird', 'water', 'food', 'house', 'home', 'work', 'play', 'run', 'walk',
  'think', 'know', 'see', 'look', 'come', 'go', 'get', 'make', 'take', 'give', 'say', 'tell',
  'ask', 'find', 'want', 'use', 'try', 'leave', 'call', 'keep', 'let', 'begin', 'show', 'hear',
  'put', 'mean', 'set', 'help', 'talk', 'turn', 'start', 'move', 'live', 'believe', 'hold',
  'bring', 'write', 'stand', 'lose', 'pay', 'meet', 'include', 'continue', 'learn', 'change',
  'lead', 'understand', 'watch', 'follow', 'stop', 'create', 'speak', 'read', 'spend', 'grow',
  'open', 'close', 'win', 'love', 'wait', 'send', 'build', 'stay', 'fall', 'cut', 'reach',
  'kill', 'remain', 'suggest', 'raise', 'pass', 'sell', 'require', 'report', 'decide', 'pull',
];

function collectExampleWords(rules) {
  const words = new Set();
  for (const vowel of rules.vowels || []) {
    const example = String(vowel.example || vowel.approx || '').split(/[,;]+/)[0].trim();
    if (example) words.add(example);
  }
  return [...words];
}

function collectTestWords() {
  const words = new Set();
  for (const category of TEST_CATEGORIES) {
    for (const word of category.words || []) {
      if (word && !word.includes(' ')) words.add(word);
    }
  }
  return [...words];
}

export function collectLexiconSeedWords(rules) {
  return [...new Set([
    ...COMMON_WORDS,
    ...DEFAULT_VALIDATION_WORDS,
    ...collectExampleWords(rules),
    ...collectTestWords(),
  ])];
}

export function mergeLexiconEntries(map, entries) {
  for (const entry of entries || []) {
    const keys = String(entry.phonemeKeys || entry.normalizedPhonemes || '').trim();
    const english = String(entry.english || entry.input || entry.original || '').trim();
    if (keys && english) map.set(keys, english);
  }
  return map;
}

/**
 * Build phoneme-key display → English word lookup using the IPA pipeline.
 */
export async function buildPhonemeKeyLexicon(rules, bundle, words, voice = 'en-us', onProgress) {
  const map = new Map();
  const pipelineOptions = { lang: 'en', voice, englishDialect: voice };
  const total = words.length;
  let processed = 0;

  for (const word of words) {
    const trimmed = String(word || '').trim();
    if (!trimmed) continue;
    try {
      const ipa = await textToIpa(trimmed, 'en', pipelineOptions);
      const normalized = normalizeIpa(ipa, {
        vowelMode: bundle?.ipaVowelMode,
        vowelMap: bundle?.ipaVowelMap,
      });
      const keys = normalized.display;
      if (keys && !map.has(keys)) {
        map.set(keys, trimmed);
      }
    } catch {
      // skip words that fail IPA lookup
    }
    processed += 1;
    onProgress?.(processed, total);
  }

  return map;
}

export function lookupLexiconWord(phonemeKeys, lexicon) {
  const key = String(phonemeKeys || '').trim();
  if (!key || !lexicon) return null;
  return lexicon.get(key) || null;
}
