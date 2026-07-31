---
status: Active
date: 2026-06-28
phase: phase-3
---

# Concepts are canonical, sounds are editorial proposals

## Research Question

[RN-11](/research/notes/the-irreducible-dimensions-of-meaning) established that Fonoran's semantic inventory could be frozen before anyone touched phonetics: ~99 primitive dimensions, grammar kept out of the lexicon, compounds documented as trees rather than flat strings. It deliberately deferred sound assignment and closed with an explicit follow-up:

**How do approved concepts get exactly one Fonora-script spelling without algorithms silently minting vocabulary?**

[RN-12](/research/notes/compiling-english-into-meaning) reframed the success metric two days later, recoverable meaning, not ontological perfection; generators *propose*, humans *approve*, and asked the operational version of the same problem:

**How do we turn concepts into sounds into compounds into a human review queue without sliding back into auto-generation?**

This note addresses that gap. RN-11 had answered *what* to name; RN-12 had answered *why* human judgment must win. The remaining question was mechanical: what pipeline enforces that order in practice?

## Hypothesis

The working hypothesis was that **concepts are canonical inputs and sounds are editorial proposals until a human approves them.** A concept's priority class should drive the order in which it receives a syllable. Collision, boundary, and distinctiveness scores should *advise* the editor in the Review UI, not auto-select winners. Rejected spellings should be reserved so the generator cannot silently reuse them on another concept. Approved roots should lock through every rebuild so the language keeps a stable feel once humans sign off.

This was not a claim that algorithmic scoring could pick optimal roots. It was a bet that a converged build loop, propose, score, review, lock, rebuild, could replace the earlier pattern where Huffman cost or DDA coordinates assigned sounds before meaning was settled.

## Approach

The pipeline did not appear fully formed on Jun 28. It converged over three days from a split workflow into one command, then gained editorial scoring on top.

### From split scripts to one build

Commit `90f3005` (Jun 27) introduced [`tools/fonoran-build.js`](../tools/fonoran-build.js) and `npm run fonoran:build`, unifying what had been separate root-candidate generation, primitive-root export, and lab import. The build reads [`data/fonoran-concept-inventory.json`](../data/fonoran-concept-inventory.json), writes proposals to [`data/fonoran-root-candidates.json`](../data/fonoran-root-candidates.json), resolves curated compounds from [`data/fonoran-compounds.json`](../data/fonoran-compounds.json), and imports into the runtime lab bucket. User-created lab items survive rebuilds; only generator output is refreshed.

[`docs/fonoran.md`](../docs/fonoran.md) documents the architecture as a Mermaid flowchart: inventory → sound assignment → review queue → approved export → compound build → lab.

### Editorial scoring (Jun 28)

Commit `16e9150` added the editorial layer RN-13 is really about. [`tools/fonoran-root-sound-assign.js`](../tools/fonoran-root-sound-assign.js) builds a ranked syllable pool from [`data/fonoran-primitive-roots-config.json`](../data/fonoran-primitive-roots-config.json) and assigns forms in priority order via [`tools/fonoran-priority.js`](../tools/fonoran-priority.js), essential concepts (weight 100) pick before questionable ones (weight 20).

Four stacked penalty layers feed each candidate's total score:

1. **Phonetic cost**: shorter CV syllables for high-priority concepts; CVC carries a baseline penalty and tier gates push essentials away from CVC unless nothing else fits.
2. **Phonetic distinctiveness**: reuses Gen 3.1's spread logic from [`tools/fonoran-gen3-distinctiveness.js`](../tools/fonoran-gen3-distinctiveness.js) so unrelated roots do not cluster (`ba/be/bi/bo`, `ban/dan/gan`).
3. **Editorial collision**: [`tools/fonoran-root-collision.js`](../tools/fonoran-root-collision.js) loads locale profiles from [`data/fonoran-collision-profiles/`](../data/fonoran-collision-profiles/); blocked forms (profanity, reserved particles `mi`/`ta`/`na`) are never assigned; homophones and common English words raise warnings the reviewer sees in the UI.
4. **Compound-boundary flow**: [`tools/fonoran-root-boundary-score.js`](../tools/fonoran-root-boundary-score.js) penalizes spellings that would produce awkward joins with likely compound partners (the `fi`/collective case documented in fonoran.md: assignment follows cost, not semantic fit, and homophone warnings surfaced the mismatch).

