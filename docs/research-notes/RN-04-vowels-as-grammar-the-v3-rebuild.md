# Vowels as grammar: the v3 rebuild

## Research Question

[RN-03](/research/notes/vowel-mergers-v2) tested how far English vowels could be compressed into thirteen phoneme keys with the v2 double-vowel marker (`⚬⚬`). Cross-key distinctions held, *cat*, *cot*, and *cut* encoded differently, but within-key mergers produced high-frequency homographs: *bed* / *bird*, *now* / *go*, and *hot* / *caught* / *father* / *car* shared symbols inside merged keys. The decision report written that evening recommended deferring any mapping change until stakeholders chose between inventory size, phonetic precision, and learner readability.

The question this note addresses is the one RN-03 left open when splitting keys one at a time looked possible but inelegant:

**Could vowels be expressed as a fixed, predictable symbol grammar, rather than a flat list of merged keys, so fidelity improves without the inventory ballooning?**

RN-03 showed that adding keys risked concatenation hazards (`o + w` ↔ `ow`, `e + y` ↔ `ay`) and that unused recipe slots could absorb splits without new base glyphs, but not that those splits would stay visually coherent. v3 tested whether changing the *shape rules* for vowels could resolve the worst collisions while keeping simple vowels at exactly two symbols.

## Hypothesis

The working hypothesis was that vowels could anchor on the same manner and place axes already used for consonants. If every simple vowel were forced to `⚬X` (two symbols) and every diphthong to `⚬XᵔY` (four symbols), vowels would become parseable by rule rather than by memorizing which keys shared a double-vowel prefix.

Two specific predictions followed:

1. **Routing GOAT diphthong (`oʊ`) to the `oh` key**: already a monophthong slot, would split MOUTH (`aʊ`) from GOAT diphthong without a new composite key, fixing the *now* / *go* collision RN-03 flagged as the most pedagogically damaging diphthong merge.
2. **Retiring `⚬⚬` and assigning the vowel-class glyph `X` to manner or place tokens** (voice, friction, nasal, throat, back_tongue) would shrink symbol strings and allow load-time validation to reject legacy double-vowel output automatically.

Some intentional merges, STRUT/schwa in `a`, LOT/THOUGHT/PALM in `o`, were expected to remain acceptable for inventory size. This was a hypothesis about grammar and routing, not a claim that all v2 homographs would disappear.

## Approach

### Timing: report baseline, then immediate rebuild

On Jun 21, 2026, the v2 experiment closed in a tight sequence. Commit `e29501a` (18:17) froze the v2 rules and added [`docs/FONORA_VOWEL_DECISION_REPORT.md`](../archive/FONORA_VOWEL_DECISION_REPORT.md). Eleven minutes later, `35ec0ea` (18:28) replaced v2 entirely; the report's "defer mapping changes" recommendation was bypassed in favor of a grammar rebuild. Follow-up commits the same evening refined symbols (`274e005`: glide `⌣` → `ᵔ`, middle tongue `◠` → `⌓`) and added `ENGLISH_IPA_VOWEL_NORMALIZATION` (`f361984`) so NURSE vowels mapped to key `a` after removal from the `e` row. The note date (Jun 22) reflects when the architecture stabilized.

### Fixed grammar in `language-rules.md`

[`docs/language-rules.md`](../docs/language-rules.md) declares `fonora_version: v3`. Vowel tables split into **Simple Vowels (`⚬X`)** and **Diphthongs (`⚬XᵔY`)**. Recipes compose at load time via `composeVowelFromRecipe()` in [`js/symbol-compose.js`](../js/symbol-compose.js).

The inventory dropped from thirteen keys to eleven. Simple vowels no longer use `⚬⚬`; `X` is a manner or place class (`e` → `vowel, voice`; `ae` → `vowel, friction`; `o` → `vowel, back_tongue`; `oh` → `vowel, nasal` absorbing `oʊ`; `a` → `vowel, throat`). FOOT and GOOSE merged into a single `u` key. MOUTH diphthong `aʊ` stays on `ow`; GOAT diphthong moved to `oh`. Diphthongs use fixed four-symbol recipes (`eye`, `ow`, `oy`, `ay`).

### Load-time enforcement and validation

[`js/vowel-grammar.js`](../js/vowel-grammar.js) defines allowed vowel-class glyphs, rejects `⚬⚬`, and validates shape via `validateVowelSymbolString()`. [`js/load-language-rules.js`](../js/load-language-rules.js) calls `assertVowelInventoryGrammar()` at startup when `fonora_version === 'v3'`.

[`js/vowel-architecture-set.js`](../js/vowel-architecture-set.js) lists thirteen probe words; [`js/vowel-architecture-validation.js`](../js/vowel-architecture-validation.js) runs them through pronunciation validation and checks grammar compliance. The Pronunciation Validation UI gained a dedicated panel (commit `35ec0ea`; see [`docs/pronunciation-validation.md`](../docs/pronunciation-validation.md)). Unit tests in [`js/tests-core.js`](../js/tests-core.js) assert the same on IPA fixtures.

The v3 commit also stopped inserting spaces between phoneme symbol groups in the translator, contiguous output bundled with the vowel rebuild because v2's longer chains had made word-level spacing misleading.

## Evaluation

