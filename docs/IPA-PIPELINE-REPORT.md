# IPA Pipeline Implementation Report

## Architecture

Fonora uses a single pronunciation pipeline:

```
Text → eSpeak NG → IPA → ipa-normalize.js → encodeSounds() → Fonora symbols → decode.js
```

The former English spelling-based Legacy Encoder (`normalize.js`, `encoder-rules.md`, `encoder-pipeline.js`) has been removed.

There is **no dictionary or glossary bypass** — every word uses eSpeak IPA as the pronunciation source (`js/ipa-pipeline.js`).

## eSpeak NG integration

| Item | Detail |
|------|--------|
| Package | [`espeak-ng`](https://www.npmjs.com/package/espeak-ng) v1.0.2 |
| WASM path | `vendor/espeak-ng/espeak-ng.js` + `vendor/espeak-ng/espeak-ng.wasm` |
| Module | `js/ipa.js` |
| Voices | `en-us`, `es`, `fr-fr`, `de`, `ja`, `ar`, `zh` (+ English dialect variants) |
| License | GPL-3.0-or-later |

See [espeak-integration.md](espeak-integration.md) for setup and voice codes.

## Key modules

| File | Role |
|------|------|
| `js/ipa.js` | eSpeak NG wrapper |
| `js/ipa-normalize.js` | IPA → Fonora phoneme inventory |
| `js/ipa-to-fonora.js` | Phonemes → symbols via `language-rules.md` |
| `js/ipa-pipeline.js` | Pipeline orchestration (phrase + word) |
| `js/language-preferences.js` | UI language and English dialect persistence |
| `js/encode.js` | Longest-match phoneme string → symbol encoding |
| `js/decode.js` | Longest-match symbol string → phoneme keys |
| `js/fonora-config.js` | Active rules bundle for app and pipeline |

## Vowel system (v3)

Vowels use recipe-composed symbols from `language-rules.md`:

- Simple vowels: `⚬X` (vowel indicator + place or manner glyph)
- Diphthongs: `⚬XᵔY` (includes glide modifier `ᵔ`)

The legacy v2 double-vowel marker `⚬⚬` is retired. See [FONORA_VOWEL_DECISION_REPORT.md](FONORA_VOWEL_DECISION_REPORT.md) for historical v2 analysis only.

## Browser compatibility

- Requires HTTP server (not `file://`)
- ~18 MB first load for eSpeak WASM
- ~32 MB WASM heap typical
- GPL applies to eSpeak NG bundle

## Unmapped IPA phonemes

Retroflexes, tones, Arabic emphatics, uvulars, and other sounds outside the Fonora inventory map to `?` fallback. Vowels map to v3 phoneme keys defined in `language-rules.md`, not English orthography.

## Split source of truth (documented gaps)

| Concern | Where it lives today |
| --- | --- |
| Places, modifiers, grid, vowels, derived sounds | `language-rules.md` |
| Consonant IPA→phoneme map | Built from grid + derived at load; supplemental variants in `SUPPLEMENTAL_CONSONANT_MAP` | See [ipa-normalize.md](ipa-normalize.md) |
| Throat `/h/` encoding | Grid documents plain `⊃`; unit tests expect `h` ↔ `⊃` |
| Alphabet primary experiments | Browser `localStorage` via `js/alphabet-overrides.js` |

## Recommendations (future work)

1. Native script input for better CJK/Arabic IPA quality
2. Per-language normalize tweaks in `ipa-normalize.js`
3. Extend `SUPPLEMENTAL_CONSONANT_MAP` when eSpeak emits IPA not covered by markdown cells
4. Document or encode throat `/h/` behavior explicitly in `language-rules.md` if behavior changes
5. Consider `@echogarden/espeak-ng-emscripten` if the npm package stalls

## Related tools

- **Translator tab** — interactive pipeline with editable Fonora output
- **Pronunciation Validation** — automated encode/decode IPA round-trip ([pronunciation-validation.md](pronunciation-validation.md))
- **Pronunciation Testing** — manual multilingual review harness with export
