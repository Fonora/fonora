---
status: Active
date: 2026-07-12
phase: phase-5
---

# The Fonoran phonetic constitution: three hard rules for spoken compounds

## Research Question

Fonoran roots must be learnable by speakers of many unrelated mother tongues. The vocabulary now consists of ~89 primitive roots and ~484 compounds, each compound being roots spoken back-to-back with no pause. Before the system can claim that compounds are speakable and distinguishable across language backgrounds, it needs explicit design rules that apply at every layer: how individual root sounds are chosen, how roots join to form a compound, and how distinct two compounds must be when spoken aloud.

These rules existed in the codebase as weights, gate thresholds, and a hard-reject check, but were never collected into a single statement. The result was an enforcement gap: a root with a hard-to-pronounce onset could pass every automated gate and still reach a preferred compound form because the rule had never been wired into seed selection or preferred-form promotion.

**What are the three phonetic hard rules that govern Fonoran, why does each rule exist, and where is each one enforced in the pipeline?**

## Hypothesis

Three rules are sufficient to cover the space of spoken learnability for a constructed language with a cross-linguistic speaker base:

1. **Root onset ease:** Root syllables should favor onsets that are cross-linguistically common; difficult onsets are deprioritized at every decision point from primitive assignment through seed bank to preferred-form selection.
2. **Compound join audibility:** When roots are spoken back-to-back, the join point must be hearable; identical consonants at a join are hard-rejected; same-place and vowel-vowel joins are penalized.
3. **Surface distinctness:** Two compounds in the inventory must not be close enough in phonemic space to be confused by a listener, regardless of their written form.

A fourth soft rule, prefer short compounds, reinforces all three by reducing the number of joins and the risk of confusion.

## Approach

### Rule 1: Root onset ease

**Why it exists.** A speaker whose mother tongue lacks a particular consonant cannot reliably produce or distinguish words beginning with that consonant. Fonoran targets strangers from any language background; the root inventory must bias toward onsets that are near-universal.

**The tier system** (`tools/fonoran-phonetic-weights.js`):

| Tier | Onsets | Weight | Policy |
| --- | --- | --- | --- |
| Very safe | m n p b t d k g s h w y | 0.95–1.00 | Preferred; fill the primitive pool first |
| Fairly safe | f l ch sh | 0.78–0.88 | Acceptable; used when very-safe pool is saturated |
| Difficult | r j (Fonoran /dz/) | 0.48–0.50 | Avoid in seed bank and preferred compounds when a clean alternative exists; never banned as primitives |
| Excluded | th dh z v zh ng x gh kh | 0 | Block new primitive proposals entirely; do not enter the generator pool |

The weight represents `rootEaseWeight()`: onset weight multiplied by vowel weight (a=1.0, e=0.95, i=0.93, o=0.92, u=0.92), with a 0.62 multiplier if the root has a coda consonant (CVC is harder to produce cleanly than CV). The compound phonetic score is the mean ease weight across all component roots, plus a rhyme-spread bonus when the roots draw from two or more distinct rhyme families.

**Where enforced:**

- `fonoran:root-candidates` / primitive assignment: very-safe onsets fill the pool first; excluded patterns block a syllable from being proposed.
- `fonoran:proposal-gate`: phonetic score must reach 0.70 to pass; excluded patterns score 0.
- `ASSOCIATION_SEEDS` in `tools/fonoran-expression-candidates.js`: post-RN-31, no seed slot uses a difficult-onset root.
- `rankCandidates()`: 0.005 understandability penalty when any component is a difficult-onset root, so a clean alternative wins a tie.
- `selectPreferred()`: score margin waived to 0 when the current preferred uses a difficult root, so any clean equal-score candidate can replace it.

### Rule 2: Compound join audibility

**Why it exists.** Fonoran compounds have no hyphen or spoken pause between roots. A listener hears a single uninterrupted string. If the trailing sound of root A and the leading sound of root B are identical, the join is invisible by ear: `bem + mam` sounds like `bemam`, which could be `bem` + `am` or `be` + `mam`. The join must be hearable.

**The hard rule: no identical consonant at a join** (`checkCompoundBoundary` in `tools/fonoran-gen3-readability.js`):

If the trailing phoneme of the left root and the leading phoneme of the right root are the same consonant, the compound is **rejected** at build and validation time. This is a hard reject, not a penalty. There is no workaround; the roots must be reordered or a different root must be chosen.

Examples of invalid joins: `bem + mam` (m+m), `sas + si` (s+s), `fen + nek` (n+n).