[`tools/fonoran-inventory-migrate.js`](../tools/fonoran-inventory-migrate.js) seeded editorial metadata on each concept: `plain_description`, `primitive_test_note`, `suggested_status`, and `priority_class`.

### Hard constraints

Commit `a68945c` (Jun 28) enforced **CV/CVC-only primitive roots**. `buildSyllablePool` dropped the CV-CV disyllabic tier; `parseSyllable` in [`tools/fonoran-pronunciation.js`](../tools/fonoran-pronunciation.js) gates at build time, `npm run fonoran:build` halts if any primitive is not exactly one syllable. Twelve previously approved CV-CV forms were migrated to CVC equivalents. Capacity tooling reported 205 usable syllable forms against ~118 concept demand, headroom existed, but not unlimited.

Review states were kept deliberately minimal: **`pending`**, **`approved`**, **`rejected`** only. `suggested_status: compound_candidate` marks concepts ineligible for root generation until promoted to `primitive`; they stay in the inventory with null spellings rather than receiving auto-assigned roots.

Locking behavior lives in [`tools/fonoran-root-candidates.js`](../tools/fonoran-root-candidates.js): on rebuild with `preserveReview: true`, approved spellings populate `lockedRoots` and rejected forms populate `reservedForms` before reassignment runs. Commit `6b42857` added a rejected filter and reopen action so editors could return rejected roots to the queue without leaving Review.

### Builder UI

