/**
 * Map Fonoran roman spellings to Fonora script symbols via language-rules.md.
 */
import { parseSyllable } from './fonoran-pronunciation.js';
import { encodeSounds } from '../js/encode.js';
import { normalizeSymbolInput, decodeToPhonemeKeys } from '../js/decode.js';

/** Sentence punctuation often follows Fonora words in generated lore text. */
const TRAILING_PUNCTUATION = /[.,;:!?·…]+$/;
const PUNCTUATION_ONLY = /^[.,;:!?·…\-—]+$/u;

/** @typedef {{ kind: 'word', raw: string, symbols: string }} FonoraScriptWordToken */
/** @typedef {{ kind: 'pause', char: string }} FonoraScriptPauseToken */
/** @typedef {FonoraScriptWordToken | FonoraScriptPauseToken} FonoraScriptToken */

function splitWordAndPunctuation(token) {
  const raw = String(token || '');
  if (PUNCTUATION_ONLY.test(raw)) {
    return { symbols: '', punctuation: raw };
  }
  const trailing = raw.match(TRAILING_PUNCTUATION);
  if (!trailing) return { symbols: raw, punctuation: '' };
  const symbols = raw.slice(0, -trailing[0].length);
  return { symbols, punctuation: trailing[0] };
}

/** Parse pasted Fonora script into speakable words and pause markers. */
export function parseFonoraScriptInput(text) {
  /** @type {FonoraScriptToken[]} */
  const items = [];
  for (const token of String(text || '').trim().split(/\s+/).filter(Boolean)) {
    const { symbols, punctuation } = splitWordAndPunctuation(token);
    if (symbols) items.push({ kind: 'word', raw: token, symbols });
    for (const ch of punctuation) {
      items.push({ kind: 'pause', char: ch });
    }
  }
  return items;
}

/** Milliseconds to pause on punctuation during readback (scaled by speech speed). */
export function pauseMsForPunctuation(char, playbackRate = 1, periodPauseScale = 1) {
  const rate = Math.max(0.45, Math.min(1, Number(playbackRate) || 1));
  const base = char === '.'
    ? 520
    : char === ','
      ? 380
      : char === '·'
        ? 520
        : char === ';' || char === ':'
          ? 480
          : char === '!' || char === '?'
            ? 640
            : 500;
  let ms = Math.round(base + (1 - rate) * 180);
  if (char === '.') {
    const scale = Math.max(0, Number(periodPauseScale) || 0);
    ms = Math.round(ms * scale);
  }
  return ms;
}

/** Split pasted Fonora script on whitespace; symbols only (no punctuation). */
export function tokenizeFonoraScriptInput(text) {
  return parseFonoraScriptInput(text)
    .filter((item) => item.kind === 'word')
    .map((item) => item.symbols);
}

/** Roman syllable → concatenated phoneme-key string for encodeSounds. */
export function syllableToPhonemeString(spelling) {
  const s = parseSyllable(spelling);
  if (!s || s.unparsed) return null;
  return [s.onset, s.vowel, s.coda].filter(Boolean).join('');
}

/** One roman phoneme piece (onset, vowel, or coda) → Fonora glyphs. */
export function pieceToFonoraSymbols(piece, rules) {
  if (!piece || !rules) return '';
  const { symbols, warnings } = encodeSounds(piece, rules);
  if (!symbols || symbols === '?' || warnings?.length) return '';
  return symbols;
}

/** One roman syllable → Fonora glyphs. */
export function syllableToFonoraSymbols(spelling, rules) {
  const phonemeString = syllableToPhonemeString(spelling);
  if (!phonemeString || !rules) {
    // Multi-syllable / non-standard input (e.g. a phonetic loanword like
    // "bitvas") does not parse as a single CVC syllable. Fall back to encoding
    // the full roman string directly — encodeSounds greedily tokenizes phonemes,
    // so a whole word still maps to valid Fonora script.
    if (rules && spelling) {
      const whole = encodeSounds(String(spelling), rules);
      if (whole.symbols && whole.symbols !== '?' && !whole.warnings?.length) {
        return { symbols: whole.symbols, phonemeString: String(spelling), warnings: [] };
      }
    }
    return { symbols: '', phonemeString: null, warnings: ['Could not parse syllable'] };
  }
  const encoded = encodeSounds(phonemeString, rules);
  return { symbols: encoded.symbols, phonemeString, warnings: encoded.warnings };
}

