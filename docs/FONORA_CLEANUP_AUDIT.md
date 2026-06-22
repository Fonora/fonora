# Fonora Language System Cleanup Audit

> **Post-cleanup addendum (June 2026)** — UI and pipeline changes after this audit:
>
> - **Rules version:** v3 (`fonora_version: v3`, vowel grammar `⚬X` / `⚬X⌣Y`); v2 double-vowel `⚬⚬` retired.
> - **Removed UI:** Mini Dictionary, Decode panel, separate Keyboard Mapping tab. Keyboard mapping merged into **Keyboard** page.
> - **Removed pipeline feature:** Glossary / dictionary bypass (`glossary.js` deleted); all words use eSpeak IPA.
> - **Tests:** `npm test` now **46/46** assertions (was 37/37 at audit time).
> - **Alphabet tab:** Sound grid / vowels / CV previews replaced with A–Z reference chart.
> - **Tier 3 refactor (June 2026):** `experimentalVowels` → `rules.vowels`; `specialDerivedSounds` → `rules.derivedSounds`; `#vowels-section` DOM ids; dead `#experimental-derived-section` removed; `CONSONANT_MAP` generated from markdown at load + `SUPPLEMENTAL_CONSONANT_MAP`.
>
> Findings below remain largely valid unless contradicted by this addendum.

**Branch:** `cleanup-language-system-review`  
**Date:** 2026-06-21  
**Scope:** Full read-only audit of language rules, encoder/decoder, IPA pipeline, UI, and automated tests. No core mapping changes. Low-risk doc/label fixes only.

---

## Summary

Fonora’s architecture is coherent and largely matches `language-rules.md` as the intended source of truth. The production path is:

```
Text → eSpeak NG → IPA → ipa-normalize.js → Fonora phonemes → encodeSounds() → symbols → decode.js
```

**Strengths**

- Markdown-driven places, modifiers, sound grid, vowel recipes, derived sounds, and IPA supplemental mappings compose correctly at load time.
- `npm test` passes **48/48** assertions (unit + integration; count grew after audit).
- Vowel report scripts run successfully and regenerate consistent output under current rules.
- Legacy spelling encoder files (`normalize.js`, `encoder-rules.md`, `encoder-pipeline.js`) are gone.

**Main issues**

1. **Split source of truth:** consonant IPA→phoneme mapping lives in hardcoded `CONSONANT_MAP` (`js/ipa-normalize.js`), not in markdown.
2. **Legacy naming:** production vowels stored as `experimentalVowels`; derived sounds as `specialDerivedSounds`.
3. **Undocumented runtime behavior:** `/h/` encodes via friction+throat symbol reuse when plain throat is reserved for vowels.
4. **Test gaps:** no automated homophone assertions; pronunciation testing is manual review only; `npm test` mostly skips eSpeak.
5. **Stale artifacts:** spelling-era issue tags, dead UI section, unused exports, overlapping test fixtures, outdated docs (partially corrected in this branch).

---

## Architecture Findings

### Intended data flow

| Stage | Module | Input | Output |
| --- | --- | --- | --- |
| Rules load | `load-language-rules.js` | `language-rules.md` | Parsed rules + `ipaVowelMap` |
| Composition | `symbol-compose.js` | Parsed rules | Composed grid/vowel/derived symbols |
| Registry | `buildSymbolRegistry()` | Composed rules | Place/modifier/vowel lookup |
| IPA normalize | `ipa-normalize.js` | Raw IPA | Fonora phoneme string |
| Encode | `encode.js` | Phoneme string | Fonora symbols |
| Decode | `decode.js` | Symbol string | Phoneme string |
| Pipeline | `ipa-pipeline.js` | English/multilingual text | Full result object |

### Where the source of truth should live

| Concern | Current source | Recommended source |
| --- | --- | --- |
| Primary symbols (5 places + 4 modifiers + ⚬) | `language-rules.md` | Keep in markdown |
| Sound grid sounds/IPA | `language-rules.md` | Keep in markdown |
| Vowel recipes + IPA tokens | `language-rules.md` | Keep in markdown |
| Derived sound compositions | `language-rules.md` | Keep in markdown |
| IPA supplemental mappings | `language-rules.md` | Keep in markdown |
| Consonant IPA→phoneme map | **Hardcoded** `CONSONANT_MAP` | Generate from grid + derived at load, or add markdown section |
| Throat `/h/` override | **Hardcoded** in `rules.js` (audit) | Grid + tests use plain `⊃`; see mismatch table note |
| CV demo examples | Hardcoded in `symbol-compose.js` | Optional markdown section or keep as UI-only |
| Alphabet primary overrides | `localStorage` via `alphabet-overrides.js` | Keep as runtime experiment layer |

