# Hunting ambiguity in the script

## Research Question

[RN-04](/research/notes/vowels-as-grammar-the-v3-rebuild) rebuilt English vowels as fixed symbol grammar (`⚬X` / `⚬XᵔY`) and resolved the worst *within-key* homograph, *now* and *go* no longer share a symbol. It did not resolve every way symbols collide when concatenated. [RN-03](/research/notes/how-few-vowels-can-english-tolerate) had flagged sequence hazards (`o + w` ↔ `ow`, `e + y` ↔ `ay`), and RN-04 closed by asking whether concatenation hazards would require explicit boundary markers once the script met more languages.

The v2 minimal-pair suite (`npm run test:minimal-pairs`) reported "0 collision groups", but that metric only checked whether words inside five hand-picked groups encoded to *different* symbols. It did not ask whether two phoneme sequences could produce the *same* string, or whether greedy decode on unsegmented text recovered the wrong keys. Pronunciation Validation was surfacing round-trip failures on *bar*, *boy*, and *bor* that looked like bugs but often masked deeper ambiguity.

The question this note addresses is the one RN-04 deferred and RN-03 only named informally:

**Where does combining Fonora symbols produce two readings of the same string, and where does a greedy decoder take the wrong path, and can those failure modes be found systematically before we trust the script at scale?**

## Hypothesis

The working hypothesis was that ambiguity is discoverable by brute force: enumerate every encodable key, every concatenation up to a bounded length, and every greedy-decode path, surfacing collision *classes* for human judgment.

Constraints baked into the tooling: do not invent symbols to "fix" collisions; separate language-design trade-offs from code bugs; regenerate the report from the live rules bundle so it stays reproducible after every change.

This was a hypothesis about diagnosability, not a claim that every hazard would have a clean fix.

## Approach

The audit did not arrive after the script was "finished." Commit `e29501a` (Jun 21, 18:17) introduced [`js/collision-audit.js`](../js/collision-audit.js), [`scripts/collision-audit.js`](../scripts/collision-audit.js), and the first [`docs/FONORA_COLLISION_AUDIT.md`](../archive/FONORA_COLLISION_AUDIT.md) in the same changeset that froze the v2 baseline and added Pronunciation Validation. Eleven minutes later, `35ec0ea` migrated to v3 and regenerated the report. The module loads the active bundle from [`js/load-rules-fixture.js`](../js/load-rules-fixture.js), composes symbols at load time, then analyzes, rules-version-agnostic by design.

[`runFullCollisionAudit()`](../js/collision-audit.js) runs four passes:

1. **Inventory**: every grid cell, derived sound, vowel recipe, reserved gap, and IPA mapping row.
2. **Exact collisions**: two distinct keys sharing one symbol string (fatal if found).
3. **Concatenation collisions**: phoneme sequences up to length two whose joined symbols match a single key (`sequence-equals-single`) or another sequence (`sequence-equals-sequence`).
4. **Greedy decode + word round-trips**: unsegmented strings through `decodeSymbols()` vs space-aware `decodeToPhonemeKeys()`, plus a fixed word list (*bar* / *boy* / *bor* and stress tokens *tht*, *ts*, *pb*) through the full eSpeak pipeline.

A companion review, [`docs/FONORA_CLEANUP_AUDIT.md`](../archive/FONORA_CLEANUP_AUDIT.md) (Jun 21), surveyed wider architecture the same week and flagged overlapping test fixtures; the collision report's section 6 documents what `test:minimal-pairs` does *not* cover.

The audit is read-only: [`npm run audit:collisions`](../package.json) writes markdown; it does not mutate rules. Pronunciation Validation reuses `findConcatenationCollisions()` for warnings ([`docs/pronunciation-validation.md`](../docs/pronunciation-validation.md)). Tests in [`js/tests-core.js`](../js/tests-core.js) lock in known hazard classes without pretending they are fixed.

## Evaluation

No user study, evaluation was the audit itself, re-run after every material rules change until the Jun 22 v3 report stabilized. `npm run audit:collisions` produces the full markdown report; Pronunciation Validation's batch mode and v3 architecture word set provide a second lens.

Informal questions at the time: does "0 collision groups" mean the script is collision-free or only that thirteen words differ within five groups? Did v3 fix *bar* / *boy* / *bor* round-trips? Which hazards are acceptable design trade-offs versus bugs? Should CI fail on sequence collisions or only exact duplicates?

The minimal-pair suite ([`js/vowel-v2-collision-groups.js`](../js/vowel-v2-collision-groups.js)) was evaluated as a *metric* and found insufficient for its implied scope, not wrong, but misleading if read as a full audit.

## Findings

**Exact symbol collisions: zero.** No two distinct encodable phoneme keys share the same composed symbol string under v3 rules. The compositional grid, vowel recipes, and derived sounds each map to unique glyphs at the single-key level. This was the bar the project needed to clear before treating the inventory as internally consistent.

