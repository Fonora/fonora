import { normalizeIpa } from './ipa-normalize.js';
import { ipaPhonemesToFonora } from './ipa-to-fonora.js';

/** Encode raw IPA to Fonora symbols using a loaded rules bundle (browser-safe). */
export function encodeFromIpa(ipa, bundle) {
  const normalized = normalizeIpa(ipa, {
    vowelMode: bundle.ipaVowelMode,
    vowelMap: bundle.ipaVowelMap,
  });
  const fonora = ipaPhonemesToFonora(normalized.phonemeString, bundle.rules);
  return {
    ipa,
    phonemes: normalized.phonemeString,
    symbols: fonora.symbols,
    decoded: fonora.decoded,
  };
}
