# Multilingual support

Fonora’s Translator, Breakdown, and Samples pages share one IPA pipeline. The **Reader** replays Fonora symbols with a language-selected TTS voice; it does not re-run encoding.

## Selectable languages

| UI code | Label | eSpeak voice (default) | Piper neural voice (Reader / Samples) |
| --- | --- | --- | --- |
| `en` | English | `en-us` (+ dialect variants) | `en_US-lessac-medium` (Reader: user choice) |
| `es` | Spanish | `es` | `es_ES-davefx-medium` |
| `fr` | French | `fr-fr` | `fr_FR-siwis-medium` |
| `de` | German | `de` | `de_DE-thorsten-medium` |
| `ja` | Japanese | `ja` |, (eSpeak IPA fallback) |
| `ar` | Arabic | `ar` | `ar_JO-kareem-medium` |
| `zh` | Mandarin | `zh` | `zh_CN-huayan-medium` |

Voice resolution: [`js/language-preferences.js`](../js/language-preferences.js). English dialects (`en-gb`, `en-sc`, …) apply only when UI language is English.

Language preference is stored in `localStorage` (`fonora-language-v1`) and shared between Translator, Breakdown, and Reader.

## Pipeline and `lang`

```
Text + lang → eSpeak NG (voice for lang) → IPA → normalizeIpa({ lang }) → encode → Fonora symbols
```

Entry point: [`js/ipa-pipeline.js`](../js/ipa-pipeline.js) (`runIpaPipeline`, `translateIpaPhrase`).

Surfaces that pass `lang` into normalization:

| Surface | Module |
| --- | --- |
| Translator | `js/app.js` |
| Breakdown | `js/breakdown.js` |
| Samples | `js/samples.js` |
| Encoder testing | `js/encoder-testing.js` |
| Pronunciation validation | `js/pronunciation-validation.js` |

## Vowel normalization (language-aware)

Vowel IPA → Fonora phoneme keys use two layers:

1. **Rules map**: built from [`language-rules.md`](language-rules.md) at load (`rules.ipaVowelMap`). Example: IPA `o` → phoneme `oh` (GOAT / ⚬⏌).
2. **English engineering overlay**: `ENGLISH_IPA_VOWEL_NORMALIZATION` in [`js/ipa-normalize.js`](../js/ipa-normalize.js). Applied **only when `lang === 'en'`** (default if `lang` omitted).

```javascript
// buildEffectiveVowelMap, simplified
if (lang !== 'en') return rulesVowelMap;
return { ...rulesVowelMap, ...ENGLISH_IPA_VOWEL_NORMALIZATION };
```

### Why this matters

English overlay intentionally collapses IPA for encoder consistency (e.g. `ɪ`→`i`, NURSE `ɜ`→`a`, LOT `o`→`o`). Applying it to Spanish caused **perro** (`pˈero`) to encode final **⚬∪** (LOT `o`) instead of **⚬⏌** (GOAT `oh`). Restricting the overlay to English fixes that class of bug for all non-English UI languages.

### Non-English languages

Spanish, French, German, Arabic, Japanese, and Mandarin use the **rules vowel map only**. There are no separate per-language vowel tables yet; they share the same Fonora vowel inventory from markdown.

## Consonant normalization (global)

Consonant IPA → phoneme keys merge:

- Grid + derived sounds from `language-rules.md`
- `SUPPLEMENTAL_CONSONANT_MAP` in `js/ipa-normalize.js`

Supplemental mappings apply **regardless of `lang`**. Examples:

| IPA | Fonora | Notes |
| --- | --- | --- |
| `ɾ` | `t` | American-style flap → spelling-like `t` (English-oriented) |
| `ɹ` | `r` | English approximant |
| `χ` | `kh` | Throat friction (⌀⊃) |
| `ɣ` | `gh` | Voiced throat (⌇⊃) |

To add language-specific consonant behavior, extend supplemental maps with language guards in `normalizeIpa` or add language-scoped tables (future work).

## Reader vs Translator

| Concern | Translator / Breakdown / Samples | Reader |
| --- | --- | --- |
| Encoding | Full IPA pipeline with selected `lang` | Uses symbols already in the textarea |
| Source IPA | Stored per word when from Translator (“Read in Reader”) | Reuses Translator word sources when available |
| Playback voice | - | Piper (if available for `lang`) with eSpeak IPA fallback |
| English dialect | eSpeak voice for IPA lookup | eSpeak fallback voice when Piper fails |

For best multilingual playback, use **Read in Reader** from the Translator so recovered IPA matches the original eSpeak output.

## Throat fricatives (cross-language)

| Symbol | Phoneme | IPA | Typical use |
| --- | --- | --- | --- |
| `⌀∪` | `x` | `/x/` | German *Bach*, Scottish *loch* |
| `⌀⊃` | `kh` | `/χ/` | Deeper throat friction; Arabic خ when eSpeak emits `χ` |
| `⌇⊃` | `gh` | `/ɣ/` | Arabic غ when eSpeak emits `ɣ` |

Note: eSpeak often transcribes Arabic **خ** as `x` (→ `⌀∪`), not `χ` (→ `⌀⊃`).

## Known limitations

- **Experimental**: non-English mappings may change; Samples mark non-English excerpts as experimental.
- **Unmapped IPA**: Arabic (`ʔ`, `ħ`, `ʕ`), tones, emphatics, and other inventory gaps still fall back to `?` or default vowel `a`. See [IPA-PIPELINE-REPORT.md](IPA-PIPELINE-REPORT.md).
- **CJK**: Japanese Samples disable audio; Chinese is split into clauses for rendering. Native-script IPA quality varies.
- **No per-language vowel tables**: only English has an engineering overlay; other languages rely on shared rules.
- **Internal helpers**: `encodeFromIpa()` and the English lexicon builder omit `lang` and default to English normalization (tests/tools only).

## Regression tests

| Test | File |
| --- | --- |
| Spanish **perro** → `p e r oh` → `∋⚬⌇ᵔ⌓⚬⏌` | `js/tests.js` (eSpeak integration) |
| `lang: es` vs `lang: en` vowel for `pˈero` | `js/tests-core.js` |
| English flap `ɾ` → `t` | `js/tests.js`, `js/tests-core.js` |
| Throat `kh` / `gh` encode-decode | `js/tests-core.js` |

Run: `npm test`

## Adding language-specific behavior

1. **Vowels**: prefer extending [`language-rules.md`](language-rules.md) if the phoneme key already exists; otherwise add a scoped overlay in `ipa-normalize.js` (pattern: `if (lang === 'xx') merge…`) and document here.
2. **Consonants**: add grid/derived IPA in markdown when possible; otherwise supplemental map in `ipa-normalize.js` + [ipa-normalize.md](ipa-normalize.md).
3. **Tests**: add a `translateIpaPhrase` integration case in `js/tests.js` and/or unit cases in `js/tests-core.js` with explicit `lang`.
4. **Reader voice**: add Piper mapping in `PIPER_VOICE_BY_LANG` ([`js/piper-audio.js`](../js/piper-audio.js)).

## Related

- [ipa-normalize.md](ipa-normalize.md), consonant map and English vowel table
- [espeak-integration.md](espeak-integration.md), WASM setup and voices
- [IPA-PIPELINE-REPORT.md](IPA-PIPELINE-REPORT.md), architecture overview
- [language-rules.md](language-rules.md), authoritative phoneme inventory
