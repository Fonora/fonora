/**
 * Unit tests for keyboard test word list (phoneme-explicit expected glyphs).
 */
import { loadActiveRulesFixture } from './load-rules-fixture.js';
import { encodeSounds } from './encode.js';
import {
  buildKeyboardTestWordList,
  expectedGlyphsFromPhonemes,
  formatPhonemePrompt,
  uncoveredKeyboardPhonemes,
  hasRepeatedConsonantPhoneme,
} from './keyboard-test-words.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function test(name, fn) {
  try {
    fn();
    return { name, ok: true };
  } catch (e) {
    return { name, ok: false, error: e.message };
  }
}

/**
 * @param {{ rules: object }} options
 */
export function runKeyboardTestWordsTests(options) {
  const { rules } = options;
  if (!rules) throw new Error('runKeyboardTestWordsTests requires rules');

  const results = [];

  function t(name, fn) {
    results.push(test(name, fn));
  }

  t('eye phoneme expected is diphthong only, not e+y+e', () => {
    const expected = expectedGlyphsFromPhonemes(['eye'], rules);
    assert(expected, 'eye should encode');
    const wrong = expectedGlyphsFromPhonemes(['e', 'y', 'e'], rules);
    assert(expected !== wrong, 'e+y+e must differ from eye phoneme');
    const fromRoman = encodeSounds('eye', rules).symbols;
    assert(expected === fromRoman, 'eye phoneme matches encodeSounds(eye) when parsed as one key');
  });

  t('peña phonemes p · e · ñ · a', () => {
    const expected = expectedGlyphsFromPhonemes(['p', 'e', 'ñ', 'a'], rules);
    assert(expected, 'peña phonemes should encode');
    assert(formatPhonemePrompt(['p', 'e', 'ñ', 'a']) === 'p · e · ñ · a');
  });

  t('no test word repeats a consonant phoneme (Fonoran has no double consonants)', () => {
    const words = buildKeyboardTestWordList(rules);
    for (const word of words) {
      assert(!hasRepeatedConsonantPhoneme(word.phonemes), `repeated consonant in ${word.spelling}`);
    }
  });

  t('ñ only via explicit phoneme, not n · e · n', () => {
    const withNen = expectedGlyphsFromPhonemes(['n', 'e', 'n'], rules);
    const withEnye = expectedGlyphsFromPhonemes(['ñ', 'e', 'n'], rules);
    assert(withNen !== withEnye);
    const words = buildKeyboardTestWordList(rules);
    assert(!words.some((w) => w.phonemes.join('|') === 'n|e|n'));
  });

  t('buildKeyboardTestWordList has ~150 words and full phoneme coverage', () => {
    const words = buildKeyboardTestWordList(rules);
    assert(words.length >= 140, `expected at least 140 words, got ${words.length}`);
    assert(uncoveredKeyboardPhonemes(rules).length === 0, 'all keyboard phonemes covered');
    for (const word of words) {
      assert(word.expected === expectedGlyphsFromPhonemes(word.phonemes, rules));
      assert(word.spelling === formatPhonemePrompt(word.phonemes));
    }
  });

  const passed = results.filter((r) => r.ok).length;
  return {
    passed,
    total: results.length,
    failed: results.filter((r) => !r.ok),
  };
}
