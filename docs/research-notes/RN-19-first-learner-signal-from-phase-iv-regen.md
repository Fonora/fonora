---
status: Active
date: 2026-07-02
phase: phase-4
---

# First learner signal from Phase IV regen

## Research Question

[RN-18](/research/notes/reconstructing-compounds-under-the-constitution) rebuilt the compound inventory as teaching trees and meaning-attempts under the constitution. That answered *how* to regenerate vocabulary: `ASSOCIATION_SEEDS`, migration scripts, audit tooling, and a path from heuristic alternates to playtest authority.

RN-18 closed with success criteria still open: transparent trees, rising playtest coverage, and measured divergence between heuristic rank and human recovery. Phase IV regen shipped 111 compounds with fresh root spellings after `npm run fonoran:reset`. The question this note addresses is the one RN-18 deferred until someone actually used the lab:

**Does the Phase IV regen teach in the ear and the sentence, recognition, compilation, and compound recovery, before we treat the inventory as stable?**

This is not the constitutional stranger test in full (RN-17). It is the first structured learner signal on the post-regen inventory: one author, English-mediated, using the live web GUI.

## Hypothesis

If the regen succeeded as a teaching inventory, a root-knower should:

- **Recognize root clusters** after brief dictionary exposure (onset families such as `ye` = water-related).
- **Parse compiled sentences** into roots and compounds without rehearsing every word in advance.
- **Recover compound meaning** in Puzzle Conversation at rates that justify preferred forms, with repair turns helping when first guesses fail.

The hypothesis is not that every compound communicates on first exposure. It is that the regen should produce *measurably better* signal on layers (1) and (2) than the pre-regen inventory, and enough volume on (3) to compare against heuristic understandability before locking preferred forms.

## Approach

Phase IV regen (Jul 2026) replaced the live compound set and root spellings:

| Layer | Implementation |
| --- | --- |
| Compounds | 111 curated entries (`data/fonoran-compounds.json` v2.0-communicative) |
| Teaching trees | Chains such as `community → identity → tribe → war`, `exchange → money`, `shared_meaning → language` |
| Seeds | `ASSOCIATION_SEEDS` coverage 111/111; alternates per concept |
| Phonetics | Fresh assignment after reset; no legacy spelling locks |
| Build | `npm run fonoran:regen-compounds`, `npm run fonoran:build:approved` → 111/111, 0 dropped |
| Tooling | `npm run fonoran:compound-audit`, `npm run fonoran:playtest:baseline` |

Evaluation used the live language lab at `/language/`:

1. **Dictionary**: browse roots and compounds; note onset clustering without gloss keys.
2. **Translator**: compile an everyday English sentence; inspect roman output and segmentation.
3. **Puzzle Conversation**: guess meaning from live preferred spellings; one repair turn on miss; rounds recorded to [`data/fonoran-playtests.json`](../data/fonoran-playtests.json).

Sessions are logged in [`docs/fonoran-learning-sessions-log.md`](../fonoran-learning-sessions-log.md). Puzzle UI fixes during Session 2 (boundary formatting `·`, nested breakdown levels, separated spellings from glosses) are documented there and in [`language/pages/puzzle-page.js`](../language/pages/puzzle-page.js).

After Session 2, synthetic ranking ([RN-20](/research/notes/synthetic-intuition-ranking)) promoted 22 preferred forms. Session 4 in the learning log is reserved for human validation of those promotions, not covered in this note's primary evidence set.

## Evaluation

There has been no cross-linguistic study, no stranger pairs, and no keyboard/spelling session yet (RN-16 pipeline untested on post-regen spellings).

What exists (Jul 2026):

**Session 1: Dictionary + Translator (~5 min browse + one sentence)**

- Input: *i want to eat food in the city*
- Output: `mi sak tel telto lekche` (`telto` = eat + thing; `lekche` = many + place)
- Within ~5 seconds of dictionary browsing, words starting with **`ye`** were treated as water-related (`ye` = primitive *water*) without an explicit gloss key.

**Session 2: Puzzle Conversation (~54 rounds, post-regen UI)**

- Documented in the learning log; compound and UI fixes applied after the session.
- Failures on first repair pass: `open` (guessed *money*), `meaning` (guessed *law*).

**Aggregate playtest store (puzzle source, all time through Jul 2026)**

- **132** puzzle rounds recorded; **129** recovered (first guess or one repair turn).
- **3** non-recoveries: `open`, `meaning`, and one `war` round with no guess recorded.
- **61** distinct concepts have at least one recorded round; 14 priority teaching-tree concepts pass lab smoke test ([`docs/fonoran-phase4-playtest-baseline.md`](../fonoran-phase4-playtest-baseline.md)).

