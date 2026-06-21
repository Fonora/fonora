import { encodeSounds } from './encode.js';
import { decodeSymbols } from './decode.js';

/**
 * Map normalized Fonora phoneme string to symbols using language-rules.md.
 */
export function ipaPhonemesToFonora(phonemeString, rules) {
  const encoded = encodeSounds(phonemeString, rules);
  const decoded = decodeSymbols(encoded.symbols, rules);
  return {
    ...encoded,
    decoded: decoded.pronunciation,
    decodeWarnings: decoded.warnings,
  };
}