Editors work across three tabs wired in the metadata: Root Creator for manual CV/CVC entry, Concept Editor for gloss and metadata edits, and **Words** at [`/tools#word-manager`](/tools#word-manager) for the root queue with per-candidate score tooltips (distinctiveness, collision, boundary warnings).

## Evaluation

There was no formal user study. Evaluation was the editorial loop itself plus build-time validation:

- **End-to-end rebuild**: `npm run fonoran:build` after approving roots; locked spellings must survive unchanged.
- **Syllable gate**: build fails fast on non-CV/CVC primitives rather than silently accepting invalid roots.
- **Compound parseability**: `fonoran-build.js` drops compounds whose segmentation is ambiguous or whose spelling collides with an existing root; commit `420f511` added boundary-consonant checks (`fek+kes` → rejected).
- **Translator regression**: commit `28c5aa0` wired `fonoran:build` into CI so golden translation tests always run against lab vocabulary that reflects approved roots.
- **Informal review questions**: does the highest-priority concept get the shortest syllable? Do collision warnings flag real problems (`fi` as English "fee")? Does rejecting a spelling prevent its reuse on the next rebuild?

No automated score was treated as authoritative. Distinctiveness, collision, and boundary numbers were surfaced for human judgment, consistent with RN-12's demotion of heuristics to advisors.

## Findings

**The converged loop worked.** Concepts flowed from inventory through scored proposals into Review, through approval into [`data/fonoran-approved-roots.json`](../data/fonoran-approved-roots.json), through compound resolution into the lab. Rebuilds preserved approved spellings and user-created vocabulary. The mechanical answer to RN-11's deferral, sound assignment waits on human sign-off, held.

**Priority-driven assignment produced sensible defaults, not perfect ones.** Essential concepts reliably received low-cost CV forms; extended concepts absorbed CVC and tertiary tiers. Scoring caught several English homophone traps and particle near-misses before they entered canonical roots. It did not guarantee semantic fit, editors still had to override cases where cost-minimization disagreed with intuition.

**The inventory count shifted during review.** Commit `16e9150` generated 118 proposals, all entering the queue as `pending`. Semantic consolidation in commits `d31ae25` and `80162e7` (Jun 28–29) moved grammar-bound and derivable concepts out of the primitive list; the eligible set settled at ~97–100 roots, not 118. Full approval for the consolidated set was reached by commit `d930084` (100 approved, 0 pending). The abstract's "118 roots approved" reflects the initial generation pool size; the canonical primitive count after semantic review was lower.

**Rejected-spelling reservation and approved locking behaved as designed.** Rebuilds did not silently reassign rejected forms or overwrite approved ones; the language could evolve semantically without phonetic churn.

**Remaining rough edges were UX, not linguistics.** Review split root approval across multiple buckets (root queue, Roots tab, a misleading "Generated" section for lab items awaiting word-level review). Editors could complete the linguistics work; the interface still made the workflow harder to follow than the pipeline logic itself.

Nothing here proved that editorial scoring picks the best possible roots. It showed that a human-gated pipeline could replace silent auto-generation; the failure mode every prior generator had exhibited.

## What Changed

The editorial pipeline's core decisions persist in current architecture:

- **`npm run fonoran:build`** remains the single converged entry point documented in [`docs/fonoran.md`](../docs/fonoran.md).
- **Concepts drive generation; sounds wait on approval.** The inventory is phonetics-free editorial metadata; canonical roots live in the approved-roots export.
- **CV/CVC-only primitives** with build-time `parseSyllable` enforcement.
- **Four-layer scoring** as advisory UI signal, not auto-gates (except hard blocks for profanity and reserved particles).
- **Lock/reserve semantics** on rebuild.

What evolved afterward:

- **Inventory continued to grow**: commit `1cd0411` expanded to 110 candidates (100 approved, 10 pending) as new roots like `metal` and `parent` entered review.
- **The constitution codified what the pipeline already practiced**: RN-12's campfire test and tiered language model were added Jun 30 (`5cfe28a`), after the mechanical pipeline landed.
- **Grammar separation became the next bottleneck** once roots were flowing, see RN-14.

Later notes in sequence:

- **RN-14: Grammar as particles, not words**: closed-class particles, reserved forms in collision scoring, 100% translation coverage
- **RN-15: Compiling English into meaning**: interpretive translator resolving English to nearest approved concepts
- **RN-16: Typing an invented script**: read-write loop for the Fonora script
- **RN-17: Can strangers recover meaning?**: puzzle-conversation playtests as the human authority RN-12 promised

## Open Questions

The editorial pipeline answered how concepts acquire spellings under human control. It left questions that motivated what followed:

- **Which relationships belong in the sentence skeleton versus the lexicon?** Once roots were approved, tense, logic, deixis, and pronouns still needed a home outside the root inventory. (RN-14)
- **Can English compile to the nearest approved concept** rather than demanding word-for-word glosses, and show gaps honestly when no concept matches? (RN-15)
- **Does the Review UX match the pipeline's simplicity?** Split queues and misleading "Generated" labels remained friction even after linguistics work completed.
- **Will strangers recover meaning from approved roots and compounds**: the campfire test RN-12 defined but did not yet measure at scale? (RN-17)

The grammar question is the most immediate bridge: with roots locked, the next boundary was what stays grammatical rather than lexical.

## References

**Related commits**
- `90f3005`: Converged vocabulary build pipeline (`fonoran:build`, concept inventory alignment)
- `2de91d1`: Separate concept ontology from English localization
- `a68945c`: Enforce CV/CVC-only primitive root rule; migrate 12 invalid roots
- `16e9150`: Editorial root generation workflow with collision and boundary scoring
- `420f511`: Compound boundary constraint and health secondary metrics
- `6b42857`: Rejected filter and reopen action in Review mode
- `80162e7`: Grammar particles as first-class category; inventory consolidation to 97 primitives
- `d930084`: Codify compound vocabulary in git; 100 approved roots
- `5cfe28a`: Communication experiment pivot; add constitution (RN-12)
- `28c5aa0`: Run fonoran:build in CI for translator golden tests

**Documentation:** [`docs/fonoran.md`](../docs/fonoran.md)

**Interactive demo:** [Word Manager](/tools#word-manager) (words, roots, concept editor), [Gap Workshop](/tools#gap-workshop) (proposals review)

**Source:** [`tools/fonoran-root-sound-assign.js`](../tools/fonoran-root-sound-assign.js), [`tools/fonoran-build.js`](../tools/fonoran-build.js)

**Future research notes:** RN-14 (grammar particles), RN-15 (interpretive translator), RN-16 (typing and keyboard), RN-17 (puzzle conversation / recoverable meaning)
