/**
 * Alignment keys for the phrase poster: which English words each Fonoran token
 * stands for.
 *
 * The poster draws a curve from every Fonoran token to the English words it
 * came from, so it has to match "children" against a token reported as "child".
 * It used to do that in the browser by expanding both sides into guessed
 * inflections from a hand-written table of ninety irregular forms plus suffix
 * rules, and hoping the two guesses collided. That was a second English
 * morphology implementation living in a poster renderer, and it could only ever
 * be a worse copy of the one the server already has.
 *
 * So the matching key is computed here instead, where the real lemmatizer is,
 * and both sides are reduced to a lemma. Equal lemma is a match; there is
 * nothing to guess. The browser keeps the presentation decisions (which tier to
 * trust, how to draw) and none of the English.
 *
 * This runs only when the caller asks for it, because only the poster needs it.
 */
import { lemmatizeEnglish, GLOSS_STOPWORDS } from './fonoran-english-morphology.js';
import { functionWordEnglishByForm } from './fonoran-language-policy.js';

/** Must match the browser's own splitting of the phrase, or no key will line up. */
function normWord(word) {
  return String(word ?? '').replace(/[^\p{L}\p{N}']/gu, '').toLowerCase();
}

function lemmaKey(word) {
  const normalized = normWord(word);
  return normalized ? lemmatizeEnglish(normalized) : '';
}

/** Content words from gloss prose, with parentheticals and stopwords removed. */
function glossKeys(gloss) {
  return String(gloss ?? '')
    .replace(/\([^)]*\)/g, ' ')
    .toLowerCase()
    .split(/[^\p{L}\p{N}']+/u)
    .map(normWord)
    .filter(w => w.length > 2 && !GLOSS_STOPWORDS.has(w))
    .map(w => lemmatizeEnglish(w));
}

/**
 * @param {string} englishPhrase  the text the user typed
 * @param {Array<{ english?: string, gloss?: string, fonoran?: string }>} tokens
 * @returns {{ input: Record<string, string>, tokens: Array<{ strong: string[], weak: string[] }> }}
 */
export function buildAlignment(englishPhrase, tokens = []) {
  /**
   * Function words carry technical glosses ("addressee") or echo their own roman
   * ("mi" glossed "mi"), neither of which matches the English a speaker types, so
   * this mapping is more reliable than mining the gloss prose. It is read from
   * `data/fonoran-grammar-policy.json` and keyed by concept id, never by roman: as
   * a literal keyed by roman it drifted badly, pointing English "not" at `ko`, the
   * live root for *to drink*, and hanging "we/us/our" off the first-person singular.
   */
  const particleEnglish = functionWordEnglishByForm();

  const input = {};
  for (const chunk of String(englishPhrase ?? '').match(/\S+/g) ?? []) {
    // Same shape the poster splits into: leading/trailing punctuation is not part
    // of the word.
    const core = normWord(chunk.match(/^[^\p{L}\p{N}]*([\p{L}\p{N}'\u2019-]*)/u)?.[1] ?? '');
    if (core && !(core in input)) input[core] = lemmatizeEnglish(core);
  }

  const tokenKeys = tokens.map(tok => {
    const strong = new Set();
    for (const word of String(tok?.english ?? '').split(/[\s,;/]+/)) {
      const key = lemmaKey(word);
      if (key) strong.add(key);
    }
    for (const alt of particleEnglish.get(tok?.fonoran) ?? []) {
      const key = lemmaKey(alt);
      if (key) strong.add(key);
    }

    const weak = new Set();
    for (const key of glossKeys(tok?.gloss)) {
      if (key && !strong.has(key)) weak.add(key);
    }

    return { strong: [...strong], weak: [...weak] };
  });

  return { input, tokens: tokenKeys };
}
