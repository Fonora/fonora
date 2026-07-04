---
status: Superseded
date: 2026-06-25
phase: phase-2
---

> **Historical commands.** `npm run fonoran:gen3:compare` and `tools/fonoran-gen3-1-compare.js` were removed from the repo. The Gen 3.1 scoring libraries (`fonoran-gen3-readability.js`, `fonoran-gen3-distinctiveness.js`) are retained for the active boundary-check pipeline. See the [archive doc](../../docs/archive/fonoran-gen3-1.md) for the full historical record.

# Making invented words memorable (Gen 3.1)

## Research Question

[RN-08](/research/notes/meaning-from-coordinates-the-gen-3-dda-experiment) inverted the vocabulary pipeline: instead of assigning sounds to English concepts, Gen 3 treated meaning as a coordinate in ⟨Depth, Mode, Aspect⟩ on the Fonora articulation grid. Familiar words like *river* appeared only as derivations, flow + path, never as primitives. The inversion was demonstrable: coordinates were explainable without English glosses, and example compounds assembled from grid-native roots.

It also produced a predictable phonetic side effect. Gen 3 mapped the **focal** aspect class to roman vowel `ee`, and seven of thirty-six primitives landed on `-ee` endings: `pee`, `wee`, `tee`, `see`, `lee`, `kee`, `dee`. Roots that were semantically distinct rhymed by construction. The readability audit in [`tools/fonoran-gen3-readability.js`](../tools/fonoran-gen3-readability.js) flagged this as a high-severity `phonetic_cluster` warning, discrimination among focal roots relied almost entirely on onset consonants. Prefix pairs like `le`/`lee` and `de`/`dee` added segmentation risk when roots concatenated into compounds.

RN-08 closed by asking whether learnability could improve **without moving the coordinates** that give each primitive its meaning. Gen 3.1 was the direct answer to that question:

**Could a phonetic distinctiveness layer spread realized vowels within Fonora-native pools, preferring sound-space repair before grid repair, so invented words stop rhyming with each other while DDA semantics stay fixed?**

## Hypothesis

The working hypothesis was that **distinctiveness is a phonetic property, separable from semantics**. Semantic aspect `A` would remain authoritative in every coordinate record; only the roman phonetic realization would be optimized. If the generator could choose among vowels in a Fonora-native pool keyed by aspect, spreading `ee`-class roots across `i`, `e`, `o`, `u`, `a`, `ae`, `oh`, and `ee` itself, then words in the same semantic neighborhood would stop sounding alike, while their ⟨D, M, A⟩ notation stayed unchanged.

A second, operational hypothesis followed: **phonetic-only spread should be tried before grid repair**. Rotating manner or place to break a rhyme cluster moves the realized onset away from the coordinate's canonical grid cell, weakening the teaching story that "this symbol is this mouth position." Vowel spread within an aspect pool preserves the consonant skeleton's grid justification while still breaking rhymes. Grid repair, manner rotation, place rotation, optional CVC extensions with plain codas from the sound grid, would be reserved for cases where vowel spread alone could not satisfy hard caps.

Constraints carried forward from Gen 3: still **no Indo-European lexicon repair**; roots justified only by coordinates and Fonora-native phonotactics.

## Approach

Gen 3.1 shipped alongside the Gen 3 toolchain in commit `5b6bc58` (Jun 24, 2026). The generator is [`tools/fonoran-gen3-1.js`](../tools/fonoran-gen3-1.js); scoring utilities live in [`tools/fonoran-gen3-distinctiveness.js`](../tools/fonoran-gen3-distinctiveness.js). Configuration, including the eight aspect vowel pools, distinctiveness weights, and the unchanged 36-primitive inventory, is in [`data/fonoran-gen3-1-config.json`](../data/fonoran-gen3-1-config.json). The design is documented in [`docs/fonoran-gen3-1.md`](../archive/fonoran-gen3-1.md), first committed in `14d5d84`.

### Candidate enumeration

For each primitive, the generator resolves canonical grid coordinates from its DDA triple via `depth_to_place`, `mode_to_manner`, and `aspect_vowel` maps, identical to Gen 3. It then enumerates candidates in a deliberate order:

1. **Canonical place and manner**, vowels sorted by current pool usage (least-used first)
2. **Manner rotation** at fixed place
3. **Place rotation** with manner rotation
4. **CVC extensions** using plain codas drawn from the `plain` row of the sound grid (`p`, `t`, `ch`, `k`, `h`)

Primitives that appear in `example_derivations` or carry focal aspect are processed first, so high-visibility roots claim distinct sounds before the vowel pools fill up.

### Distinctiveness scoring

Each candidate syllable receives a `distinctivenessPenalty` from [`distinctivenessPenalty()`](../tools/fonoran-gen3-distinctiveness.js). Penalties accumulate for:

- duplicate roots (hard block, weight 10000)
- prefix overlap unless explicitly allowed (weight 5000)
- exceeding the per-class vowel-ending cap (weight 800)
- same onset, same rhyme, one-vowel-difference pairs, high Levenshtein similarity

