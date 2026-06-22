# IPA consonant normalization

Module: [`js/ipa-normalize.js`](../js/ipa-normalize.js)

Raw eSpeak IPA passes through `normalizeIpa()` before encoding.

- **Vowels** — tokens from `language-rules.md`, built into `ipaVowelMap` at load time.
- **Consonants** — grid + derived IPA from markdown via `buildConsonantMapFromRules()`, merged with `SUPPLEMENTAL_CONSONANT_MAP` for multilingual variants.

`registerConsonantMapFromRules(rules)` runs when the rules bundle loads (app startup and tests).

`npm test` includes **consonant map is built from language rules**, which fails if markdown IPA tokens are missing from the active map.

## From language-rules.md (generated at load)

These IPA tokens appear in the Sound Grid or Derived Sounds tables. They are **built automatically** from `language-rules.md` — do not duplicate in code.

| IPA token | Fonora phoneme | Source |
| --- | --- | --- |
| p | p | grid plain lips |
| b | b | grid voice lips |
| t | t | grid plain front_tongue |
| d | d | grid voice front_tongue |
| tʃ | c | grid plain middle_tongue |
| c | c | grid plain middle_tongue (alternate IPA) |
| k | k | grid plain back_tongue |
| g | g | grid voice back_tongue |
| h | h | grid plain throat |
| f | f | grid friction lips |
| s | s | grid friction front_tongue |
| ʃ | sh | grid friction middle_tongue |
| x | x | grid friction back_tongue |
| m | m | grid nasal lips |
| n | n | grid nasal front_tongue |
| ɲ | ñ | grid nasal middle_tongue |
| ŋ | ng | grid nasal back_tongue |
| w | w | grid glide lips |
| j | y | grid glide front_tongue |
| r | r | grid glide middle_tongue |
| l | l | grid glide back_tongue |
| θ | th | derived th |
| ð | dh | derived dh |
| v | v | derived v |
| z | z | derived z |

Vowels and diphthongs are not in the consonant map; see vowel tables in `language-rules.md`.

## Supplemental mappings (`SUPPLEMENTAL_CONSONANT_MAP`)

These entries live in `js/ipa-normalize.js` only — not separate rows in markdown. They normalize common eSpeak IPA variants to existing Fonora phoneme keys. Rules-derived entries take precedence on conflict.

| IPA token | Fonora phoneme | Notes |
| --- | --- | --- |
| ɡ | g | Unicode g variant |
| q | k | Uvular/plosive variant → back stop |
| β | v | Voiced bilabial fricative → v |
| ʒ | j | Voiced post-alveolar → middle tongue j |
| ʎ | l | Palatal lateral → l |
| ɹ | r | English approximant |
| ɾ | r | Tap |
| ɽ | r | Retroflex flap |
| ʁ | r | Voiced uvular fricative → r |
| χ | x | Voiceless uvular fricative → x |
| ɕ | sh | Alveolo-palatal fricative → sh |
| ʐ | j | Retroflex sibilant → j |
| ɣ | g | Voiced velar fricative → g |
| ç | sh | Voiceless palatal fricative → sh |
| ʈʃ | c | Retroflex affricate → c |
| dʒ | j | Voiced affricate → j |
| ts | c | Voiceless alveolar affricate → c |
| dz | j | Voiced alveolar affricate → j |
| pf | f | Labiodental affricate → f |
| kx | x | Velar + fricative cluster → x |
| ʔ | ? | Glottal stop → unknown fallback |

When adding a **new grid or derived sound** in `language-rules.md`, add IPA tokens to the cell's `ipa` column — the map rebuilds on reload. No code change needed unless eSpeak emits IPA variants not covered by the cell notation.

When adding **new multilingual IPA** not tied to a markdown row, add to `SUPPLEMENTAL_CONSONANT_MAP` and document here.

## Related

- [IPA-PIPELINE-REPORT.md](IPA-PIPELINE-REPORT.md) — full pipeline
- [FONORA_COLLISION_AUDIT.md](FONORA_COLLISION_AUDIT.md) — symbol concatenation hazards
