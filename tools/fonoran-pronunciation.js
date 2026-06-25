/**
 * Turn Fonoran roman spellings into plain-English pronunciation hints.
 * Based on docs/language-rules.md — teaching aids, not IPA.
 */

const ONSETS = [
  'gh', 'kh', 'ng', 'sh', 'ch', 'th', 'dh', 'ñ',
  'x', 'p', 't', 'b', 'd', 'j', 'g', 'h', 'f', 's', 'v', 'z', 'm', 'n', 'w', 'l', 'r', 'y', 'k',
].sort((a, b) => b.length - a.length);

const VOWELS = ['ee', 'ae', 'oh', 'eye', 'ow', 'oy', 'ay', 'a', 'e', 'i', 'o', 'u'].sort((a, b) => b.length - a.length);

const CODAS = [
  'ch', 'sh', 'ng', 'kh', 'gh', 'th', 'dh',
  'p', 't', 'k', 'h', 'm', 'n', 's', 'd', 'b', 'g', 'v', 'z', 'l', 'r', 'x',
].sort((a, b) => b.length - a.length);

/** Longest-match onsets plus empty string last so vowel-only syllables parse. */
const ONSET_MATCH = [...ONSETS, ''];

const HINT = {
  p: 'p', b: 'b', t: 't', d: 'd', k: 'k', g: 'g', h: 'h',
  f: 'f', s: 's', v: 'v', z: 'zoo', m: 'm', n: 'n', w: 'w', l: 'l', r: 'r', y: 'y',
  ch: 'church', sh: 'ship', j: 'judge', x: 'loch', kh: 'kh', gh: 'gh',
  th: 'think', dh: 'the', ng: 'sing', ñ: 'ny',
  ee: 'see', ae: 'cat', oh: 'go', eye: 'pie', ow: 'now', oy: 'boy', ay: 'say',
  a: 'cup', e: 'bed', i: 'sit', o: 'aw', u: 'book',
};

/** Roman vowels → what browser TTS should speak (the syllable, not the hint word). */
const SPEAK_VOWEL = {
  a: 'ah', e: 'eh', i: 'ih', o: 'oh', u: 'oo',
  ee: 'ee', ae: 'a', oh: 'oh', eye: 'eye', ow: 'ow', oy: 'oy', ay: 'ay',
};

/** Rough TTS fixes for spellings that confuse speech engines. */
const SPEAK_ONSET = { x: 'k', gh: 'g', kh: 'k', ñ: 'ny', th: 'th', dh: 'th' };
const SPEAK_CODA = { ch: 'ch', sh: 'sh', ng: 'ng', th: 'th', dh: 'th', x: 'k' };

export function parseSyllable(text) {
  let rest = text.toLowerCase().trim();
  if (!rest) return null;

  for (const onset of ONSET_MATCH) {
    if (!rest.startsWith(onset)) continue;
    const afterOnset = rest.slice(onset.length);
    for (const vowel of VOWELS) {
      if (!afterOnset.startsWith(vowel)) continue;
      const afterVowel = afterOnset.slice(vowel.length);
      if (!afterVowel) {
        return { onset, vowel, coda: '', spelling: text };
      }
      for (const coda of CODAS) {
        if (afterVowel === coda) {
          return { onset, vowel, coda, spelling: text };
        }
      }
    }
  }
  return { onset: '', vowel: '', coda: '', spelling: text, unparsed: rest };
}

export function syllableSayAs(syllable) {
  if (!syllable || syllable.unparsed) return syllable?.spelling ?? '';
  const chunks = [];
  if (syllable.onset) chunks.push(HINT[syllable.onset] ?? syllable.onset);
  if (syllable.vowel) chunks.push(HINT[syllable.vowel] ?? syllable.vowel);
  if (syllable.coda) chunks.push(HINT[syllable.coda] ?? syllable.coda);
  return chunks.join(' · ');
}

export function sayAs(spelling) {
  const syl = parseSyllable(spelling);
  if (!syl) return '';
  if (syl.unparsed) return spelling;
  return syllableSayAs(syl);
}

export function sayAsBold(spelling) {
  const syl = parseSyllable(spelling);
  if (!syl || syl.unparsed) return spelling.toUpperCase();
  const parts = [];
  if (syl.onset) parts.push((HINT[syl.onset] ?? syl.onset).toUpperCase());
  if (syl.vowel) parts.push((HINT[syl.vowel] ?? syl.vowel).toUpperCase());
  if (syl.coda) parts.push((HINT[syl.coda] ?? syl.coda).toUpperCase());
  return parts.join('-');
}

