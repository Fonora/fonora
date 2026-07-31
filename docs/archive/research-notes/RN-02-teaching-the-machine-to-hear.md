---
status: Active
date: 2026-06-21
phase: phase-1
---

# Teaching the machine to hear

## Research Question

[RN-01](/research/notes/writing-sound-instead-of-spelling) established that Fonora symbols could be *assembled* from place and manner primitives, but it left a practical gap: users type ordinary text, not phoneme keys. English spelling is a poor guide to pronunciation; the same letter sequence can encode different sounds, and the same sound can be written many ways. RN-01 already flagged the Legacy Encoder (a spelling-to-symbol path working directly from English orthography) as a dead end for anything beyond comparison. The question this note addresses is the one RN-01 explicitly deferred:

**How should arbitrary text, any word, in any language, from any speaker, be reliably mapped onto the articulation grid without hand-writing spelling rules for every word?**

## Hypothesis

The working hypothesis was that the project should not parse letters at all. Instead, it should obtain phonemes from a speech engine and map those onto the grid:

```
Text → eSpeak NG → IPA → normalize → encode → decode
```

If text is sent through a synthesizer configured to emit International Phonetic Alphabet (IPA) transcriptions, and those IPA tokens are normalized into Fonora's reduced phoneme inventory before encoding, spelling is sidestepped entirely. The articulation grid remains the target; IPA is merely the bridge from typed text to phoneme keys.

This was a hypothesis about *architecture*, not a claim that eSpeak's output is linguistically authoritative. eSpeak NG is a compact, browser-embeddable engine: a pragmatic choice constrained by the requirement that everything run client-side without a server-side pronunciation API.

## Approach

### Why eSpeak, and why in the browser

Fonora's first commit ("Fonora phonetic symbol research tool," Jun 20, 2026) shipped with eSpeak NG compiled to WebAssembly via the [`espeak-ng`](https://www.npmjs.com/package/espeak-ng) npm package. The wrapper lives in [`js/ipa.js`](../js/ipa.js); WASM assets are copied to `vendor/espeak-ng/` on `npm install` and loaded over HTTP (not `file://`). First load is roughly 18 MB; the WASM heap typically needs ~32 MB. That cost was accepted because a local, offline-capable pronunciation source was a hard constraint; the app had to work as a static site with no backend phonetics service.

The wrapper calls eSpeak with `--ipa=3`, strips decorative slashes and parenthetical annotations, and returns a raw IPA string. Supported voices at this stage included `en-us` (default English), plus `es`, `fr-fr`, `de`, `ja`, `ar`, and `zh`, enough to test whether the same grid could serve multiple languages, not just English.

### Pipeline orchestration

[`js/ipa-pipeline.js`](../js/ipa-pipeline.js) wires the stages together. `runIpaPipeline()` takes trimmed input, resolves language and voice options, calls `textToIpa()`, passes the result through `normalizeIpa()`, then through `ipaPhonemesToFonora()` (which delegates to `encodeSounds()` and a decode round-trip via [`js/ipa-to-fonora.js`](../js/ipa-to-fonora.js)). Phrase translation (`translateIpaPhrase()`) runs the same path word-by-word.

Each result carries the full trace: source text, raw IPA, normalized phoneme string, encoded symbols, decoded phoneme keys, warnings, and a `source` flag (`ipa` vs `fallback`) when unmapped tokens or `?` symbols appear.

### IPA normalization

[`js/ipa-normalize.js`](../js/ipa-normalize.js) is the layer between eSpeak's IPA and Fonora's phoneme keys. Its job is tokenization (longest-match multigraphs first, stress marks stripped), consonant mapping, vowel mapping, and honest degradation for unknown tokens.

**Consonants** were the simpler case. Grid cells and derived sounds in `language-rules.md` declare IPA tokens in slash notation (e.g. `/p/`, `/tʃ/`). From Jun 21 onward, `buildConsonantMapFromRules()` parses those declarations at load time and merges them with `SUPPLEMENTAL_CONSONANT_MAP`: a hardcoded table of multilingual IPA variants eSpeak emits that do not correspond to separate markdown rows (Unicode `ɡ` vs ASCII `g`, English approximant `ɹ`, retroflex flaps, uvular fricatives, and similar). Rules-derived entries take precedence on conflict.

**Vowels** were loaded from markdown at runtime via `registerIpaVowelMap()` / `setActiveIpaVowelMap()`, keyed by vowel mode. But English eSpeak output routinely includes vowel qualities the grid did not yet distinguish. To keep the encoder functional while the vowel inventory was still being designed, `ENGLISH_IPA_VOWEL_NORMALIZATION` was added (commit `f361984`, Jun 21): a temporary engineering table that collapses KIT/FLEECE weak vowels to `i`, merges STRUT/schwa/NURSE to `a`, maps LOT/THOUGHT variants to `o`, and similar. The table is merged on top of the rules vowel map and explicitly documented as "consistency over linguistic perfection."

