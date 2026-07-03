# Mouth-intuitive Vowel Glyphs (Iteration)

## Research Question

[RN-04](/research/notes/vowel-grammar-v3) rebuilt English vowels as fixed symbol grammar (`⚬X` / `⚬XᵔY`) and anchored the second symbol on the same manner and place axes used for consonants. That solved structural problems — diphthong homographs like *now* / *go*, retirement of `⚬⚬`, load-time shape validation — but the **assignment** of which glyph `X` should be for each vowel key remained partly historical. Simple vowels mixed manner tokens (`e` → voice `⌇`) with place tokens (`o` → throat `⊃`), while long monophthongs reused manner classes (`ae` → friction `⌀`, `oh` → nasal `⏌`). Learners on the Sound Grid saw tier headers (Simple / Long / Diphthong) that did not match what the glyphs were doing.

[RN-06](/research/notes/collision-audit) showed the script could be audited systematically; it did not resolve whether vowel glyphs should **feel** like mouth position when read left-to-right. A separate swap (`a` ↔ `o` place glyphs so LOT-family vowels looked more “open”) made the inconsistency sharper: back vowels were place-anchored, but DRESS and KIT were not aligned on a back → front place scale.

The question this note addresses:

**Can we realign simple vowel glyphs to tongue **place** (back → front), long vowels to **manner** (same tier as existing long keys), and diphthong nuclei/offglides to the simple-vowel place glyphs — without changing phoneme keys, IPA routing, or Fonoran roman spellings — and does the result survive grammar validation and collision audit?**

## Hypothesis

1. **Two visual tiers, one grammar:** Simple keys (`a`, `e`, `i`, `o`, `u`) use place glyphs only; long keys (`ae`, `ee`, `oh`) use manner glyphs only; diphthongs compose from simple-vowel place recipes (`ay` = DRESS nucleus + glide + CUP offglide).
2. **Keys and IPA stay frozen:** Only composed **symbols** change at load time via `applyPrimarySymbols()` — encoder identifiers (`e`, `ee`, `ay`, …), IPA tables, and [`js/ipa-normalize.js`](../js/ipa-normalize.js) routing are untouched.
3. **Fonoran language layer is unaffected:** The interpretive translator, dictionary roots, and compound spellings (`gi`, `ba`, `tel`) operate on **roman** syllables, not Fonora script strings; golden regression should not drift.
4. **Known collision class persists:** Vowel+glide vs diphthong homographs ([RN-06](/research/notes/collision-audit)) remain documented design trade-offs; changing `ay`'s nucleus updates which sequence equals which diphthong but does not eliminate the class.

## Approach

### Recipe changes in `language-rules.md`

Source of truth: [`docs/language-rules.md`](../docs/language-rules.md) (`fonora_version: v3`).

| key | Old recipe (glyph) | New recipe (glyph) | Tier |
| --- | --- | --- | --- |
| `a` | vowel, back_tongue (`⚬∪`) | unchanged | Simple / place |
| `e` | vowel, voice (`⚬⌇`) | vowel, middle_tongue (`⚬⌓`) | Simple / place |
| `i` | vowel, front_tongue (`⚬⌓`) | vowel, front_tongue (`⚬∩`) | Simple / place |
| `o` | vowel, throat (`⚬⊃`) | unchanged | Simple / place |
| `u` | vowel, lips (`⚬∋`) | unchanged | Simple / place |
| `ae` | vowel, friction (`⚬⌀`) | unchanged | Long / manner |
| `ee` | vowel, front_tongue (`⚬⌓`) | vowel, voice (`⚬⌇`) | Long / manner |
| `oh` | vowel, nasal (`⚬⏌`) | unchanged | Long / manner |
| `ay` | vowel, voice, glide, back_tongue (`⚬⌇ᵔ∪`) | vowel, middle_tongue, glide, back_tongue (`⚬⌓ᵔ∪`) | Diphthong |
| `eye` / `ow` / `oy` | unchanged | unchanged | Diphthong |

