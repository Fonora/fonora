---
status: Active
date: 2026-06-23
phase: phase-1
---

# One script for every language

## Research Question

[RN-04](/research/notes/vowels-as-grammar-the-v3-rebuild) rebuilt English vowels as a fixed symbol grammar and added `ENGLISH_IPA_VOWEL_NORMALIZATION` so the encoder could collapse KIT/FLEECE, STRUT/schwa/NURSE, and LOT/THOUGHT variants without `?` fallbacks. That overlay was written for English stress patterns and documented as engineering, not linguistic truth, but it was merged unconditionally into every call to `normalizeIpa()`.

RN-04 closed by asking whether those English-specific vowel rules would survive contact with languages whose inventories English never stress-tested. The articulation grid itself is language-agnostic: place and manner compose the same way whether the word is English, Spanish, or Arabic. [RN-02](/research/notes/teaching-the-machine-to-hear) had already wired a `lang` parameter through eSpeak voice selection and the IPA pipeline. The practical question this note addresses is the one RN-04 deferred:

**Could a single IPA pipeline: shared consonant map, shared vowel inventory from markdown, parameterized by language, encode many languages without a bespoke ruleset for each?**

## Hypothesis

The working hypothesis was that the English work could generalize with minimal new code. Keep one pipeline (`Text + lang → eSpeak → IPA → normalizeIpa({ lang }) → encode → symbols`), add a thin per-language layer only where English engineering had diverged from the rules table, and rely on the global consonant map plus `language-rules.md` vowel inventory for everything else.

Three constraints shaped what "generalize" meant at the time:

1. **English vowel engineering must not leak into other languages.** The overlay exists to paper over English-specific inventory pressure; it is not a universal phonology layer.
2. **Per-language behavior should be opt-in, not the default.** Non-English languages should use the rules vowel map unless someone explicitly adds a scoped overlay.
3. **Audio playback needs sensible voice mappings per locale.** Encoding without hearable playback would make cross-language testing impractical.

This was a hypothesis about pipeline architecture, not a claim that Fonora was already a complete universal script.

## Approach

### Reusing the RN-02 pipeline with `lang`

The orchestration in [`js/ipa-pipeline.js`](../js/ipa-pipeline.js) already accepted a language code. `runIpaPipeline()` resolves an eSpeak voice via [`js/language-preferences.js`](../js/language-preferences.js) (`resolveEspeakVoice`), calls `textToIpa()`, then passes `{ lang }` into `normalizeIpa()`. The Translator, Breakdown, Samples page, encoder testing harness, and pronunciation validation all thread the selected UI language through this path, documented in [`docs/multilingual-support.md`](../docs/multilingual-support.md).

Seven UI languages were registered: English (`en`), Spanish (`es`), French (`fr`), German (`de`), Japanese (`ja`), Arabic (`ar`), and Mandarin (`zh`). Preference persists in `localStorage` under `fonora-language-v1` and is shared across Translator, Breakdown, and Reader.

### Multilingual Samples as a stress test