### Functions doing too much

| Module | Concern |
| --- | --- |
| `load-language-rules.js` | Parses markdown, builds IPA map, builds registry, validates, loads bundles — consider splitting parser vs runtime builder |
| `rules.js` | Facade + encode/decode entry builders + throat `/h/` override + keyboard map + re-exports |
| `app.js` | UI wiring, rules loading, grid rendering, translator, quiz, alphabet lab bootstrap |
| `encoder-testing.js` | Session management, pipeline execution, filtering, review persistence, export |

### Naming problems

| Name | Problem | Better name |
| --- | --- | --- |
| `experimentalVowels` | All 13 production vowels | `vowels` |
| `specialDerivedSounds` | Defined derived sounds (`th`, `dh`, `v`, `z`) | `derivedSounds` |
| `encodeSounds(pronunciation)` | Input is Fonora phoneme keys, not IPA or English | `encodePhonemes(phonemeString)` |
| `ipaPhonemesToFonora()` | Input is already normalized phonemes | `phonemesToFonora()` |
| `ipa-to-fonora.js` | Misleading layer name | `phoneme-to-fonora.js` |
| `languageSpelling` (removed glossary field) | Was Fonora symbol output in deleted dictionary UI | N/A — feature removed |
| `#experimental-vowels-section` | Visible production vowel table | `#vowels-section` |
| `getDefinedSounds()` | Returns phoneme keys | `getEncodablePhonemeKeys()` |

---

## Markdown vs Runtime Alignment

### Aligned

| Markdown concept | Runtime | Status |
| --- | --- | --- |
| 5 places (∋ ∩ ◠ ∪ ⊃) | Composed into grid | ✓ |
| 4 manner modifiers + vowel ⚬ | Composed into grid | ✓ |
| Sound grid (plain + 4 manners × 5 places) | `composeGridSymbol()` | ✓ |
| 13 vowel keys with recipes | `composeVowelFromRecipe()` | ✓ |
| Derived sounds (`th`, `dh`, `v`, `z`) | `DERIVED_COMPOSITIONS` | ✓ |
| IPA supplemental `ɚ → a, r` | Merged into `ipaVowelMap` | ✓ |
| Config `fonora_version: v3`, `ipa_vowel_mode: v3` | Bundle metadata | ✓ |
| Reserved throat manner cells | Excluded from encode/decode | ✓ (with `/h/` override) |

### Mismatches

| Issue | Details | Severity |
| --- | --- | --- |
| Hardcoded consonant map | `CONSONANT_MAP` in `ipa-normalize.js` must be manually synced with grid/derived sounds. Extra mappings (`ts→c`, `dz→j`, `β→v`, etc.) exist for multilingual IPA but are not documented. | **High** |
| Throat `/h/` encoding | Plain throat ⊃ documents `/h/` in grid; unit tests expect `h` ↔ `⊃`. Earlier audit noted a possible friction+throat remap — not in current `encodeSounds()` path. | **Low** (verify if IPA pipeline differs) |
| IPA vowel token collisions | `buildIpaVowelMapFromVowels()` last-writer-wins when rows share IPA tokens. The `e` row claims `ɛ, e, eː, ɜ, ɜː` alongside other mappings. | **Medium** |
| `plain` modifier | Used in sound grid but not listed in modifiers table. Works (`plain` → empty prefix). | **Low** |
| Middle tongue plain `c` | Markdown IPA: `/tʃ/ or /c/`; grid sound is `c`; normalize maps `tʃ→c`, `ts→c`. | **Low** (document) |
| README “embedded fallback” | README claimed embedded rules on load failure; app actually sets `rules: null` and disables features. **Fixed in this branch.** | **Low** |
| `IPA-PIPELINE-REPORT.md` “5 vowel categories” | Stale v1 description. **Fixed in this branch.** | **Low** |

### Legacy / experimental / dead paths

| Item | Location | Notes |
| --- | --- | --- |
| `composeVowelSymbol()` plane/component path | `symbol-compose.js` | No markdown rows use `plane`/`component`; recipe-only vowels |
| `derivedSymbols` / `vowel_carrier` | Parser + `getDerivedSymbol()` | Section absent from markdown; always `[]` |
| `vowelSymbolAliases` | Cleared on every compose | Included in decoder but never populated |
| `isVowelQuizCell()` `⊐` prefix check | `vowel-display.js` | Vowel-plane v1 artifact |
| Legacy section names in parser | `load-language-rules.js` | `special derived sounds`, `experimental derived sounds` fallbacks |
| `#experimental-derived-section` | `index.html` + `app.js` | Always hidden; superseded by `#derived-sounds-section` |
| `composeVowelSymbol` alternate plane | `symbol-compose.js` | Unused with current markdown |
| `scripts/vowel-normalize-experiment.js` | Orphan script | No npm script; open-vowel experiment |
| Spelling-era issue tags | `encoder-testing.js`, `index.html` | `double-letter issue`, `silent-letter issue` |