**Audit**

- Post-regen compound audit: 0 critical findings at regen time; latest audit after LLM optimize reports 29 high findings (mostly tree mismatches vs semantic demo and tertiary onsets), see [`docs/fonoran-compound-audit-latest.md`](../fonoran-compound-audit-latest.md).

Informal questions the team was asking:

- Do root onset clusters teach family membership without glosses?
- Do transparent compounds (`tel` + `to` → `telto`) survive compilation in ordinary sentences?
- Does Puzzle Conversation recovery stay high enough to trust preferred forms on most concepts?
- Where do heuristics and human recovery disagree?

## Findings

**Recognition and compilation look promising; recovery is strong but not universal.** One author session produced immediate water-family clustering and a clean everyday sentence compile. That supports layer (1) and (2) as necessary preconditions; it is not proof for other learners or languages.

**Puzzle recovery is high on the post-regen inventory at small scale.** 129/132 recorded puzzle rounds recovered, roughly 98% on the current store. That is far above what would be needed to dismiss the regen as unteachable, but the sample is biased: one primary author, English gloss multiple choice, and concepts already partially familiar from building the inventory.

**Documented failures matter.** `open` and `meaning` failed after repair, both are concepts where semantic transparency and teaching-tree depth were already disputed in Session 2. These are exactly the cases the constitution expects: repair helps often, not always; failures flag concepts for seed or preferred-form work.

**Heuristic vs human divergence is still under-measured.** Session 2 surfaced disagreements (`island`, `fly`, `teacher`) where recovery succeeded in MCQ but the construction felt weak. No systematic Spearman comparison across ≥10 concepts has been run yet.

**Synthetic ranking is now a parallel signal, not a substitute.** [RN-20](/research/notes/synthetic-intuition-ranking) ran after Session 2 and changed 22 preferred forms. Human Session 4 on promoted spellings is the next gate before treating those promotions as settled.

## What Changed

- **Inventory:** 111 compounds with teaching trees and fresh spellings; build pipeline stable at 111/0.
- **Puzzle UI:** Morpheme boundaries, nested breakdown, concept filter URLs (`#puzzle?concept=<id>`).
- **Playtest store:** 132+ puzzle rounds; aggregate counters in the Puzzle page.
- **Learning log:** Structured session template and Sessions 1–2 recorded; Session 4 planned for LLM promotion validation.
- **Research notes:** This note moves from draft anecdote to Active learner signal; [RN-20](/research/notes/synthetic-intuition-ranking) covers the synthetic ranking layer that followed.

Prior notes this work builds on:

- **RN-17:** Puzzle Conversation as constitutional instrument
- **RN-18:** Compound reconstruction under the constitution
- **RN-15:** Translator compilation path tested in Session 1

## Open Questions

- Does Session 4 human play on the 22 LLM-promoted compounds confirm or reject synthetic rankings?
- How deep can teaching trees go before spellings stop teaching and start memorizing?
- Does onset clustering (`ye`, `tel`, `dan`, …) hold outside water and body domains?
- Which compounds fail Puzzle Conversation despite high understandability scores?
- When should playtest evidence override `llm_consensus` or heuristic preferred forms?
- When will keyboard/spelling drills (RN-16) be run on post-regen spellings?

## References

**Documentation:** [`docs/fonoran-compound-audit-latest.md`](../fonoran-compound-audit-latest.md), [`docs/fonoran-phase4-playtest-baseline.md`](../fonoran-phase4-playtest-baseline.md), [`docs/fonoran-learning-sessions-log.md`](../fonoran-learning-sessions-log.md)

**Interactive demo:** [Dictionary](/language#dictionary), [Translator](/language#translator), [Puzzle Conversation](/language#puzzle)

**Future research notes:** [RN-20 · Synthetic intuition ranking](/research/notes/synthetic-intuition-ranking)

**Source:** [`data/fonoran-compounds.json`](../data/fonoran-compounds.json), [`data/fonoran-playtests.json`](../data/fonoran-playtests.json), [`tools/fonoran-compound-audit.js`](../tools/fonoran-compound-audit.js), [`scripts/fonoran-playtest-baseline.js`](../scripts/fonoran-playtest-baseline.js)

**Prior notes:** [RN-18 · Reconstructing compounds](/research/notes/reconstructing-compounds-under-the-constitution), [RN-17 · Puzzle conversation](/research/notes/can-strangers-recover-meaning), [RN-15 · Compiling English into meaning](/research/notes/compiling-english-into-meaning)
