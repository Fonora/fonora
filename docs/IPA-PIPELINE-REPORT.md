# IPA Pipeline Implementation Report

## Architecture

Fonora uses a single pronunciation pipeline:

```
Text → eSpeak NG → IPA → ipa-normalize.js → encodeSounds() → Fonora symbols → decode.js
```

The former English spelling-based Legacy Encoder (`normalize.js`, `encoder-rules.md`, `encoder-pipeline.js`) has been removed.

## eSpeak NG integration

| Item | Detail |
|------|--------|
| Package | [`espeak-ng`](https://www.npmjs.com/package/espeak-ng) v1.0.2 |
| WASM path | `vendor/espeak-ng/espeak-ng.js` + `vendor/espeak-ng/espeak-ng.wasm` |
| Module | `js/ipa.js` |
| Voices | `en-us`, `es`, `fr-fr`, `de`, `ja`, `ar`, `zh` |
| License | GPL-3.0-or-later |

## Key modules

| File | Role |
|------|------|
| `js/ipa.js` | eSpeak NG wrapper |
| `js/ipa-normalize.js` | IPA → Fonora phoneme inventory |
| `js/ipa-to-fonora.js` | Phonemes → symbols via `language-rules.md` |
| `js/ipa-pipeline.js` | Pipeline orchestration + dictionary overrides |
| `js/language-preferences.js` | UI language selection |
| `js/encode.js` | Longest-match sound → symbol encoding |

## Browser compatibility

- Requires HTTP server (not `file://`)
- ~18 MB first load for eSpeak WASM
- ~32 MB WASM heap typical
- GPL applies to eSpeak NG bundle

## Unmapped IPA phonemes

Retroflexes, tones, Arabic emphatics, uvulars, and other sounds outside the Fonora inventory map to `?` fallback. Vowels map to 13 phoneme keys defined in `language-rules.md` (core + composite), not English orthography.

## Recommendations

1. Native script input for better CJK/Arabic IPA quality
2. Per-language normalize tweaks in `ipa-normalize.js`
3. Glossary IPA overrides for known exceptions
4. Consider `@echogarden/espeak-ng-emscripten` if the npm package stalls