A **Vowel design** note under `## Vowels` documents the tier rule for future editors. Sound Grid grouping already followed keyboard teaching order via [`js/vowel-display.js`](../js/vowel-display.js) `SOUND_GRID_VOWEL_GROUP_ORDER`; [`js/app.js`](../js/app.js) renders Simple / Long / Diphthong header rows.

### Pipeline and archive sync

- **Compose at load:** [`js/symbol-compose.js`](../js/symbol-compose.js) `composeVowelFromRecipe()` — no code change required when recipes change in markdown.
- **Validate:** [`js/vowel-grammar.js`](../js/vowel-grammar.js) still enforces `⚬X` / `⚬XᵔY` shape; [`js/load-language-rules.js`](../js/load-language-rules.js) asserts inventory grammar on startup.
- **Tests:** [`js/tests-core.js`](../js/tests-core.js), [`js/tests.js`](../js/tests.js) — symbol expectations updated; prefer `vowelSym(rules, key)` over literals where practical.
- **Collision audit:** `npm run audit:collisions` regenerated [`docs/FONORA_COLLISION_AUDIT.md`](../archive/FONORA_COLLISION_AUDIT.md). The `e + y` ↔ `ay` hazard now shares `⚬⌓ᵔ∪` (was `⚬⌇ᵔ∪`); exact symbol collisions remain **zero**.
- **Gen 3 archive (glyph strings only):** [`tools/fonoran-gen3-readability.js`](../tools/fonoran-gen3-readability.js) `ASPECT_FONORA`, [`data/fonoran-gen3-config.json`](../data/fonoran-gen3-config.json) and [`data/fonoran-gen3-1-config.json`](../data/fonoran-gen3-1-config.json) `vowel_roles.classes`, [`docs/fonoran-gen3.md`](../archive/fonoran-gen3.md) §2.3 — roman aspect→key mapping unchanged; noted as archived reference.

### DDA UI deprecation (same release)

Gen 3 **DDA** (Depth · Mode · Aspect coordinate overlay) was removed from Language Lab UI in the same pass: no explorer buttons, no Advanced “Run DDA”. Live word generation never used DDA ([`tools/fonoran-root-sound-assign.js`](../tools/fonoran-root-sound-assign.js)); [`tools/fonoran-dda-infer.js`](../tools/fonoran-dda-infer.js) and `/api/fonoran/lab/run-dda` remain archive-only. See [RN-08](/research/notes/meaning-from-coordinates-the-gen-3-dda-experiment).

## Evaluation

**Unit and integration tests:** `npm test` — **141/141** pass (script pipeline, vowel architecture, research store smoke tests).

**Golden translator regression:** `npm run test:translator` — **131/131** phrases match committed `fon` values in [`data/fonoran-translation-tests.json`](../data/fonoran-translation-tests.json). **No drift** from Option 2: expected, because the translator emits roman Fonoran, not composed glyphs.

**Quality report (informational, not a CI gate):** The gap runner prints `Quality: 109 pass · 15 review · 7 with gaps` after a successful golden run. That line grades **English→Fonoran lexicon resolution** per phrase (direct vs interpreted vs unknown tokens), not Fonora script symbols. The seven **hard** gaps are missing vocabulary concepts (`teaches`, `raindrops`, `birdsong`, `laughed`, `alone`, `fonoran`, `ruled`) — pre-existing inventory holes, unrelated to vowel glyphs. The fifteen **soft** reviews flag interpreted or alias-weak token resolutions (e.g. hypernym collapse, semantic stretch).

**Collision audit:** Regenerated Jul 3, 2026 — 0 exact collisions; 4 sequence-equals-single (vowel+glide vs diphthong); 15 sequence-equals-sequence (mostly derived reverse orderings, unchanged class from RN-06).

**Manual spot-check (English encode):** *bed* → `⚬⌓`, *sit* → `⚬∩`, *see* → `⚬⌇`, *say* → `⚬⌓ᵔ∪` on Sound Grid `/script#grid`.

No formal learner study was run for this change; evaluation is engineering-driven (tests, audit, grid inspection).

## Findings