/** Sound or compound (parts array) → Fonora script phrase (syllables coinjoined: one word, no spaces). */
export function romanToFonoraScript(input, rules) {
  if (!rules) return { phrase: '', syllables: [], warnings: ['Rules not loaded'] };
  const parts = Array.isArray(input) ? input : [input];
  const syllables = [];
  const warnings = [];
  for (const roman of parts) {
    const row = syllableToFonoraSymbols(roman, rules);
    syllables.push({ roman, symbols: row.symbols, phonemeString: row.phonemeString });
    if (row.warnings?.length) warnings.push(...row.warnings);
  }
  const phrase = syllables.map(s => s.symbols).filter(Boolean).join('');
  return { phrase, syllables, warnings };
}

/** One roman word token → Fonora script via encodeSounds (deterministic phoneme spelling). */
export function romanWordToFonoraScript(roman, rules) {
  const text = String(roman || '').trim().toLowerCase();
  if (!text || !rules) {
    return { roman: text, symbols: '', phonemeKeys: '', warnings: [], strictOk: false };
  }

  const encoded = encodeSounds(text, rules);
  const phonemeKeys = encoded.groups.map((group) => group.sound).join(' ');
  const strictOk = encoded.warnings.length === 0 && !encoded.symbols.includes('?');

  return {
    roman: text,
    symbols: encoded.symbols,
    phonemeKeys,
    warnings: encoded.warnings.slice(),
    strictOk,
  };
}

/** Space-separated roman phrase → Fonora script (inverse of fonoraScriptToRoman). */
export function romanTextToFonoraScript(input, rules) {
  if (!rules) {
    return { roman: '', symbols: '', tokens: [], words: [], warnings: ['Rules not loaded'], strictOk: false };
  }

  const items = parseFonoraScriptInput(input);
  /** @type {Array<FonoraScriptWordToken & { roman: string, phonemeKeys: string, warnings: string[], strictOk: boolean }>} */
  const words = [];
  /** @type {Array<{ kind: 'word', symbols: string, roman: string } | FonoraScriptPauseToken>} */
  const tokens = [];
  const warnings = [];
  const romanParts = [];
  const symbolParts = [];
  let strictOk = true;

  for (const item of items) {
    if (item.kind === 'pause') {
      tokens.push(item);
      romanParts.push(item.char);
      continue;
    }

    const row = romanWordToFonoraScript(item.symbols, rules);
    words.push({ ...item, ...row });
    tokens.push({ kind: 'word', symbols: row.symbols, roman: row.roman });
    romanParts.push(row.roman);
    symbolParts.push(row.symbols);
    if (row.warnings.length) warnings.push(...row.warnings);
    if (!row.strictOk) strictOk = false;
  }

  return {
    roman: romanParts.join(' '),
    symbols: symbolParts.join(' '),
    tokens,
    words,
    warnings,
    strictOk,
  };
}

/** One Fonora script word → roman phoneme spelling (inverse of encodeSounds). */
export function fonoraWordToRoman(symbols, rules) {
  if (!symbols || !rules) {
    return { symbols: symbols || '', roman: '', phonemeKeys: '', warnings: [] };
  }
  const normalized = normalizeSymbolInput(String(symbols), rules);
  const decoded = decodeToPhonemeKeys(normalized, rules);
  const roman = decoded.groups
    .filter((group) => group.status !== 'invalid' && group.sound !== '?')
    .map((group) => group.sound)
    .join('');
  return {
    symbols: normalized,
    roman,
    phonemeKeys: decoded.phonemeKeys,
    warnings: decoded.warnings || [],
  };
}

/** Space-separated Fonora script phrase → roman spelling (word-aligned with input). */
export function fonoraScriptToRoman(input, rules) {
  if (!rules) return { roman: '', symbols: '', tokens: [], words: [], warnings: ['Rules not loaded'] };

  const items = parseFonoraScriptInput(input);
  /** @type {Array<FonoraScriptWordToken & { roman: string, phonemeKeys: string, warnings: string[] }>} */
  const words = [];
  /** @type {Array<{ kind: 'word', symbols: string, roman: string } | FonoraScriptPauseToken>} */
  const tokens = [];
  const warnings = [];
  const romanParts = [];
  const symbolParts = [];

  for (const item of items) {
    if (item.kind === 'pause') {
      tokens.push(item);
      romanParts.push(item.char);
      continue;
    }

    const row = fonoraWordToRoman(item.symbols, rules);
    words.push({ ...item, ...row });
    tokens.push({ kind: 'word', symbols: row.symbols, roman: row.roman });
    romanParts.push(row.roman);
    symbolParts.push(row.symbols);
    if (row.warnings.length) warnings.push(...row.warnings);
  }

  return {
    roman: romanParts.join(' '),
    symbols: symbolParts.join(' '),
    tokens,
    words,
    warnings,
  };
}