The generator picks the lowest adjusted penalty, with bonuses for spreading underused rhyme classes and penalties for grid-repair distance and CVC extensions. Candidates that would duplicate a root or create a forbidden prefix pair are skipped entirely.

### Phonetic spread without semantic drift

When a non-canonical vowel is chosen, coordinates record three fields that Gen 3 did not need:

- `vowel_canonical`; the aspect-map vowel (semantic reference)
- `vowel`; the phonetic realization chosen
- `phonetic_spread: true`, flag that spread was applied

Example from the generated inventory: **mark** stays `⟨index, flux, focal⟩` but its root becomes `se` (phonetic `e`) instead of Gen 3's `see`. The coordinate gloss is unchanged; only the spoken form moves.

### Hard caps

Three constraints were treated as non-negotiable:

- at most **3 CV roots** per pool vowel class
- at most **3 roots** per rhyme key (vowel + optional coda)
- **no prefix pairs** unless listed in `allowed_prefix_pairs` (empty by default)

These caps directly targeted the Gen 3 failure mode: seven focal `-ee` roots and ambiguous `le`/`lee` segmentation.

## Evaluation

There was no user study. Evaluation was automated, using the same readability layer Gen 3 already depended on.

[`auditScores()`](../tools/fonoran-gen3-readability.js) computes pronounceability (heuristic penalties for length, clusters, digraph vowels), memorability (penalized by `phonetic_cluster` and `similar_roots` warnings from [`analyzeAmbiguity()`](../tools/fonoran-gen3-readability.js)), and parseability (fraction of example derivations with exactly one valid segmentation). [`tools/fonoran-gen3-1-compare.js`](../tools/fonoran-gen3-1-compare.js) loads frozen `fonoran-gen3-roots.json` and `fonoran-gen3-1-roots.json` and prints a side-by-side table (`npm run fonoran:gen3:compare`).

The reference run is timestamped **2026-06-22** in [`data/fonoran-gen3-1-roots.json`](../data/fonoran-gen3-1-roots.json) (`generated_at: 2026-06-22T21:56:09.408Z`). That file records `grid_repair_rate: 31` and the audit scores below.

The informal questions the team was actually asking were narrower than "is this a good language":

- Did the focal `-ee` cluster shrink below the audit's four-root threshold?
- Did prefix ambiguities disappear from high-severity warnings?
- Did example compounds still segment uniquely?
- What fraction of roots required grid repair versus phonetic-only spread?
- Did memorability improve enough to justify the repair cost?

## Findings

The distinctiveness layer worked on its own terms. Running `npm run fonoran:gen3:compare` today reproduces the documented deltas:

| Metric | Gen 3 | Gen 3.1 |
| --- | --- | --- |
| Memorability | 70 | **85** |
| Learnability | 76 | **100** |
| Pronounceability | 96 | 96 |
| Parseability | 100% | 100% |
| Algorithmic feel (grid repair) | 22% | **31%** |
| High-severity warnings | 3 | **0** |

**Rhyme clustering broke.** Gen 3's seven `-ee` focal roots (`pee`, `wee`, `tee`, `see`, `lee`, `kee`, `dee`) shrank to two (`tee`, `hee`). Thirty-four of thirty-six roots changed surface form; most used phonetic spread (`phonetic_spread: true`) rather than coordinate changes. Prefix ambiguities (`le`/`lee`, `de`/`dee`) were eliminated.

**Compounds remained parseable.** All eight `example_derivations` in the config still produce exactly one segmentation, 100% parseability on the worked examples. Compounds grew slightly longer on average (7 → 8 characters) because spread and occasional CVC codas (`xaeli` → `xaechlik` for *river*, `keede` → `kuda` for *speaker*) traded brevity for distinct boundaries.

**The cost was real and measurable.** Grid repair rate rose from 22% to **31%**: eleven of thirty-six roots moved off their first-choice place or manner cell. [`docs/fonoran-gen3-1.md`](../archive/fonoran-gen3-1.md) documents this as an intentional tradeoff: distinctiveness sometimes requires manner or place rotation at reserved throat cells. Roots like `threshold` (`wee` → `che`, three grid-repair steps) and `envelope` (`mu` → `ngu`, three steps) illustrate the tension between coordinate fidelity and ear-level discrimination.

**Pronounceability did not improve.** Mean root pronounceability stayed at 96. The layer addressed confusability among roots, not ease of articulation. Digraph vowels (`ae`, `oh`, `ee`) and `ñ` onsets remain documented risks in the readability report.

**The hypothesis about separability held provisionally.** DDA coordinates in output JSON are semantically identical to Gen 3; only roman forms and optional `phonetic_spread` metadata differ. Whether a human learner can hold "semantic `ee`" and "phonetic `e`" apart in practice was not tested, only that the generator could maintain the distinction in data.

What did not resolve: three-root example compounds (`pikopleh` for *planet*, `kuraeñok` for *language*) were left as-is; working-memory load was noted in the design doc but not shortened. The experiment also did not ask whether anyone could *use* these words in conversation, only whether an inventory could score better on automated distinctiveness metrics.

## What Changed

