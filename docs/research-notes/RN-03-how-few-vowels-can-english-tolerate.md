# How few vowels can English tolerate?

## Research Question

[RN-02](/research/notes/ipa-pipeline) answered how typed text reaches the articulation grid: eSpeak NG emits IPA, normalization maps tokens to phoneme keys, and the encoder composes symbols. That pipeline worked for consonants almost immediately. For vowels it did the opposite of hiding problems; it made them unavoidable. Once spelling was bypassed, every place the inventory collapsed two Wells lexical sets into one phoneme key showed up as a real-word homograph.

RN-01 had already flagged vowels as provisional and bound to a two-symbol length constraint. RN-02 confirmed that English eSpeak output carries far more vowel qualities than early inventories had distinct slots for. The question this note addresses is the one RN-02 left open:

**English distinguishes far more vowel qualities than a compact symbol set can hold. If some sets must merge, which merges are tolerable, and how small can the inventory get before distinct words collapse into the same spelling?**

## Hypothesis

The working hypothesis was that a compact phonemic shorthand could merge lexical sets *within* a single vowel key as long as the contrasts *between* keys stayed clean. Thirteen vowel keys: nine monophthongs plus four composite diphthong keys, would be enough for English if TRAP, LOT, STRUT, and the other cross-key minimal pairs remained separable.

Four keys would deliberately absorb multiple Wells families:

- **`e`**: DRESS plus NURSE (`ɛ`, `ɜ`, length variants)
- **`a`**: STRUT plus schwa (`ʌ`, `ə`, `ɐ`)
- **`o`**: LOT, THOUGHT, and PALM/START back vowels (`ɑ`, `ɔ`, length variants)
- **`ow`**: MOUTH plus GOAT diphthong (`aʊ`, `oʊ`, `əʊ`)

The double-vowel marker **`⚬⚬`** (two consecutive `vowel` recipe tokens) would signal a merged slot without adding new base glyphs. Nine other keys (`ee`, `i`, `ae`, `oh`, `u`, `oo`, `eye`, `oy`, `ay`) would stay within a single family, absorbing only length or dialect allophony.

This was a hypothesis about inventory compression, not a claim that merged spellings would be acceptable to learners. The goal was to find the floor, how few keys could carry English before readability broke.

## Approach

### Two v2 architectures in one day

Fonora's "v2" vowel work on Jun 21, 2026 went through two designs before the decision report was written.

The morning commit (`5e33e8f`, "Fonora v2: markdown-driven rules, vowel planes") introduced a **length-plane** model: short vowels used a throat prefix `⊃` plus a place component; long vowels used `⊇` plus place. Ten keys (`a`, `e`, `i`, `o`, `u` and their long alternates `ā`, `ē`, `ī`, `ō`, `ū`) were declared in `language-rules.md` and composed at load time. That commit also shipped the first vowel test harnesses: [`js/vowel-readability-suite.js`](../js/vowel-readability-suite.js) with eight minimal-pair groups, and [`js/vowel-v2-collision-suite.js`](../js/vowel-v2-collision-suite.js) with five cross-key groups.

Seven hours later, commit `e957ff2` ("refactor: continue markdown-driven v2 language rules") replaced the plane system with **recipe-composed vowels**. A single `vowel` token renders as `⚬`; repeating it yields `⚬⚬` for merged slots. Vowels became rows in markdown tables with `key`, `recipe`, `ipa`, `lexical_set`, and `example` columns, thirteen keys total, built into `ipaVowelMap` at runtime by `buildIpaVowelMapFromVowels()` in [`js/load-language-rules.js`](../js/load-language-rules.js). The Sound Grid and Alphabet views regenerated from those tables.

The v2 system analyzed in [`docs/FONORA_VOWEL_DECISION_REPORT.md`](../archive/FONORA_VOWEL_DECISION_REPORT.md) is this recipe-composed design (`ipa_vowel_mode: v2`), not the morning plane experiment. Commit `e29501a` ("Save pre-v3 vowel system baseline before architecture migration") froze that rules file and added the decision report eleven minutes before v3 replaced it.

### Design constraints that shaped what "passing" meant

Three constraints from the stub carried through implementation:

1. **Minimize symbol count.** Fewer vowel keys are easier to learn and keep the grid visually compact. Merging within keys was an explicit compression strategy, not an oversight discovered later.
2. **Cross-key tests, not within-key fidelity.** The v2 collision suite ([`js/vowel-v2-collision-groups.js`](../js/vowel-v2-collision-groups.js)) checks whether words in each minimal-pair *group* produce distinct Fonora symbol strings, groups like *cat / cot / cut* (TRAP vs LOT vs STRUT). It does not require DRESS and NURSE to differ when both map to `e`.
3. **Two-symbol vowel grammar (v2 variant).** Simple vowels used `⚬` plus one place glyph, or `⚬⚬` plus place for merged slots. Composite diphthongs extended the recipe chain (`⚬⚬∪ᵔ∋` for `ow`, etc.), with glide token `ᵔ` separating nucleus and offglide components.