Unknown IPA tokens that match neither consonant nor vowel maps fall back to phoneme `a` (not `?` in the phoneme string), with a warning logged. This replaced an earlier behavior from the same weekend where unmapped tokens mapped directly to `?`.

### Retiring the Legacy Encoder

The initial commit included *both* the IPA pipeline and a spelling-based Legacy Encoder (`normalize.js`, `encoder-rules.md`, `encoder-pipeline.js`). Ten minutes later, commit `2cfd7ad` ("Remove legacy encoder and expand IPA normalization coverage") deleted the spelling path entirely and expanded supplemental consonant mappings so common cross-language phonemes would not immediately fall back to `?`.

There is no dictionary or glossary bypass in the app: every word goes through eSpeak IPA as the pronunciation source. That decision has held.

### Design constraints carried forward

Three constraints from the stub shaped implementation choices:

1. **Browser-only.** WASM eSpeak, no server-side phonetics API.
2. **Honest degradation.** Unmapped IPA produces warnings and a safe fallback phoneme rather than silent invention.
3. **Single source of truth.** Aspiration, not full achievement, see Findings.

The Transliterate view (`/#translator`) exposes the pipeline interactively. Documentation was written in [`docs/IPA-PIPELINE-REPORT.md`](../docs/IPA-PIPELINE-REPORT.md), [`docs/ipa-normalize.md`](../docs/ipa-normalize.md), and [`docs/espeak-integration.md`](../docs/espeak-integration.md).

## Evaluation

There was no formal user study. Evaluation was engineering-driven: unit tests, an IPA token audit, and a dedicated pronunciation validation harness added on Jun 21 (`js/pronunciation-validation.js`, documented in [`docs/pronunciation-validation.md`](../docs/pronunciation-validation.md)).

The questions being asked were concrete:

- **End-to-end round-trip:** does text → IPA → phonemes → symbols → decode → recovered IPA preserve pronunciation for a test word set?
- **Coverage:** what fraction of eSpeak en-us IPA tokens map cleanly vs. hit fallback? The [`IPA_VOWEL_NORMALIZATION_AUDIT.md`](../archive/IPA_VOWEL_NORMALIZATION_AUDIT.md) (generated Jun 22 from 263 corpus words, 46 unique tokens) found four tokens unmapped before the engineering table and zero after, for English, at that snapshot.
- **Consonant sync:** does the active consonant map match what `language-rules.md` declares? Test `consonant map is built from language rules` in `js/tests-core.js` fails if markdown IPA tokens are missing from the map.
- **Regression traps:** American intervocalic flaps (`ɾ`) were initially mapped to glide `r`; commit `d02f3fe` changed them to `t` so *dignity* and *water* encode with plain `t` rather than a glide. English `t+s` sequences (e.g. *outside*) must tokenize as separate `t` and `s`, not merge into an affricate, commit `6e49cf1` added a regression test for this.

Pronunciation Validation's primary metric is **source IPA == recovered IPA** (after stress normalization), with secondary checks on phoneme key round-trips and collision-class warnings from the collision audit module.

## Findings

**The pipeline worked well enough to become the only input path.** Text could be typed, run through eSpeak, normalized, encoded onto the grid, and decoded back to recognizable pronunciation. The Legacy Encoder did not survive the first evening; the IPA route did.

**Consonants mapped reliably.** Grid-defined stops, fricatives, nasals, and glides covered the English consonant inventory eSpeak produced. Supplemental mappings handled multilingual variants without requiring a separate markdown row for every IPA glyph variant. The `buildConsonantMapFromRules()` refactor (commit `fd89860`, Jun 21) moved most consonant truth into markdown while keeping engineering overrides in code: a partial reconciliation of the source-of-truth goal.

**The split source of truth is real and documented, not hidden.** Consonant IPA→phoneme mapping lives in two places: `language-rules.md` (grid + derived sounds) and `SUPPLEMENTAL_CONSONANT_MAP` in `js/ipa-normalize.js`. Vowels add a third layer for English: `ENGLISH_IPA_VOWEL_NORMALIZATION`. The IPA pipeline report and `ipa-normalize.md` call this out explicitly under "Split source of truth (documented gaps)." Rules-derived entries win on conflict, but anything only in supplemental code must be maintained by hand. This is technical debt the project chose to document rather than pretend away.

