/**
 * V3 vowel symbol grammar — enforced at encode/decode validation time.
 * Simple vowel: ⚬X (2 symbols)
 * Diphthong: ⚬XᵔY (4 symbols)
 */

export const DOUBLE_VOWEL_MARKER = '⚬⚬';

/** Vowel-class glyphs allowed as X in ⚬X or ⚬XᵔY */
export const VOWEL_CLASS_GLYPHS = new Set(['∋', '∩', '⌓', '∪', '⊃', '⌇', '⌀', '⏌']);

/** Destination places allowed as Y in ⚬XᵔY */
export const DIPHTHONG_DESTINATION_GLYPHS = new Set(['∋', '∩', '⌓', '∪', '⊃']);

export function containsDoubleVowelMarker(text) {
  return String(text || '').includes(DOUBLE_VOWEL_MARKER);
}

/**
 * Validate a composed vowel symbol string against v3 grammar.
 * @returns {{ ok: boolean, kind?: 'simple' | 'diphthong', reason?: string }}
 */
export function validateVowelSymbolString(symbols) {
  const s = String(symbols || '');
  if (!s) return { ok: false, reason: 'empty vowel symbol' };
  if (containsDoubleVowelMarker(s)) {
    return { ok: false, reason: 'legacy double-vowel marker ⚬⚬ is not allowed in v3' };
  }
  if (!s.startsWith('⚬')) {
    return { ok: false, reason: 'vowel must start with ⚬' };
  }

  const rest = [...s.slice(1)];
  if (rest.length === 1 && VOWEL_CLASS_GLYPHS.has(rest[0])) {
    return { ok: true, kind: 'simple' };
  }

  if (rest.length === 3 && rest[1] === 'ᵔ' && VOWEL_CLASS_GLYPHS.has(rest[0]) && DIPHTHONG_DESTINATION_GLYPHS.has(rest[2])) {
    return { ok: true, kind: 'diphthong' };
  }

  return {
    ok: false,
    reason: `invalid v3 vowel shape (len ${rest.length + 1}): expected ⚬X (2) or ⚬XᵔY (4)`,
  };
}

/** Assert every vowel entry in rules conforms to v3 grammar. */
export function assertVowelInventoryGrammar(vowelEntries) {
  const errors = [];
  for (const v of vowelEntries || []) {
    const key = v.key || v.vowel || v.sound;
    const result = validateVowelSymbolString(v.symbols);
    if (!result.ok) errors.push(`${key}: ${result.reason}`);
  }
  if (errors.length) {
    throw new Error(`V3 vowel grammar violations:\n${errors.join('\n')}`);
  }
}