The IPA pipeline from RN-02 fed all evaluation: eSpeak en-us → `normalizeIpa()` → phoneme keys → `encodeSounds()`. At the time the decision report was written, normalization used the rules-derived vowel map directly; the `ENGLISH_IPA_VOWEL_NORMALIZATION` engineering overlay arrived later the same evening (`f361984`) and was not part of the initial v2 merger analysis.

## Evaluation

There was no formal user study. Evaluation was engineering-driven: automated test suites, a pronunciation-validation harness, and a structured decision report.

**V2 collision suite** (`npm run test:v2-collisions`, [`scripts/vowel-v2-collision-report.js`](../scripts/vowel-v2-collision-report.js)): five groups, thirteen words. Each group tests cross-key distinction, TRAP vs LOT vs STRUT, *hat* vs *hot*, *father / palm / car* as a back-vowel set. At v2, all five groups produced distinct symbol strings within each group. Zero within-group collisions. This was reported as success.

**Vowel readability suite** (`npm run test:vowels`, [`scripts/vowel-readability-report.js`](../scripts/vowel-readability-report.js)): eight groups, twenty-one words, including sets the collision suite did not cover, *pan / pawn* (TRAP vs THOUGHT), *father / fodder*, *car / core*, *palm / pom*. This suite measures collisions on the **decoded phoneme string** after the full pipeline round-trip, not just raw symbol distinctness. It was the tool that surfaced within-key homographs the collision suite was not designed to catch.

**Pronunciation validation** (22-word IPA round-trip set, documented in the decision report): source IPA matched recovered IPA at 100% for the test corpus. Round-trip integrity and readability are different metrics; the pipeline could be perfectly reversible while distinct words shared spellings.

**Vowel decision report** ([`docs/FONORA_VOWEL_DECISION_REPORT.md`](../archive/FONORA_VOWEL_DECISION_REPORT.md), added `e29501a`, dated 2026-06-22 in its header): systematic analysis of all four multi-family keys. For each key it documented IPA tokens, collapsed contrasts, real pipeline examples from eSpeak en-us, acceptability against four criteria (human readability, phonetic precision, cross-dialect tolerance, minimal symbol count), split options, and impact on existing test suites. The report explicitly made **no mapping changes**: it laid out a stakeholder decision matrix and waited for a priority call.

## Findings

**Cross-key distinctions held; within-key mergers did not.**

The v2 inventory successfully separated TRAP (`ae` → `⚬⚬⌓`), LOT/THOUGHT/PALM (`o` → `⚬⚬∪`), and STRUT/schwa (`a` → `⚬⊃`) in the groups the collision suite actually tested. *Cat*, *cot*, and *cut* encoded differently. By the collision suite's definition, the design passed.

**Readability failed on high-frequency minimal pairs inside merged keys.**

Once the readability suite and decision report ran real words through the pipeline, four merger classes produced homographs the cross-key tests never looked for:

| Key | Merged families | Example collision | Shared symbol |
| --- | --- | --- | --- |
| `e` | DRESS + NURSE | *bed* / *bird* | `⚬⚬∩` |
| `o` | LOT + THOUGHT + PALM | *hot* / *caught* / *father* / *car* | `⚬⚬∪` |
| `ow` | MOUTH + GOAT diphthong | *now* / *go* | `⚬⚬∪ᵔ∋` |
| `a` | STRUT + schwa | *cup* / medial schwa in *hello* | `⚬⊃` |

The *bed* / *bird* collision was the most damaging for learner readability: a classic English minimal pair rendered identically. The *hot* / *caught* / *car* collapse was the highest-impact merger for American English back vowels. *Now* / *go* shared a diphthong symbol even though monophthong GOAT was already routed to a separate `oh` key.

**The STRUT/schwa merge was the most defensible.** A single central lax vowel glyph for `ʌ` and `ə` matches some practical shorthand traditions and scored "moderate loss" on phonetic precision in the report. It was still a deliberate trade, not a free win.

**Passing tests masked the problem.** The decision report states this plainly: v2 collision "0 groups with collision" means minimal-pair *groups* produce different symbol strings from each other, not that English vowel families are faithfully preserved within a key. The test scope quietly defined what "passing" meant. Readability measurement was added specifically because round-trip success was insufficient.