**Vowels exposed the grid's weakness immediately.** Consonants behaved; vowels did not. English has more vowel qualities than the early inventory had distinct marker slots. Even with the engineering overlay collapsing lexical sets, naive mapping produced homographs; the problem that became RN-03's entire subject. The pipeline did not *cause* the vowel ambiguity, but it made it unavoidable: once spelling was bypassed, every merged vowel category became visible in real words.

**eSpeak is a pragmatic engine, not a ground truth.** Its IPA dialect differs from a linguist's narrow transcription. Fonora treats eSpeak output as the canonical pronunciation *for encoding purposes*: a reproducible, testable input, while documenting where engineering tables override or collapse its tokens. Applying the English vowel overlay to non-English languages caused real bugs (Spanish *perro* encoding LOT `o` instead of GOAT `oh`); restricting the overlay to `lang === 'en'` (commit `82ac10e`, Jun 22) was a direct consequence.

**Browser WASM is viable but costly.** ~18 MB first load and GPL licensing for the eSpeak bundle are accepted trade-offs. Mobile Safari remains memory-constrained.

## What Changed

The pipeline architecture survived essentially intact into the current codebase:

```
Text → eSpeak NG → IPA → ipa-normalize.js → encodeSounds() → Fonora symbols → decode.js
```

What evolved around it:

- **Legacy Encoder:** removed Jun 20 (`2cfd7ad`); no revival.
- **Dictionary bypass:** removed Jun 21 (`fd89860`); every word uses eSpeak IPA.
- **Consonant mapping:** migrated from a fully hardcoded `CONSONANT_MAP` (initial commit) to rules-derived + supplemental merge (`fd89860`).
- **Vowel mapping:** became the subject of the next three script-phase notes as homographs and inventory pressure mounted.
- **Multilingual scope:** seven UI languages share one pipeline; language-aware vowel normalization and Reader voice selection followed in RN-05.

Later notes trace what this pipeline made possible and where it had to be rebuilt:

- **RN-03: How few vowels can English tolerate?** (v2 double-vowel mergers; round-trips passed, bed/bird collided)
- **RN-04: Vowels as grammar: the v3 rebuild** (fixed symbol grammar replacing merged keys)
- **RN-05: One script for every language** (multilingual pipeline, language-scoped vowel overlays)
- **RN-06: Hunting ambiguity in the script** (collision audit driven partly by pipeline round-trip failures)

## Open Questions

The pipeline answered RN-01's deferred question, *how* to get from typed text to the grid, but opened others that shaped everything after Jun 21:

- **Vowel inventory:** English has far more vowel qualities than the grid had marker slots, and naive mapping produced homographs. How few vowel symbols can English actually tolerate before meaning is lost? (This became RN-03.)
- **Source-of-truth reconciliation:** can all consonant and vowel IPA mappings eventually live in `language-rules.md`, with code limited to tokenization and multigraph ordering, or is a permanent engineering overlay layer honest and necessary?
- **Multilingual fidelity:** supplemental consonant mappings and shared vowel inventory work for initial testing, but should normalization become language-scoped tables rather than one global map with English exceptions?
- **Engine choice:** is eSpeak NG's IPA output good enough for CJK and Arabic input, or does native-script preprocessing become mandatory?
- **Fallback semantics:** mapping unknown vowels to phoneme `a` keeps the encoder from emitting `?`, but is that the right default once real words are tested at scale?

## References

**Related commits**
- `63b79cf`: initial commit: IPA pipeline via eSpeak NG, legacy encoder, symbol keyboard
- `2cfd7ad`: remove legacy encoder; expand IPA normalization coverage
- `5e33e8f`: Fonora v2: markdown-driven rules, vowel planes, wire IPA pipeline to active rules bundle
- `f361984`: harden IPA vowel normalization; add `ENGLISH_IPA_VOWEL_NORMALIZATION` and audit scripts
- `fd89860`: build consonant map from language rules; remove dictionary bypass
- `6e49cf1`: rename /tʃ/ phoneme to `ch`; stop merging English ts clusters
- `d02f3fe`: map English flapped ɾ to `t`
- `82ac10e`: apply English IPA vowel overlay only when `lang === 'en'`

**Documentation:** [`docs/IPA-PIPELINE-REPORT.md`](../docs/IPA-PIPELINE-REPORT.md), [`docs/ipa-normalize.md`](../docs/ipa-normalize.md), [`docs/espeak-integration.md`](../docs/espeak-integration.md), [`docs/pronunciation-validation.md`](../docs/pronunciation-validation.md)

**Interactive demo:** Transliterate (`/script#translator`), Pronunciation Validation (`/tools#pronunciation-validation`)

**Future research notes:** RN-03 (vowel mergers v2), RN-04 (vowel grammar v3), RN-05 (multilingual script), RN-06 (collision audit)