---

## Duplicated Logic

| Duplication | Locations | Recommendation |
| --- | --- | --- |
| `MODIFIER_ROW_ORDER` | `rules.js`, `symbol-compose.js` | Single export from `symbol-compose.js` |
| Recipe token splitting | `load-language-rules.js`, `symbol-compose.js` | Shared `parseRecipeTokens()` |
| IPA map registration | `tests-core.js`, `app.js`, `load-rules-fixture.js` | Use `applyIpaVowelMap()` consistently |
| Vowel collision fixtures | `vowel-test-sets.js` (8 groups), `vowel-v2-collision-groups.js` (5 groups) | Consolidate or document distinct purposes |
| English dialect words | `encoder-test-sets.js` category + `getEnglishDialectComparisonEntries()` | Remove redundant category |
| Encode+decode round-trip | `ipa-to-fonora.js`, `ipa-pipeline.js`, `encoder-testing.js` | Keep thin wrappers; avoid a third copy |

---

## Documentation Gaps

### Missing documentation

- Throat `/h/` → friction+throat override behavior
- `plain` grid modifier semantics
- Hardcoded `CONSONANT_MAP` and how to extend it
- IPA vowel map collision / precedence rules when rows share tokens
- Alphabet lab override scope (primaries only; recomposes dependents; A–Z chart)
- Difference between `npm test`, `test:vowels`, `test:v2-collisions`, and `audit:collisions`
- Homophone testing strategy (manual only today)
- What `Random` mode in Pronunciation Testing does (phoneme-string encoder, not IPA)

### Implemented but undocumented

- Runtime throat `/h/` remapping
- `β→v`, `ts→c`, `dz→j`, and other multilingual consonant normalizations
- `resolvePipelineOptions()` / `fonora-config.js` bundle resolution
- `symbolsFromOverrides` flag for alphabet experiments
- CV demo words and vowel length pairs composed in `symbol-compose.js`

### Documented but not fully implemented

- README “embedded fallback rules” on markdown load failure (**corrected in this branch**)
- `IPA-PIPELINE-REPORT.md` five-vowel collapse (**corrected in this branch**)
- `npm run test:v2-collisions` described as “v1 vs v2 comparison” (**corrected in this branch**)
- Automated pronunciation pass/fail (UI is manual review only)

### Human tester UX gaps

Pronunciation Testing cards show: word, lang/voice, test set, source badge, IPA, normalized phonemes, Fonora output, decoded output, symbol breakdown, warnings, manual review buttons.

**Missing for efficient review:**

- Separate “raw IPA” vs “stress-stripped IPA” (only raw IPA shown; normalized phonemes serve as phoneme breakdown)
- Automated pass/fail and failure reason
- Homophone group highlighting (same-sound-groups listed but not grouped visually)
- Expected vs actual comparison column
- Automated assertion that homophones (`eight`/`ate`) produce identical output

---

## Unused / Dead Code Inventory

### Safe to remove

| Item | Path | Rationale |
| --- | --- | --- |
| `#experimental-derived-section` HTML + hide logic | `index.html`, `app.js` | Always hidden; duplicate of derived sounds section |
| `formatWordRow()` | `js/vowel-readability-suite.js` | Defined, never called |
| `getCategoryById()` | `js/encoder-test-sets.js` | Exported, never imported |
| `allVowelTestWords()` | `js/vowel-test-sets.js` | Exported, never imported |
| `allV2CollisionWords()` | `js/vowel-v2-collision-groups.js` | Exported, never imported |
| `VOWEL_LENGTH_CV_PAIRS` | `js/vowel-test-sets.js` | Exported, never imported (pairs tested inline in `tests-core.js`) |
| `english-dialect-comparison` TEST_CATEGORY | `js/encoder-test-sets.js` | Redundant with dialect comparison button |
| `scripts/vowel-normalize-experiment.js` | `scripts/` | Orphan; no npm script |

### Needs verification before removal