**Concatenation hazards: real, structured, and mostly unresolved by design.** The Jun 22 v3 report found four sequence-equals-single collisions and fifteen sequence-equals-sequence collisions. The single-key class is entirely vowel+glide versus diphthong:

| sequence | equals | symbols | risk |
| --- | --- | --- | --- |
| `o + y` | `oy` | `⚬∪ᵔ∪` | CHOICE diphthong vs back vowel + /j/ |
| `e + y` | `ay` | `⚬⌇ᵔ∪` | FACE diphthong vs DRESS + /j/ |
| `a + y` | `eye` | `⚬⊃ᵔ∪` | PRICE diphthong vs STRUT + /j/ |
| `a + w` | `ow` | `⚬⊃ᵔ∋` | MOUTH diphthong vs STRUT + /w/ |

These are documented homograph risks, v3's diphthong grammar concatenates in ways that mirror vowel+glide sequences. Pipeline spacing (`o y` vs `oy`) mitigates greedy decode but not visual ambiguity in unsegmented text.

The sequence-equals-sequence class is dominated by **derived reverse orderings**: `th` (`∩⌀`) and `dh` (`∩⌇`) share glyph chains with grid sequences (`th + t` ↔ `t + s`, `dh + t` ↔ `t + d`, `v + p` ↔ `p + b`, etc.): a trade-off of visually distinct derived symbols over prefix-free codes.

**Greedy decoder hazards: twenty cases.** Vowel+glide collisions are spacing-fixable; derived-order collisions are not: two key sequences genuinely share one string.

**Word round-trips:** After v3, *bar*, *boy*, and *bor* round-trip cleanly; v2 had four boundary failures on *bar* / *car* / *far* / *for*. Stress tokens *tht*, *ts*, *pb* still mismatch because eSpeak letter-name pronunciations hit sequence collisions, edge cases that prove round-trip success on a curated list does not make the script self-delimiting.

**Test metric clarified** (`fd89860`): `test:minimal-pairs` checks five groups / thirteen words only; `audit:collisions` is the exhaustive check. No boundary markers or recipe changes were applied, human design calls remain open per the report's fix order.

## What Changed

The audit became a permanent diagnostic layer: `npm run audit:collisions`, Pronunciation Validation warnings, and unit tests that document hazard classes without hiding them. Open hazards remain as flagged: four vowel+glide pairs, fifteen derived-order collisions, no script-level boundary marker.

Later notes:

- **RN-05: One script for every language** (parallel work Jun 22–23; deferred per-language collision analysis)
- **RN-07: Can words grow from a grid? (Gen 1 and Gen 2)** (Phase II: what language sits on a script that can write sounds, and can vocabulary be generated?)
- **RN-08: Meaning from coordinates: the Gen 3 DDA experiment** (coordinate-driven roots; compound-boundary scoring applies a separate collision concept at morpheme joins)

## Open Questions

The audit answered "can we find ambiguities?" and "are there zero exact duplicates?", yes to both for v3. It did not answer "which ambiguities should we accept?", hence this note remains *Open*.

Unresolved design calls: vowel+glide vs diphthong homographs; whether derived reverse orderings are worth their sequence collisions; whether pipeline spacing conventions apply to human-written contiguous text; CI failure policy; per-language collision surface (RN-05 added seven languages without extending the word-risk list).

The stub's follow-up question; once the script could be audited, what *language* should sit on top, and could vocabulary be generated rather than borrowed?, became **RN-07**.

## References

**Related commits**
- `0b31486`: initial language-system cleanup audit (companion review)
- `e29501a`: collision audit module, pronunciation validation, v2 baseline capture
- `35ec0ea`: v3 migration; first v3 collision report; bar/boy/bor round-trip fix
- `274e005`: glide `ᵔ`, middle tongue `⌓`; collision audit refresh
- `f361984`: IPA vowel normalization overlay; audit refresh
- `fd89860`: docs alignment; test-suite scope clarification; consonant map from markdown
- `4a342c1`: throat fricatives `kh`/`gh`; Reader language selection; audit refresh

**Documentation:** [`docs/FONORA_COLLISION_AUDIT.md`](../archive/FONORA_COLLISION_AUDIT.md), [`docs/FONORA_CLEANUP_AUDIT.md`](../archive/FONORA_CLEANUP_AUDIT.md), [`docs/pronunciation-validation.md`](../docs/pronunciation-validation.md)

**Interactive demo:** Pronunciation Validation ([`/tools#pronunciation-validation`](/tools#pronunciation-validation))

**Source:** [`js/collision-audit.js`](../js/collision-audit.js), [`scripts/collision-audit.js`](../scripts/collision-audit.js)

**Future research notes:** RN-05 (multilingual script), RN-07 (Gen 1/2 vocabulary), RN-08 (Gen 3 DDA coordinates)