There was no formal user study. Evaluation was engineering-driven: load-time grammar assertions, unit tests, the thirteen-word architecture set, and rerunning pronunciation-validation and collision tooling against the new inventory.

**Grammar compliance.** `npm test` encodes fixed IPA fixtures for all architecture words, asserts no `⚬⚬`, and validates each vowel symbol. All unit tests pass at time of writing.

**Round-trip integrity.** The architecture set uses the RN-02 pipeline (eSpeak → normalize → encode → decode). Primary success remains source IPA == recovered IPA; grammar pass is a secondary gate on vowel shape.

**Collision audit.** Commits `35ec0ea` and `274e005` regenerated [`docs/FONORA_COLLISION_AUDIT.md`](../archive/FONORA_COLLISION_AUDIT.md). Exact symbol collisions remained zero; concatenation hazards were flagged for human review.

**Informal questions the team was asking:** Do *now* and *go* encode differently? Does every markdown vowel row conform to `⚬X` or `⚬XᵔY`? Does the Sound Grid regenerate cleanly? After removing NURSE from `e`, does *bird* encode without `?` fallbacks (requiring the overlay from `f361984`)? The v2 readability suite was not redesigned for v3 within-key metrics.

## Findings

**The grammar held, and the worst diphthong homograph was resolved structurally.** *Now* maps to `ow` (`aʊ` only); *go* maps to `oh` (`o`, `oʊ`). They no longer share a symbol. `⚬⚬` is gone; any output containing it fails validation.

**Simple vowels stayed at two symbols; diphthongs at four.** The RN-01 length constraint survived, but the second symbol's meaning changed: `X` is now a manner or place class (e.g. `⌇` for DRESS, `⌀` for TRAP) rather than a repeated vowel prefix plus place.

**Not every v2 homograph was fixed, and one merge got tighter.**

| v2 collision | v3 outcome |
| --- | --- |
| *now* / *go* | **Resolved**: separate keys |
| *bed* / *bird* | **Resolved in practice**: DRESS in `e` only; NURSE IPA → `a` via overlay |
| *hot* / *caught* / *father* / *car* | **Still merged** in `o` |
| *cup* / schwa | **Still merged** in `a` |
| *book* / *boot* | **Further merged** into single `u` |

The *bed* / *bird* fix depends on `ENGLISH_IPA_VOWEL_NORMALIZATION` added three hours after v3, not on grammar alone: a second source of truth RN-02 had warned about. Inventory shrank (eleven keys, not seventeen). The decision report was marked superseded; its stakeholder matrix was bypassed. Composition became rule-driven: two symbols or four, parseable by shape.

## What Changed

v3 remains the live vowel system in [`docs/language-rules.md`](../docs/language-rules.md). Surviving decisions: fixed `⚬X` / `⚬XᵔY` grammar; manner/place-anchored vowel classes; MOUTH/GOAT split via `oh`; load-time enforcement; contiguous translator output.

Later refinements: English normalization overlay scoped to `lang === 'en'` (`82ac10e`) after Spanish corruption; glide/middle-tongue glyphs standardized (`274e005`); collision audit formalized remaining hazards (`RN-06`).

Later notes in sequence:

- **RN-05: One script for every language** (English vowel overlay scoped per language)
- **RN-06: Hunting ambiguity in the script** (exhaustive collision inventory; homograph hazards flagged for design review)

## Open Questions

v3 showed grammar can improve fidelity without key explosion, for the worst diphthong collision yes; for DRESS/NURSE only via overlay routing; for back-vowel and STRUT/schwa families, not without more keys or accepting homographs.

The follow-up that motivated RN-05:

**Would English vowel rules survive contact with languages whose inventories English never stress-tested?**

Sub-questions left open: Should LOT/THOUGHT/PALM ever split? Is NURSE → `a` via overlay honest enough, or does English need a rules-table NURSE key? When rules, runtime maps, and `ENGLISH_IPA_VOWEL_NORMALIZATION` disagree, which is authoritative? Do concatenation hazards require boundary markers across languages?

## References

**Related commits**
- `e29501a`: pre-v3 baseline and vowel decision report
- `35ec0ea`: v3 migration; `vowel-grammar.js`, architecture validation, load-time enforcement
- `274e005`: glide `ᵔ`, middle tongue `⌓`; collision audit refresh
- `f361984`: `ENGLISH_IPA_VOWEL_NORMALIZATION`; NURSE mapping without `?` fallbacks
- `82ac10e`: English overlay restricted to `lang === 'en'`

**Documentation:** [`docs/language-rules.md`](../docs/language-rules.md), [`docs/pronunciation-validation.md`](../docs/pronunciation-validation.md), [`docs/FONORA_VOWEL_DECISION_REPORT.md`](../archive/FONORA_VOWEL_DECISION_REPORT.md) (superseded)

**Interactive demo:** Sound Grid (`/script#grid`)

**Source:** [`js/vowel-grammar.js`](../js/vowel-grammar.js), [`js/vowel-architecture-validation.js`](../js/vowel-architecture-validation.js), [`js/vowel-architecture-set.js`](../js/vowel-architecture-set.js), [`js/load-language-rules.js`](../js/load-language-rules.js)

**Future research notes:** RN-05 (multilingual script), RN-06 (collision audit)
