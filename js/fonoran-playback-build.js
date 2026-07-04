/**
 * Browser-safe Fonora script + word sources builder (Translator UI, Samples-style TTS).
 * Server tools re-export from here; never import Node built-ins in this file.
 */
import { romanToFonoraScript } from '../tools/fonoran-fonora-bridge.js';
import {
  parseSyllable,
  toSpeakable,
  compoundPhoneticKey,
  romanToIpa,
} from '../tools/fonoran-pronunciation.js';

/** Syllable parts suitable for script encode — never a bare compound surface unless it parses. */
export function normalizeTokenParts(token) {
  if (!token?.resolved) return [];
  let parts = Array.isArray(token.parts) ? token.parts.filter(Boolean) : [];
  if (parts.length > 1) return parts;
  if (parts.length === 1) {
    const single = parts[0];
    const parsed = parseSyllable(single);
    if (parsed && !parsed.unparsed) return parts;
  }
  if (token.composition_roots?.length) return token.composition_roots.filter(Boolean);
  if (token.fonoran) {
    const parsed = parseSyllable(token.fonoran);
    if (parsed && !parsed.unparsed) return [token.fonoran];
  }
  return parts;
}

/** Encode roman syllable parts → one Fonora script word (coinjoined syllables). */
export function encodePartsToScript(parts, rules) {
  if (!parts?.length || !rules) return '';
  const combined = romanToFonoraScript(parts, rules);
  if (combined.phrase) return combined.phrase;
  let out = '';
  for (const part of parts) {
    const { phrase } = romanToFonoraScript([part], rules);
    if (!phrase) return '';
    out += phrase;
  }
  return out;
}

function ipaHintForParts(parts) {
  if (!parts?.length) return '';
  return parts.map(p => romanToIpa(p).replace(/^\/+|\/+$/g, '')).join('');
}

export function isSkippablePlaybackToken(token) {
  return token?.kind === 'punctuation' || token?.role === 'punctuation';
}

export function englishFallbackLabel(token) {
  return String(token?.interpreted_from ?? token?.english ?? token?.gloss ?? '').trim();
}

/**
 * @param {object[]} tokens  translator tokens
 * @param {object} rules  Fonora language rules registry
 * @param {{ syllableBySyllable?: boolean }} [opts]
 * @returns {{ phrase: string, script: string, segments: object[], wordSources: object[], tokenIndices: number[], wordCount: number, playable: boolean }}
 */
export function buildPlaybackFromTokens(tokens, rules, { syllableBySyllable = false } = {}) {
  const segments = [];
  const wordSources = [];
  const tokenIndices = [];
  const scriptWords = [];

  if (!Array.isArray(tokens)) {
    return { phrase: '', script: '', segments, wordSources, tokenIndices, wordCount: 0, playable: false };
  }

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (isSkippablePlaybackToken(token)) continue;

    const fallbackEnglish = englishFallbackLabel(token);

    if (!token?.resolved) {
      if (fallbackEnglish) {
        segments.push({ kind: 'english', text: fallbackEnglish, tokenIndex: i });
        tokenIndices.push(i);
      }
      continue;
    }

    const normalized = normalizeTokenParts(token);
    if (!normalized.length) {
      if (fallbackEnglish) {
        segments.push({ kind: 'english', text: fallbackEnglish, tokenIndex: i });
        tokenIndices.push(i);
      }
      continue;
    }

    const partGroups = syllableBySyllable && normalized.length > 1
      ? normalized.map(p => [p])
      : [normalized];

    for (const parts of partGroups) {
      const symbols = encodePartsToScript(parts, rules);
      if (!symbols) {
        if (fallbackEnglish) {
          segments.push({ kind: 'english', text: fallbackEnglish, tokenIndex: i });
          tokenIndices.push(i);
        }
        continue;
      }
      const phonemeKeys = parts.length > 1 ? compoundPhoneticKey(parts) : toSpeakable(parts[0]);
      const ipaHint = ipaHintForParts(parts);
      const wordSource = {
        symbols,
        normalizedPhonemes: phonemeKeys,
        ipa: ipaHint ? `/${ipaHint}/` : '',
        original: token.fonoran ?? parts.join(''),
        input: parts.join(' '),
      };
      wordSources.push(wordSource);
      scriptWords.push(symbols);
      tokenIndices.push(i);
      segments.push({
        kind: 'fonora',
        phrase: symbols,
        wordSource,
        tokenIndex: i,
        fallbackEnglish,
      });
    }
  }

  const phrase = scriptWords.join(' ');
  return {
    phrase,
    script: phrase,
    segments,
    wordSources,
    tokenIndices,
    wordCount: segments.length,
    playable: segments.length > 0,
  };
}