Commit `0bf9f3a` (Jun 22, 00:41) added the Samples page ([`/learn#listening`](/learn#listening)) rendering public-domain UDHR Article 1 excerpts across all seven languages as scannable cards. Each card runs the full pipeline: native text → eSpeak IPA for that language's voice → normalization → Fonora symbols. Non-English cards carry an **experimental** label; English is the only language treated as non-experimental at this stage.

Japanese and Mandarin required special handling in [`js/samples.js`](../js/samples.js): CJK text is split into clauses before pipeline runs (punctuation-based splitting; Mandarin also splits on `，`), because eSpeak's phrase-level IPA for long CJK strings was unreliable. Japanese Samples disable audio playback entirely (`audioEnabled: false`); other languages use Piper neural voices where available, with eSpeak IPA fallback.

### Reader voices for playback testing

Commit `4a342c1` (Jun 22, 13:12) extended the Reader with language selection so encoded symbols could be replayed with locale-appropriate voices. [`js/piper-audio.js`](../js/piper-audio.js) maps each UI language to a default Piper model (`PIPER_VOICE_BY_LANG`); [`js/fonora-tts-ui.js`](../js/fonora-tts-ui.js) exposes the selector. Reader does not re-run encoding; it plays symbols already in the textarea, but multilingual playback made it possible to hear whether Translator output matched expectations per language.

The same commit filled throat-grid fricatives (`kh` / `gh` for `/χ/` and `/ɣ/`) that German *Bach*-type sounds and Arabic eSpeak output sometimes need. Those mappings live in the global consonant layer, not per-language tables.

### Scoping the English vowel overlay

Before Jun 22, `buildEffectiveVowelMap()` always merged `ENGLISH_IPA_VOWEL_NORMALIZATION` on top of the rules-derived vowel map. That table includes `o: 'o'`, collapsing Spanish eSpeak's final /o/ in *perro* (`pˈero`) onto the LOT phoneme key instead of the rules default `oh` (GOAT / `⚬⏌`).

Commit `82ac10e` (Jun 22, 13:14: two minutes after the Reader language commit) added an explicit guard:

```javascript
const lang = options.lang || 'en';
if (lang !== 'en') return base;
return mergeEnglishVowelNormalization(base);
```

Non-English languages now use [`language-rules.md`](../docs/language-rules.md) vowel IPA mappings directly. English keeps the engineering overlay. Default `lang` remains `'en'` when omitted: a footgun for internal helpers like `encodeFromIpa()` that still default to English normalization, called out in the multilingual docs as test/tool-only behavior.

Commit `5736c83` (Jun 22, 13:17) captured the resulting architecture in [`docs/multilingual-support.md`](../docs/multilingual-support.md): the two-layer vowel model, global supplemental consonant map, throat fricative cross-reference, known limitations, and regression test inventory.

## Evaluation

There was no formal user study or native-speaker panel. Evaluation was engineering-driven: regression tests, the Samples page as a visual corpus, and the Open Problems page (`1ff9139`, same afternoon) surfacing documented gaps for contributors.

**The *perro* regression.** The bug that motivated the overlay scoping became the canonical multilingual test case. [`js/tests-core.js`](../js/tests-core.js) asserts that `normalizeIpa('pˈero', { lang: 'es' })` yields phoneme string `peroh` and display `p e r oh`, while the same IPA with `lang: 'en'` still yields `pero` under English LOT routing. [`js/tests.js`](../js/tests.js) runs a full eSpeak integration test: `translateIpaPhrase('perro', …, 'es', { lang: 'es', voice: 'es' })` must produce symbols `∋⚬⌇ᵔ⌓⚬⏌` and normalized phonemes `p e r oh`. `perro` also appears in [`js/encoder-test-sets.js`](../js/encoder-test-sets.js) under the Spanish category.

**Samples as informal QA.** Rendering UDHR Article 1 in seven languages exposed unmapped IPA tokens (`?` fallbacks), CJK clause-boundary artifacts, and RTL layout for Arabic, visible on the page rather than hidden in logs. Non-English output was labeled experimental precisely because no systematic readability audit existed yet.

**What was not evaluated.** No per-language vowel accuracy study (French nasal vowels, German vowel length, Arabic emphatics). No comparison of eSpeak IPA quality across scripts. No measurement of how often the global supplemental consonant map (e.g. American flap `ɾ` → `t`) distorts non-English output. The collision audit ([RN-06](/research/notes/hunting-ambiguity-in-the-script)) ran in parallel during the v3 rebuild but was not extended per language in this experiment.

## Findings

**The pipeline generalizes for Latin-script languages that share the markdown vowel inventory; once English engineering is scoped.** Spanish, French, and German UDHR excerpts encode and render through the same path as English. The *perro* fix confirmed the failure mode: not a broken grid, but an English overlay applied globally. Restricting the overlay to `lang === 'en'` fixed that class of bug without regressing English bed/bird routing that depends on `ɜ → a` and similar collapses.

**Consonants remain globally English-biased in places.** `SUPPLEMENTAL_CONSONANT_MAP` in [`js/ipa-normalize.js`](../js/ipa-normalize.js) applies regardless of `lang`. The American intervocalic flap mapping `ɾ → t` (commit `d02f3fe`) preserves English spelling-like behavior for words like *water* but would mis-encode a Spanish tapped /r/ if eSpeak emits `ɾ`. Throat fricatives `χ → kh` and `ɣ → gh` help Arabic and German where eSpeak emits those glyphs, but eSpeak often transcribes Arabic **خ** as `x` (→ back fricative `⌀∪`) rather than `χ` (→ throat `⌀⊃`), documented honestly in multilingual-support, not hidden.

**Non-Latin scripts are real gaps, not polish items.** Japanese Samples disable audio; Mandarin and Japanese rely on clause splitting because phrase-level IPA is unreliable. Arabic unmapped phonemes (`ʔ`, `ħ`, `ʕ`), tones, and emphatics still fall back to `?` or default vowel `a` per [`docs/IPA-PIPELINE-REPORT.md`](../docs/IPA-PIPELINE-REPORT.md). There are no per-language vowel tables, only English has an engineering overlay; Spanish /o/ works because the shared rules map happens to align, not because Spanish was modeled independently.

**The split source of truth grew a language dimension.** RN-02 documented three layers (markdown rules, supplemental consonants, English vowel overlay). RN-05 adds a fourth concept: *language-scoped* application of the third layer. The architecture is cleaner, but the underlying tension remains, vowel truth still lives in markdown, English exceptions in code, and consonant variants in a global supplemental table with English-oriented choices.

**Honest degradation held.** Unknown IPA still maps to fallback vowel `a` with warnings rather than silent invention. Samples mark non-English output experimental. The project did not claim multilingual completeness; it claimed a reproducible pipeline worth testing further.

## What Changed

Surviving decisions in the current codebase:

- **`lang` threaded through normalization and pipeline surfaces**: documented in [`docs/multilingual-support.md`](../docs/multilingual-support.md).
- **English-only vowel overlay**: `buildEffectiveVowelMap()` applies `ENGLISH_IPA_VOWEL_NORMALIZATION` only when `lang === 'en'`.
- **Seven UI languages** with shared rules vowel inventory and locale-specific eSpeak/Piper voices.
- **Samples page** as the primary multilingual visual demo.
- **Regression tests** locking *perro* and lang-scoped vowel behavior.

What did not survive as "done":

- **Universal script claim.** CJK and Arabic remain partial; native-script input is listed as future work in the IPA pipeline report.
- **Single global normalization table.** The experiment proved per-language scoping is necessary; it did not build per-language tables beyond English.

Later notes in sequence:

- **RN-06: Hunting ambiguity in the script** (exhaustive collision inventory; homograph hazards that multiply as more sounds concatenate; the question RN-05's stub explicitly deferred)
- **RN-07: Can words grow from a grid? (Gen 1 and Gen 2)** (Phase II begins: what language should sit on top of a script that can now write sounds from multiple source languages)
- **RN-08: Meaning from coordinates: the Gen 3 DDA experiment** (inverting vocabulary generation from grid coordinates rather than English roots)

## Open Questions

The experiment confirmed the pipeline *can* serve multiple languages from one grid, but only where eSpeak IPA, the shared vowel inventory, and global consonant supplements align with the target language. Unresolved questions that motivated what came next:

- **Collision surface area:** Supporting more sounds and more languages multiplies the ways symbols concatenate. Where does the composable script produce ambiguity, exact collisions, greedy-decoder hazards, vowel+glide sequences that read like diphthongs, and how would we know systematically? (This became RN-06's central question.)
- **Per-language consonant tables:** Should `ɾ → t` and similar English-oriented supplemental mappings become language-guarded, the way vowel overlays did? What is the pattern for adding `if (lang === 'xx') merge…` without exploding maintenance burden?
- **Per-language vowel overlays:** Spanish currently works via shared rules, not a Spanish table. Will French nasal vowels or German vowel length eventually require scoped overlays beyond markdown?
- **Native script input:** Can eSpeak's IPA from Latin transliteration ever be good enough for CJK and Arabic, or does the pipeline need a preprocessing step before phonetics?
- **Authoritative layer:** When rules, global supplements, and English overlay disagree, which layer wins for which language, and how should that be documented for contributors?

## References

**Related commits**
- `f361984`: added `ENGLISH_IPA_VOWEL_NORMALIZATION` (context: overlay existed before scoping)
- `0bf9f3a`: multilingual Samples page with UDHR Article 1 across seven languages
- `4a342c1`: Reader language selection; throat fricatives `kh`/`gh`; collision audit refresh
- `82ac10e`: restrict English vowel overlay to `lang === 'en'`; *perro* regression tests
- `5736c83`: `docs/multilingual-support.md` and doc cross-links
- `1ff9139`: Open Problems page surfacing multilingual and encoding gaps
- `d02f3fe`: global `ɾ → t` flap mapping (English-oriented supplemental consonant)

**Documentation:** [`docs/multilingual-support.md`](../docs/multilingual-support.md), [`docs/IPA-PIPELINE-REPORT.md`](../docs/IPA-PIPELINE-REPORT.md), [`docs/ipa-normalize.md`](../docs/ipa-normalize.md)

**Interactive demo:** Samples ([`/learn#listening`](/learn#listening)), Transliterate ([`/script#translator`](/script#translator))

**Source:** [`js/ipa-normalize.js`](../js/ipa-normalize.js), [`js/language-preferences.js`](../js/language-preferences.js), [`js/samples.js`](../js/samples.js)

**Future research notes:** RN-06 (collision audit), RN-07 (Gen 1/2 vocabulary), RN-08 (Gen 3 DDA coordinates)