| Item | Path | Rationale |
| --- | --- | --- |
| `composeVowelSymbol()` plane path | `symbol-compose.js` | Legacy; verify no external consumers or saved fixtures |
| `parseDerivedSymbolsSection()` | `load-language-rules.js` | Parser ready; may be planned feature |
| `getDerivedSymbol('vowel_carrier')` | `symbol-compose.js` | Unused now; may be planned |
| `vowelSymbolAliases` pipeline | loader + decoder | Cleared always; verify no future use |
| `applyIpaVowelMap()` | `load-rules-fixture.js` | Exported but unused; useful refactor target |
| `loadRulesFixture()` | `load-rules-fixture.js` | Only used internally; could stay private |
| `encodeFromIpa` re-export | `vowel-v2-collision-suite.js` | Re-exported, verify no external importers |
| Spelling-era issue tags | `encoder-testing.js` | May still help human reviewers describe failures |
| `isVowelQuizCell()` `⊐` check | `vowel-display.js` | Harmless; verify quiz behavior without it |

### Should keep

| Item | Rationale |
| --- | --- |
| `encodeSounds()` / phoneme encoder | Used by pipeline, translator word input, random test mode, unit tests |
| `ipa-normalize.js` | Core IPA layer |
| `load-language-rules.js` + `symbol-compose.js` | Markdown source-of-truth pipeline |
| `encoder-test-sets.js` curated words | Pronunciation Testing harness |
| `alphabet-lab.js` + overrides | Primary symbol experiments |
| Legacy parser section fallbacks | Harmless backward compatibility for older markdown |

### Should refactor

| Item | Rationale |
| --- | --- |
| `CONSONANT_MAP` | Derive from markdown at load |
| `experimentalVowels` → `vowels` | Naming clarity |
| `specialDerivedSounds` → `derivedSounds` | Naming clarity |
| `MODIFIER_ROW_ORDER` duplication | Single source |
| `applyIpaVowelMap()` adoption | DRY in app/tests |
| Consolidate collision test fixtures | Reduce drift between vowel suites |
| Split `app.js` | Maintainability |
| Rename `languageSpelling` → `fonoraSymbols` | N/A — glossary removed |

---

## Automated Pronunciation Test Review

### Test layers

| Layer | Command | Pipeline | Assertions |
| --- | --- | --- | --- |
| Unit/integration | `npm test` | Phoneme encoder + direct IPA (`encodeFromIpa`) | **Yes** (exit 1 on fail) |
| Vowel readability | `npm run test:vowels` | Full `runIpaPipeline()` via eSpeak | Report only |
| V2 collisions | `npm run test:v2-collisions` | eSpeak → normalize → encode | Report only + console fallback count |
| Collision audit | `npm run audit:collisions` | Symbol inventory + concatenation hazards | Regenerates `docs/FONORA_COLLISION_AUDIT.md` |
| Browser | `?test` URL param | Same as `npm test` core | Console only |
| Pronunciation Testing UI | Manual | Full IPA pipeline | **Human review only** |
| Pronunciation Validation UI | Automated | Full round-trip | Pass/fail + collision warnings |

### Architecture alignment

| Check | Result |
| --- | --- |
| Text → eSpeak → IPA → normalize → Fonora | ✓ in UI and vowel reports |
| Tests validate phonetics not spelling | ✓ for IPA-path tests; phoneme encoder tests use phoneme strings intentionally |
| Failures are language-system not stale spelling encoder | ✓ legacy encoder removed; issue tags still reference spelling concepts |
| Homophones (`eight`/`ate`) expected same output | **Not automated**; words exist in `same-sound-groups` fixture for manual review |
| Vowel distinctions tested | ✓ TRAP/LOT/STRUT groups distinguish (`kaet`/`kot`/`kat`); 1 known collision group (`palm`/`pom` — identical eSpeak IPA) |

### Test output detail

| Field | `npm test` | Vowel reports | Pronunciation UI |
| --- | --- | --- | --- |
| Input word | ✗ | ✓ | ✓ |
| IPA | ✗ | ✓ | ✓ |
| Normalized IPA (stripped) | ✗ | ✗ | ✗ |
| Phoneme breakdown | ✗ | ✓ | ✓ (as normalized phonemes) |
| Fonora output | ✗ | ✓ | ✓ |
| Decoded output | ✗ | ✓ | ✓ |
| Pass/fail | ✓ | ✗ | ✗ (manual Correct/Wrong/Unsure) |
| Failure reason | Error message | ✓ in collision reports | ✗ (manual tags only) |

### Notable test findings

- **`car` decodes to `koy`** while `core` decodes to `kohr` — symbols differ but decoded form for `car` may surprise reviewers (rhotic / phoneme-key interaction).
- **Multilingual regression:** 3/13 words hit `?` fallback in v2 collision suite console output.
- **`V2_COLLISION_GROUPS` test** only checks `length === 5`; does not run collision suite in `npm test`.
- **Random test mode** uses phoneme-string encoder with IPA shown as `—` — easy to misread as broken pipeline.