**Splitting keys was possible without new base characters.** The report inventoried unused recipe slots (`⚬⚬⊃` for schwa, alternate composite glide permutations) that could absorb splits. Any new recipe would need concatenation hazard checks, sequences like `o + w` already collided with the `ow` composite, a constraint the collision audit would formalize later.

**No fix was applied at v2.** The report recommended deferring any mapping change until stakeholders chose between minimal inventory, learner readability, and lexical-set fidelity. Eleven minutes after the baseline was saved, commit `35ec0ea` migrated to v3 instead of patching v2 mergers in place.

## What Changed

The v2 double-vowel merger experiment was superseded rather than iterated. Its lessons survived in what came next:

- **`⚬⚬` retired.** Current rules (`fonora_version: v3`, `ipa_vowel_mode: v3` in [`docs/language-rules.md`](../language-rules.md)) use a fixed grammar: simple vowel = two symbols (`⚬X`), diphthong = four (`⚬XᵔY`). The double-vowel marker is explicitly forbidden in pronunciation-validation grammar checks.
- **Worst homographs addressed structurally, not by adding keys.** RN-04 split MOUTH from GOAT diphthong and routed vowels through manner/place anchors rather than expanding to seventeen keys.
- **Test scope clarified.** RN-06's collision audit and cleanup documentation renamed and separated `test:v2-collisions` (cross-key group distinctness) from `audit:collisions` (exhaustive concatenation hazards) and `test:vowels` (readability collisions).
- **English overlay scoped per language.** The `ENGLISH_IPA_VOWEL_NORMALIZATION` table added after the decision report (`f361984`, restricted to `lang === 'en'` in `82ac10e`) became a third vowel-mapping layer, another split source of truth RN-02 had warned about.

Later notes trace the arc:

- **RN-04: Vowels as grammar: the v3 rebuild** (fixed symbol grammar replacing merged keys; MOUTH/GOAT split without inventory explosion)
- **RN-05: One script for every language** (language-scoped vowel overlays after English rules leaked into Spanish)
- **RN-06: Hunting ambiguity in the script** (exhaustive collision audit; clarified that v2 collision "pass" did not mean ambiguity-free)

## Open Questions

The v2 experiment answered "how compact can we get?" with a concrete number, thirteen keys, and a concrete cost, high-impact homographs inside four of them. It did not answer how to fix the problem without abandoning compactness. That gap motivated the next note:

**Could vowels be expressed as a fixed, predictable symbol grammar, rather than a flat list of merged keys, so fidelity improves without the inventory ballooning?**

Splitting the worst merges one key at a time risked new concatenation hazards (`o + w` ↔ `ow`, `e + y` ↔ `ay`) and symbol-count growth. The unused recipe inventory showed splits were *possible*; it did not show they were *elegant*. RN-04 tested whether changing the grammar of vowel composition, not merely adding keys, could resolve the bed/bird and now/go collisions while keeping simple vowels at two symbols.

Secondary questions left open:

- Should STRUT and schwa stay merged in any future compact mode, or is that merge only acceptable in a shorthand system explicitly not targeting lexical-set fidelity?
- Can within-key homograph rate become a first-class test metric alongside round-trip IPA equality?
- When rules, runtime maps, and engineering overlays disagree (as they could once `ENGLISH_IPA_VOWEL_NORMALIZATION` was added), which layer is authoritative for evaluation?

## References

**Related commits**
- `5e33e8f`: Fonora v2: markdown-driven rules, vowel planes, vowel readability and collision suites
- `e957ff2`: replace plane vowels with recipe-composed `⚬` / `⚬⚬` vowel system
- `175fa80`: update vowel collision and pronunciation test support
- `e29501a`: save pre-v3 vowel baseline; add `FONORA_VOWEL_DECISION_REPORT.md`
- `f361984`: harden IPA vowel normalization; add vowel token audit tooling
- `35ec0ea`: migrate to v3 vowel architecture (supersedes v2 mergers)

**Documentation:** [`docs/FONORA_VOWEL_DECISION_REPORT.md`](../archive/FONORA_VOWEL_DECISION_REPORT.md)

**Interactive demo:** Sound Grid (`/script#grid`)

**Source:** [`js/vowel-readability-suite.js`](../js/vowel-readability-suite.js), [`js/vowel-v2-collision-suite.js`](../js/vowel-v2-collision-suite.js), [`js/vowel-test-sets.js`](../js/vowel-test-sets.js), [`js/vowel-v2-collision-groups.js`](../js/vowel-v2-collision-groups.js)

**Future research notes:** RN-04 (vowel grammar v3), RN-05 (multilingual script), RN-06 (collision audit)