export function describeParts(spelling) {
  const syl = parseSyllable(spelling);
  if (!syl || syl.unparsed) return [];
  const out = [];
  if (syl.onset) out.push({ letter: syl.onset, soundsLike: HINT[syl.onset] ?? syl.onset });
  if (syl.vowel) out.push({ letter: syl.vowel, soundsLike: HINT[syl.vowel] ?? syl.vowel });
  if (syl.coda) out.push({ letter: syl.coda, soundsLike: HINT[syl.coda] ?? syl.coda });
  return out;
}

export function compoundSayAs(parts) {
  return parts.map(p => sayAsBold(p)).filter(Boolean).join(' + ');
}

/** Phonetic keys without English reference words — e.g. bu → B-OO, hee → H-EE. */
const PHONETIC_VOWEL = {
  a: 'AH', e: 'EH', i: 'IH', o: 'OH', u: 'OO',
  ee: 'EE', ae: 'AE', oh: 'OH', eye: 'EYE', ow: 'OW', oy: 'OY', ay: 'AY',
};

function phoneticPiece(key, role) {
  if (role === 'vowel') return PHONETIC_VOWEL[key] ?? key.toUpperCase();
  return key.toUpperCase();
}

export function phoneticKeyBold(spelling) {
  const syl = parseSyllable(spelling);
  if (!syl || syl.unparsed) return spelling.toUpperCase();
  const parts = [];
  if (syl.onset) parts.push(phoneticPiece(syl.onset, 'onset'));
  if (syl.vowel) parts.push(phoneticPiece(syl.vowel, 'vowel'));
  if (syl.coda) parts.push(phoneticPiece(syl.coda, 'coda'));
  return parts.join('-');
}

export function compoundPhoneticKey(parts) {
  return parts.map(p => phoneticKeyBold(p)).filter(Boolean).join('·');
}

/** English teaching aids below the phonetic line — e.g. bu → "b · book". */
export function englishGuide(spelling) {
  const syl = parseSyllable(spelling);
  if (!syl) return '';
  if (syl.unparsed) return spelling;
  return syllableSayAs(syl);
}

export function compoundEnglishGuide(parts) {
  return parts.map(p => englishGuide(p)).filter(Boolean).join(' + ');
}

const VOWEL_KEYS = new Set(['a', 'e', 'i', 'o', 'u', 'ee', 'ae', 'oh', 'eye', 'ow', 'oy', 'ay']);

/** Vowel-only pronunciation hint for one syllable, e.g. "SEE" for hee. */
export function vowelSayAsBold(spelling) {
  const syl = parseSyllable(spelling);
  if (!syl?.vowel || !VOWEL_KEYS.has(syl.vowel)) return '';
  return (HINT[syl.vowel] ?? syl.vowel).toUpperCase();
}

/** Vowel line for a compound: SEE + BED + CAT */
export function compoundVowelGuide(parts) {
  return parts.map(vowelSayAsBold).filter(Boolean).join(' + ');
}

/** Syllable as one utterance for speech synthesis — not the English hint words. */
export function toSpeakable(spelling) {
  const syl = parseSyllable(spelling);
  if (!syl) return spelling;
  if (syl.unparsed) return spelling;
  const onset = SPEAK_ONSET[syl.onset] ?? syl.onset;
  const vowel = SPEAK_VOWEL[syl.vowel] ?? syl.vowel;
  const coda = SPEAK_CODA[syl.coda] ?? syl.coda;
  return onset + vowel + coda;
}

/** Compound: one coinjoined utterance (no pauses between syllables). */
export function compoundSpeakable(parts) {
  return parts.map(toSpeakable).join('');
}

export const VOWEL_DISPLAY = ['a', 'e', 'i', 'o', 'u', 'ee', 'ae', 'oh', 'ay', 'eye', 'ow', 'oy'];

export const ONSET_GROUPS = [
  { label: 'Stops', items: ['p', 'b', 't', 'd', 'k', 'g', 'ch', 'j'] },
  { label: 'Hiss & breath', items: ['f', 's', 'sh', 'th', 'dh', 'v', 'z', 'x', 'kh', 'gh', 'h'] },
  { label: 'Nasals', items: ['m', 'n', 'ñ', 'ng'] },
  { label: 'Glides', items: ['w', 'l', 'r', 'y'] },
];

export const CODA_DISPLAY = ['p', 't', 'k', 'h', 'm', 'n', 's', 'd', 'b', 'g', 'v', 'z', 'l', 'r', 'ch', 'sh', 'th', 'dh', 'ng', 'kh', 'gh', 'x'];

export function buildSyllable(onset = '', vowel = '', coda = '') {
  if (!vowel) return '';
  return `${onset}${vowel}${coda}`;
}

export function isValidSyllable(text) {
  const s = parseSyllable(text);
  return Boolean(s && !s.unparsed && s.vowel);
}

export function pieceHint(piece) {
  return HINT[piece] ?? piece;
}