### Recommended test improvements (future work)

1. Add homophone assertion suite: for each group in `same-sound-groups`, assert identical `symbols` via `runIpaPipeline`.
2. Wire `runV2CollisionSuite()` into `npm test` with exit code on unexpected collisions.
3. Add eSpeak integration tests (optional CI job; slower).
4. Replace spelling-era issue tags with phonetic tags (`vowel mapping`, `consonant mapping`, `normalization gap`, etc.).
5. Show raw vs cleaned IPA on test cards.

---

## Lint / Typecheck / Build

| Check | Available | Result |
| --- | --- | --- |
| `npm test` | Yes | **48/48 passed** |
| `npm run test:vowels` | Yes | Passed; regenerated `reports/vowel-readability-report.md` |
| `npm run test:v2-collisions` | Yes | Passed; regenerated `reports/vowel-v2-collision-report.md` |
| ESLint | No script | Not configured |
| Typecheck | No script | JSDoc types only |
| Build | No bundler | Static files + Node scripts |

---

## Changes Made in This Branch (Low-Risk Only)

| File | Change |
| --- | --- |
| `docs/FONORA_CLEANUP_AUDIT.md` | This audit report |
| `README.md` | Correct fallback behavior description; fix `test:v2-collisions` label |
| `scripts/vowel-v2-collision-report.js` | Fix stale “V1 vs V2” header comment |
| `index.html` | Fix default fallback banner text |
| `docs/IPA-PIPELINE-REPORT.md` | Fix stale “5 vowel categories” claim |
| `reports/vowel-readability-report.md` | Regenerated by `npm run test:vowels` |
| `reports/vowel-v2-collision-report.md` | Regenerated by `npm run test:v2-collisions` |

**Not changed:** core symbol mappings, encoder/decoder logic, test assertions, deletion of legacy code.

---

## Proposed Cleanup Commit Plan

Execute in small, reviewable commits after manual approval:

### Commit 1 — Documentation (done on this branch)
- Audit report + stale doc/label fixes

### Commit 2 — Safe dead code removal
- Remove `#experimental-derived-section` and unused exports (`getCategoryById`, `allVowelTestWords`, `allV2CollisionWords`, `formatWordRow`)
- Remove orphan `vowel-normalize-experiment.js` or add npm script if still wanted
- Remove redundant `english-dialect-comparison` TEST_CATEGORY

### Commit 3 — Naming refactor (behavior-preserving)
- Rename `experimentalVowels` → `vowels` (keep alias temporarily)
- Rename `specialDerivedSounds` → `derivedSounds`
- Rename DOM ids `experimental-vowels-*` → `vowels-*`
- Use `applyIpaVowelMap()` in app and tests

### Commit 4 — Single source of truth for consonants
- Generate `CONSONANT_MAP` from composed grid + derived sounds at load
- Document or markdown-specify multilingual extras (`ts`, `dz`, `β`, etc.)

### Commit 5 — Throat `/h/` documentation
- Add note to `language-rules.md` explaining encoder override
- Or promote `/h/` to explicit derived/reserved composition

### Commit 6 — Test harness improvements
- Homophone auto-tests for `same-sound-groups`
- Collision suite wired into `npm test`
- Phonetic issue tags in Pronunciation Testing UI

### Commit 7 — Consolidate vowel test fixtures
- Merge or clearly separate `VOWEL_MINIMAL_PAIR_GROUPS` vs `V2_COLLISION_GROUPS`
- Deduplicate dialect comparison fixtures

---

## Manual Review Needed

1. **Confirm `/h/` → ⌀⊃ override** is intentional and should be documented vs encoded differently in markdown.
2. **IPA vowel map precedence** when multiple rows claim the same token (especially `e` row).
3. **`car` → decoded `koy`** — is this acceptable or a decode/phoneme-key bug?
4. **Spelling-era issue tags** — rename vs keep for human reviewers?
5. **`composeVowelSymbol` plane path** — safe to delete?
6. **`derivedSymbols` parser** — planned feature or dead code?
7. **Multilingual `?` fallbacks (3/13)** — expand consonant map or accept as known gaps?
8. **Reports in git** — commit regenerated reports or gitignore `reports/`?

---

## Suggested Commit Message (Do Not Commit Yet)

```
docs: add Fonora language system cleanup audit

Audit markdown-driven rules, IPA pipeline, encoder/decoder alignment,
test coverage gaps, and dead code inventory. Fix stale README, banner,
and report labels. Regenerate vowel collision reports under current rules.
```