**The soft rule: boundary quality score** (`computeBoundaryQuality` in `tools/fonoran-compound-confusability.js`):

Beyond the hard rule, two additional join patterns are penalized because they blur root boundaries at speaking speed:

- **Vowel-vowel join** (trailing vowel + leading vowel): penalty 0.22. The two vowels tend to glide together and the root boundary disappears.
- **Same-place consonants** (e.g. m+n, p+b, t+d, k+g, f+v, s+z, ch+sh): penalty 0.14. These are articulatorily adjacent; a fast speaker produces them with minimal movement and the boundary is ambiguous.

A CVC+CV join is slightly rewarded (-0.03 penalty) because the closed coda of the first root provides a clean release point before the vowel of the second.

Boundary quality is used as a tiebreaker in `selectPreferred()` and as a factor in the confusability audit.

**Where enforced:**

- `validateComposition()` in `fonoran-composition-resolve.js`: calls `checkCompoundBoundary`; invalid compounds are dropped at build time (shown in the build report as "dropped: identical consonant boundary").
- `fonoran:build`: resolves all preferred compositions; drops any that violate the hard boundary rule.
- `fonoran:compound-confusability`: reports boundary quality score per compound and flags pairs below threshold.
- `fonoran:proposal-gate`: boundaryrule rejection blocks LLM-proposed compounds before they enter the candidate pool.

### Rule 3: Surface distinctness

**Why it exists.** Two compounds with different meanings but similar sound sequences can be swapped by a listener who mishears one phoneme, especially in noisy conditions or across accents. The inventory must ensure that no two compound surfaces are close enough in phonemic space to be confused.

**Phoneme-feature distance** (`tools/fonoran-compound-confusability.js`):

Distinctness is measured using articulatory features, not Levenshtein edit distance on letters. For consonants, the features are place of articulation, manner, and voicing. For vowels, height and backness. Two phonemes share a feature cost proportional to how many articulatory dimensions they share.

Same-place consonant pairs treated as especially close (additional confusability weight beyond general feature distance): m/n, p/b, t/d, k/g, f/v, s/z, ch/sh.

The similarity metric aligns phoneme sequences (not character sequences), so `gamba` and `kamba` score as near-confusable because g/k share place (velar), manner (stop), and differ only in voicing.

**Near-pair threshold:** distinctness below 88% (distance above 0.12) surfaces the pair in the confusability audit report.

**Where enforced:**

- `fonoran:compound-confusability`: flags all near pairs; report is required before full LLM inventory and is part of the seed quality gate.
- `fonoran:proposal-gate`: `confusabilityPenalty` feeds into the phonetic score, so proposed compounds that would be near-confusable with existing inventory words score lower and may fail the gate.

### Rule 4 (soft): Prefer short compounds

**Why it exists.** Every additional root in a compound adds one more join, more syllables for a listener to hold in working memory, and more places for phonetic confusion to accumulate. The constitution ([RN-12](/research/notes/the-campfire-test-communication-over-correctness)) also gates for campfire recoverability: a stranger recovering a 4-root compound must hold all four glosses simultaneously and find the combination that fits. At 2 roots, this is a semantic puzzle; at 4, it approaches a memorization task.

**Where enforced:**

- `maxFlattenedRoots()` in `fonoran-composition-resolve.js`: the flattened root count (counting compound components recursively) must stay within a ceiling; compounds exceeding it are demoted even if they score well on other metrics.
- `fonoran:proposal-gate`: `phoneticPromptBrief()` includes an explicit instruction to prefer 2-root compounds.
- `rankCandidates()` sort: when understandability scores tie, shorter flattened length wins.

## Evaluation

The rules are stated as design constraints; their success criterion is the build health report and the confusability audit.

**Post-remediation state (July 2026):**

| Rule | Metric | Result |
| --- | --- | --- |
| Root onset ease | Seeds with difficult-onset roots | 0 / 1,455 |
| Root onset ease | Preferred compounds with difficult onset | 0 / 484 |
| Join audibility (hard) | Compounds dropped for boundary violation | 3 of 484 (spelling collision or identical consonant) |
| Join audibility (hard) | Build pronounceability score | 100/100 |
| Surface distinctness | Near-confusable pairs (distinctness < 88%) | 108 of ~116,000 possible pairs |
| Compound length | Avg compound length (characters) | 6 |
| Compound length | Algorithmic feel (roots needing repair) | 0% |