Gen 3.1 did not become the authoritative Fonoran workflow. The [Fonoran Constitution](../fonoran-constitution.md) and commit `5cfe28a` later demoted the entire DDA coordinate track in favor of a communication-first model where concepts are canonical and sounds are editorial proposals until a human approves them ([`docs/fonoran.md`](../fonoran.md)). Gen 3 and 3.1 generators remain in the repository as reference tooling, not production lexicon sources.

What survived into later architecture:

- **`distinctivenessPenalty` scoring**: reused almost unchanged in [`tools/fonoran-primitive-roots.js`](../tools/fonoran-primitive-roots.js) (RN-10's Huffman-like allocation) and [`tools/fonoran-root-sound-assign.js`](../tools/fonoran-root-sound-assign.js) (the editorial root workflow). [`docs/fonoran-primitive-roots-report.md`](../archive/fonoran-primitive-roots-report.md) lists Gen 3 / 3.1 as "partially adaptable" specifically because of this scorer.
- **The phonetic-spread-before-grid-repair priority**: informally preserved as "prefer the smallest sound change that breaks a collision" in later assignment tooling, even though the DDA coordinate story was dropped.
- **Hard caps on rhyme classes and prefix pairs**: echoed in distribution-cap logic in the 200-primitive generator and in editorial collision scoring.

What was superseded:

- Treating automated memorability scores as sufficient evidence that a generated language is learnable.
- The assumption that optimizing generator output is the main path to a speakable inventory.
- DDA coordinates as the semantic source of truth (demoted before Gen 3.1's metrics could be validated with human speakers).

Later notes in sequence:

- **RN-10: Optimal sounds, wrong premise**: applied Gen 3.1 distinctiveness scoring to ~200 Huffman-ranked primitives; revealed that optimizing sound before agreeing on meaning was the wrong order
- **RN-11: The irreducible dimensions of meaning**: deferred phonetics entirely; asked what ~100 experience-native dimensions suffice for compounding
- **RN-12: The campfire test (communication over correctness)**: reframed success as recoverable meaning in human playtests, not coordinate correctness or audit scores

The Fonora **script** rules in [`docs/language-rules.md`](../language-rules.md) were unaffected; RN-06's collision audit at the symbol layer and RN-09's distinctiveness layer at the phonetic layer addressed different levels of the same underlying worry, can composed forms be told apart?

## Open Questions

Gen 3.1 made the thirty-six primitive roots less confusable by ear and proved that phonetic spread could be decoupled from DDA coordinates in the generator. It did not answer whether that decoupling is teachable, or whether the coordinate-first pipeline was the right problem to optimize.

The stub recorded the doubt that motivated the next experiments:

**Do people actually communicate by decoding coordinates in their heads, or is optimizing the generator solving the wrong problem?**

That question forked into two threads:

- **RN-10** asked whether giving ~200 ranked human concepts phonetically optimal syllables (Huffman-like cost allocation, still concept-first) could produce a better inventory if distinctiveness scoring were applied at scale.
- **RN-11** asked what semantic dimensions remain when phonetics are deliberately deferred, meaning first, sounds later.
- **RN-12** made the communication test explicit: success is whether a stranger can recover meaning at a campfire, not whether audit memorability reaches 85.

A secondary open question, implied by the 31% grid-repair rate: **when phonetic spread and grid repair disagree with coordinate→form teaching, which wins?** Gen 3.1 chose the ear. The constitution later chose the editor.

## References

**Related commits**
- `5b6bc58`: Add Fonoran language tools, API, and PostgreSQL-backed storage (introduced `fonoran-gen3-1.js`, `fonoran-gen3-distinctiveness.js`, config and roots data)
- `14d5d84`: Document platform layers, Fonoran guides, and deployment options (first `docs/fonoran-gen3-1.md`)
- `45a7bf4`: Polish platform UX across docs routing, layout, modals, and Fonoran showcase (refreshed `fonoran-gen3-1-roots.json`)
- `5cfe28a`: Reorient Fonoran around the communication experiment; demote Gen 3/DDA track; add constitution
- `b9a306f`: Cross-link archive docs and doc viewer to research notebook

**Documentation:** [`docs/fonoran-gen3-1.md`](../archive/fonoran-gen3-1.md), [`docs/fonoran-gen3.md`](../archive/fonoran-gen3.md) (Gen 3 baseline), [`docs/fonoran-generator-archive.md`](../archive/fonoran-generator-archive.md) (§ Gen 3 / 3.1)

**Interactive demo:** [Dictionary](/language#dictionary)

**Source:** [`tools/fonoran-gen3-1.js`](../tools/fonoran-gen3-1.js), [`tools/fonoran-gen3-distinctiveness.js`](../tools/fonoran-gen3-distinctiveness.js), [`data/fonoran-gen3-1-config.json`](../data/fonoran-gen3-1-config.json), [`data/fonoran-gen3-1-roots.json`](../data/fonoran-gen3-1-roots.json)

**Future research notes:** RN-10 (Huffman-like primitive roots), RN-11 (semantic foundation), RN-12 (campfire test / constitution)