**The tier rule holds and reads coherently on the Sound Grid.** Simple vowels now walk place back → front (`∪`, `⌓`, `∩`, plus `⊃` / `∋` for throat and lips). Long vowels stay on manner glyphs (`⌀`, `⌇`, `⏌`). Diphthong `ay` visibly composes from the DRESS place nucleus + glide + CUP offglide, matching the teaching diagram.

**Phoneme keys and Fonoran grammar are not broken.** Option 2 is a **display-layer** realignment:
- IPA → key normalization unchanged
- Fonoran syllable structure, particles, compound composition unchanged
- Keyboard phoneme keys unchanged (`a`, `e`, `i`, …)
- Translator golden corpus unchanged

**What did break (expected):** Any **saved Fonora symbol strings** — puzzles, copied script, screenshots, hardcoded glyph literals in old docs — for words using `e`, `i`, `ee`, or `ay`. Re-encode from IPA or refresh from current rules.

**What did not break but still needs design attention (unchanged from RN-06):** Concatenation hazards (`e + y` ↔ `ay`, `o + w` ↔ `ow`, etc.) and greedy-decoder ambiguity in unsegmented text. Option 2 moved the `ay` hazard symbol to `⚬⌓ᵔ∪` but did not introduce boundary markers.

**Quality metrics are not test failures.** CI fails only on golden roman drift (`--assert`) or unit test regression. The 109/15/7 breakdown is a **coverage dashboard** for the interpretive translator’s English lexicon, not the script encoder.

## What Changed

**Live (v3 rules bundle):**
- [`docs/language-rules.md`](../docs/language-rules.md) — Option 2 recipes + vowel design note
- [`js/vowel-display.js`](../js/vowel-display.js), [`js/app.js`](../js/app.js) — Sound Grid tier headers
- Tests and [`docs/FONORA_COLLISION_AUDIT.md`](../archive/FONORA_COLLISION_AUDIT.md)

**Archive / docs only:**
- Gen 3 glyph strings in config and [`docs/fonoran-gen3.md`](../archive/fonoran-gen3.md)
- DDA removed from Language Lab UI; documented in [`docs/fonoran.md`](../docs/fonoran.md), [`docs/fonoran-generator-archive.md`](../archive/fonoran-generator-archive.md)

**Supersedes:** Informal “Option 2” plan notes; partially supersedes the glyph assignment table implied by RN-04’s manner-heavy simple vowels while **keeping** RN-04’s `⚬X` / `⚬XᵔY` grammar and load-time enforcement.

## Open Questions

- Do strangers recover vowel **place** faster on the Sound Grid than the old manner mix (RN-17-style playtest)?
- Should RN-06 concatenation hazards get explicit boundary policy now that diphthong nuclei align with simple vowels?
- When saved puzzle/script content is migrated, do we batch-re-encode from IPA or version-stamp glyph strings?
- Does Gen 3 aspect→vowel metaphor (`focal` → `ee`, `struct` → `i`) need a successor note now that DDA UI is retired?

## References

**Documentation:** [`docs/language-rules.md`](../docs/language-rules.md), [`docs/FONORA_COLLISION_AUDIT.md`](../archive/FONORA_COLLISION_AUDIT.md), [`docs/pronunciation-validation.md`](../docs/pronunciation-validation.md)

**Interactive demo:** [Sound Grid](/script#grid), [Pronunciation Validation](/script#validate)

**Source:** [`js/symbol-compose.js`](../js/symbol-compose.js), [`js/vowel-grammar.js`](../js/vowel-grammar.js), [`js/vowel-display.js`](../js/vowel-display.js), [`js/ipa-normalize.js`](../js/ipa-normalize.js)

**Prior notes:** [RN-04 · Vowels as grammar](/research/notes/vowel-grammar-v3), [RN-06 · Collision audit](/research/notes/collision-audit), [RN-08 · DDA experiment](/research/notes/meaning-from-coordinates-the-gen-3-dda-experiment)

**Future research notes:** Learner playtest on vowel tier readability; puzzle glyph migration policy