The 108 near-confusable pairs are advisory: they are surfaced for human review, not rejected automatically. Most share a common root (`place + bond` vs `place + bad` = `chekam` vs `chegam`) which is expected and manageable in context.

## Findings

1. **The three rules are not equal in enforcement strength.** Rule 2 (join audibility) has the only true hard rejection in the build pipeline. Rules 1 and 3 operate through scoring and audit; they require human review of the output to close the loop. The enforcement gap discovered in RN-31 (seeds using difficult-onset roots passing all automated gates) is an example of a scoring rule having insufficient reach.

2. **The rules must apply from the bottom layer up.** The policy order is: root onset tier governs primitive assignment, then seed bank composition, then preferred-form selection, then build validation. A rule that only applies at proposal-gate time misses any content that arrived through the human-edited seed bank and heuristic optimizer.

3. **Short and distinct interact.** A 2-root compound using well-separated onsets and a CVC+CV join is simultaneously easy to pronounce, easy to parse by ear, and easy to distinguish from other words. The rules converge toward a common optimum: CV-onset + CV-close = two clear syllables with a voiced release point.

4. **The boundary hard rule is the design's load-bearing constraint.** Without it, the inventory would accumulate forms like `sassen`, `temmet`, or `nanek` that look different on paper but sound identical in connected speech. The rule costs a small fraction of the candidate space (only root orderings that create an identical-consonant join are blocked, not the roots themselves) in exchange for full parse-uniqueness by ear.

## What Changed

The rules existed implicitly in the codebase before this sprint. What changed in this sprint ([RN-31](/research/notes/phonetic-seeds-pipeline-readiness)):

- Rule 1 is now enforced at the seed layer, not only at the proposal gate.
- The seed quality audit explicitly checks for difficult-onset roots in `ASSOCIATION_SEEDS` and fails the gate if any are found.
- `rankCandidates()` and `selectPreferred()` propagate `difficultRootIds` so the optimizer treats difficult-onset preferred forms as tie-losers.

The rules themselves were stable; the enforcement depth was not.

| Tool | What rule it enforces |
| --- | --- |
| `tools/fonoran-phonetic-weights.js` | Rule 1: tier weights, ease score, excluded patterns, rhyme saturation |
| `tools/fonoran-gen3-readability.js` | Rule 2 (hard): `checkCompoundBoundary` |
| `tools/fonoran-compound-confusability.js` | Rule 2 (soft): boundary quality; Rule 3: phoneme-feature distance |
| `tools/fonoran-expression-candidates.js` | Rule 1: seed purity, phonetic penalty in `rankCandidates` |
| `tools/fonoran-preferred-select.js` | Rule 1: margin waiver for dirty current; Rule 2: boundary tiebreak |
| `tools/fonoran-proposal-gate.js` | Rules 1, 2, 3: gate thresholds for new proposals |
| `scripts/fonoran-seed-quality-audit.js` | Rule 1: phonetic seed purity check gate |
| `scripts/fonoran-compound-confusability.js` | Rule 3: full near-pair audit |

## Open Questions

- Should Rule 3 (surface distinctness) be a hard reject rather than an advisory audit? A threshold of distinctness < 88% could block build instead of flagging.
- Does the 0.005 difficult-onset penalty in `rankCandidates` need to be larger to win against score ties more reliably, or does the margin-waiver in `selectPreferred` make the penalty size irrelevant?
- The three primitives with difficult-onset spellings (`ra`=up, `ju`=down, `je`=bone) were renamed to `wa`, `do`, `bu` during the RN-31 remediation sprint. No approved primitive root now uses an r/j onset. The difficult tier remains for historical context and to classify any future proposals; it is no longer represented in the active root inventory.
- Human Puzzle Conversation data on the phonetically remediated compounds: do listeners recover `sky + water` for `rain` as readily as `water + down`?

## References

- [RN-12 · The campfire test](/research/notes/the-campfire-test-communication-over-correctness)
- [RN-27 · Automated refine loop](/research/notes/automated-refine-loop)
- [RN-30 · Synthetic-only LLM validity](/research/notes/synthetic-only-llm-validity)
- [RN-31 · Phonetic seeds and pipeline readiness](/research/notes/phonetic-seeds-pipeline-readiness)
- [`tools/fonoran-phonetic-weights.js`](../tools/fonoran-phonetic-weights.js)
- [`tools/fonoran-gen3-readability.js`](../tools/fonoran-gen3-readability.js)
- [`tools/fonoran-compound-confusability.js`](../tools/fonoran-compound-confusability.js)
