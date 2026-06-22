/**
 * Format compact IPA strings for eSpeak NG synthesis input.
 * eSpeak expects phoneme-separated underscore notation (as in synthesize_ipa output).
 */

const IPA_GRAPHEMES = [
  'tʃ', 'dʒ', 'eɪ', 'aɪ', 'ɔɪ', 'aʊ', 'oʊ', 'əʊ', 'ɪə', 'eə', 'ʊə',
  'uː', 'iː', 'oː', 'aː', 'ɜː', 'ɔː', 'æː',
  't͡ʃ', 'd͡ʒ',
  'ã', 'ẽ', 'ĩ', 'õ', 'ũ',
  'ɑ', 'ɒ', 'ɔ', 'ʌ', 'æ', 'ə', 'ɚ', 'ɝ', 'ɐ', 'ɨ', 'ʉ', 'ɯ', 'ɪ', 'ʊ', 'ɜ', 'ɞ', 'ɵ', 'ʏ', 'ɛ', 'œ', 'ø',
  'ŋ', 'ɲ', 'ɳ', 'ɴ', 'ʎ', 'ɸ', 'β', 'θ', 'ð', 'ʃ', 'ʒ', 'χ', 'ʁ', 'ħ', 'ʕ', 'ʔ', 'ɹ', 'ɻ',
  'j', 'w', 'l', 'm', 'n', 'p', 'b', 't', 'd', 'k', 'g', 'ɡ', 'f', 'v', 's', 'z', 'h', 'r', 'x', 'c', 'q',
  'e', 'o', 'a', 'i', 'u', 'y',
  'ˈ', 'ˌ', 'ː', 'ʰ', 'ʲ', 'ʷ', '˞', '̩', '̃', '̚', '̥', '̬', '‿', '|', '‖',
].sort((a, b) => b.length - a.length);

const STRESS_MARKS = new Set(['ˈ', 'ˌ']);
const VOWEL_LIKE = /[aeiouæɑɒɔəɚɝɐɨʉɯɪʊɜɞɵʏyɛœøʌaɪaʊoʊeɪɔɪ]/;

/** Map ASCII IPA stand-ins to characters TTS engines expect (Piper uses U+0251, not Latin g). */
const TTS_IPA_ALIASES = {
  g: 'ɡ',
};

export function normalizeIpaSegment(segment) {
  return TTS_IPA_ALIASES[segment] || segment;
}

/** Split compact IPA into grapheme segments. */
export function segmentIpa(ipa) {
  const source = String(ipa || '')
    .replace(/^\/+|\/+$/g, '')
    .replace(/[\s\n/[\]()]/g, '')
    .trim();
  if (!source) return [];

  const segments = [];
  for (let i = 0; i < source.length;) {
    let matched = source[i];
    for (const grapheme of IPA_GRAPHEMES) {
      if (source.startsWith(grapheme, i)) {
        matched = grapheme;
        break;
      }
    }
    segments.push(normalizeIpaSegment(matched));
    i += matched.length;
  }
  return segments;
}

/**
 * Convert compact IPA to eSpeak synthesis input (underscore-separated, primary stress on first vowel).
 */
export function ipaToEspeakSynthesisInput(ipa) {
  const segments = segmentIpa(ipa);
  if (!segments.length) return '';

  const out = [];
  let stressed = false;

  for (const segment of segments) {
    if (STRESS_MARKS.has(segment)) continue;

    if (!stressed && VOWEL_LIKE.test(segment)) {
      out.push(`ˈ${segment}`);
      stressed = true;
    } else {
      out.push(segment);
    }
  }

  return out.join('_');
}
