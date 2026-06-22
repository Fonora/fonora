import { encodeSounds } from './encode.js';
import { decodeToPhonemeKeys } from './decode.js';

/**
 * Map normalized Fonora phoneme string to symbols using language-rules.md.
 */
export function ipaPhonemesToFonora(phonemeString, rules) {
  const encoded = encodeSounds(phonemeString, rules);
  const symbols = encoded.symbols;
  const roundTrip = decodeToPhonemeKeys(symbols, rules);
  return {
    ...encoded,
    symbols,
    decoded: roundTrip.phonemeKeys,
    decodeWarnings: roundTrip.warnings,
  };
}
