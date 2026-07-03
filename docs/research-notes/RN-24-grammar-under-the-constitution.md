---
status: Open
date: 2026-07-03
phase: phase-5
---

# Grammar under the Constitution

## Research Question

[RN-14](/research/notes/grammar-as-particles-not-words) wired 17 invariant particles to clear an English regression corpus, trimming a 32-role proposal to a closed class that separates grammatical machinery from lexical roots. That pass optimized for **compiler coverage**, not for the success metric [RN-12](/research/notes/the-campfire-test-communication-over-correctness) later encoded in the Constitution: recoverable meaning between root-knowers with **minimal memorization**.

[RN-21](/research/notes/beginner-core-remediation) rebalanced the 50-root communicative core toward pointing, repair, and survival dialogue — promoting **addressee**, **thing**, **here**, **there**, **understand**, and **need** while retiring abstract roots that had blocked transparent composition. The particle inventory was not re-audited against that new core.

This note now carries **two passes** at the same question, from opposite directions. The first is a conservative per-particle audit that reviews the existing inventory and asks what to keep. The second is a **ground-up redesign proposal** that stops treating the current grammar as a given and asks what the grammar *should* be if it is optimized for one outcome only:

> Can two strangers with different native languages learn a small set of invariant semantic roots and communicate practical ideas after only a short period of study?

The question this note addresses:

**Which grammatical relationships must remain invariant particles under the Constitution — and which should be expressed structurally, lexically, or through position — so strangers can invent and repair sentences without expanding the memorization budget?**

## Hypothesis

1. **The wired 17-form inventory is mostly constitutional** — pronoun **mi**, tense **ta**/**sa**, negation **no**, interrogative **wo** + wh-set, and quantifier compositions (**no** + **person**, **all** + **thing**) pass the campfire test and support puzzle-conversation repair.
2. **Focus particles are the weakest fit** — **vat**, **vet**, and **vit** (*only*, *also*, *even*) scored lowest on week-one need and recoverability in a structured pre-implementation audit; they may be demoted or paraphrased before new particles are added.
3. **Possession and comparison should not become particles by default** — week-one strangers point, negate, and ask wh-questions before they need scalar comparison or possessive morphology; transparent root compositions should be tried first.
4. **Present-as-zero and lexical spatial/deictic routing remain correct** — RN-14's trim and RN-21's core promotions did not create particle/lexicon boundary violations worth immediate surgery.
5. **A ground-up redesign can cut the inventory further without adding ambiguity** — if grammar is optimized purely for stranger recovery, several current forms are removable (the six near-homophone wh-particles, the redundant question marker **wo**, and the focus trio), and word order can be made partly flexible where roles are self-identifying, *provided* modifier attachment is made fully deterministic first. The design proposal argues this reduces the memorization budget from 17 to ~7 while lowering, not raising, misunderstanding risk.

## Approach

### Pass 1 — Constitutional audit (pre-implementation)

Ran a structured audit of every wired particle and RN-14 open question against Constitution criteria (campfire test, memorization budget, recoverability, repair-friendly skeleton). Full tables and per-particle verdicts: [`docs/fonoran-grammar-constitutional-audit.md`](../docs/fonoran-grammar-constitutional-audit.md).

Inventory source: [`data/fonoran-grammar-particles.json`](../data/fonoran-grammar-particles.json) v2.1. Grammar spec: [`docs/fonoran-grammar.md`](../docs/fonoran-grammar.md) Rule 3.

### Pass 2 — Ground-up redesign proposal

Where the audit reviews the existing inventory conservatively, the redesign proposal treats the current grammar as *not* a given and re-derives it from the stranger-communication objective and the design principles (concepts carry meaning; grammar only relates concepts; no inflection; transparent compounds; writing optional; minimal memorization; minimize misunderstanding; recoverable over precise; ambiguity reduction without complexity growth). Full document with per-recommendation reasoning and tradeoffs: [`docs/fonoran-grammar-redesign-proposal.md`](../docs/fonoran-grammar-redesign-proposal.md).

Recommendations (each gated on playtest, none implemented):

| # | Recommendation | Net effect |
| --- | --- | --- |
| R1 | Rename slots to intuitive roles **Actor → Action → Target → Place → Time** | pedagogical; Time moves to periphery |
| R2 | Strict order only for Actor/Action/Target; float Place/Time | flexibility exactly where roles are self-identifying |
| R3 | Deterministic modifier attachment: modifier-before-head, one unit per slot | removes "nearest slot + context" ambiguity |
| R4 | Collapse six wh-particles into one question pro-form placed in the questioned slot | −5 confusable near-homophones |
| R5 | Drop redundant marker **wo**; keep one polar-question marker (intonation in speech) | −1 particle |
| R6 | Demote focus trio **vat / vet / vit** to extended tier | −3 confusable particles |
| R7 | Keep compositional polarity/quantifiers, unmarked present + **ta/sa**, lexical spatial meaning | no churn where it already fits |
| R8 | Consider (but hold) an Actor/Action boundary marker; add only if playtests show role confusion | particle added only when it removes more ambiguity than complexity |

The two passes agree on the guardrail: **no inventory or translator change ships before human repair playtests.** They differ in ambition — the audit says "keep 17 for the initial pass," the redesign proposal targets ~7 once evidence supports the cuts.

### Audit dimensions

| Dimension | Method |
| --- | --- |
| Campfire test | Would a root-knower need this marker in week one? |
| Memorization budget | Does it earn a closed-class slot vs structural/lexical expression? |
| Recoverability | Can role be guessed from context + roots? |
| Post-RN-21 boundary | Do new core roots (**here**, **thing**, **understand**) change particle/lexicon splits? |
| Repair grammar | Does skeleton support clarification turns without new vocabulary? |

### Planned experiments (not yet run)

1. **Repair dialogue playtests** — Session 4+ puzzle rounds on wh-questions, negation, and "I don't understand" using post-RN-21 core ([`docs/fonoran-learning-sessions-log.md`](../docs/fonoran-learning-sessions-log.md)).
2. **Focus particle probe** — Compare recovery with **vat**-marked sentences vs root paraphrases for *only* / *also*.
3. **Possession thought experiment** — Test *my X* as **mi** + **X** vs dedicated possessive marker before spec change.

## Evaluation

**Pre-implementation, documentation only (Jul 2026).** Both the audit and the redesign proposal are analysis; no translator changes, no inventory mutations, and no human playtest data on grammar-specific repair rounds yet.

Automated gates unchanged: `npm run test:translator` golden corpus; particle wiring in [`tools/fonoran-particles.js`](../tools/fonoran-particles.js).

## Findings

**Audit verdict: keep the 17-particle core for the initial Phase V pass.** No additions recommended until human repair playtests complete. See [`docs/fonoran-grammar-constitutional-audit.md`](../docs/fonoran-grammar-constitutional-audit.md) for full tables.

**Strongest constitutional fit:** **mi**, **no**, **wo**, wh-set (**vus**–**zus** except **zos** flagged for review), tense **ta**/**sa**, present-as-zero.

**Weakest campfire fit:** focus trio **vat** / **vet** / **vit** — candidate demotion or paraphrase before any expansion.

**RN-21 did not break the particle/lexicon boundary** — **zis** (where) vs lexical **here**/**there** remains coherent; **vus** (what) pairs with core **thing** for repair.

**Open structural gap:** no dedicated "repeat / say again" marker — likely lexical (**same**) or gesture, not a new particle yet.

**Grammar doc honesty gap:** **ta**/**sa** still marked "Under Development" in [`docs/fonoran-grammar.md`](../docs/fonoran-grammar.md) despite translator wiring — teaching story should catch up after playtest validation.

**Redesign proposal verdict: the inventory can shrink from 17 to ~7 while lowering misunderstanding risk** — if grammar is optimized purely for stranger recovery, the six wh-particles collapse to one slot-placed pro-form (R4), the redundant **wo** goes (R5), and the focus trio demotes (R6). Full reasoning: [`docs/fonoran-grammar-redesign-proposal.md`](../docs/fonoran-grammar-redesign-proposal.md).

**Word order is load-bearing, but not everywhere.** Because Fonoran has no case markers, position is the sole disambiguator for Actor/Action/Target and must stay strict there; Place and Time are self-identifying and can float without adding ambiguity (R2). This reframes "strict word order" from a global rule to a targeted one.

**The largest single misunderstanding source is the wh-homophone cluster.** `vus / zas / zes / zis / zos / zus` differ by one vowel and all end in `-s` — the highest-collision forms in the inventory, at the exact moment (asking) a stranger most needs to be understood. Collapsing them is the highest-value simplification.

**Determinism must precede flexibility.** Relaxing word order (R2) and cutting question machinery (R4) are only safe once modifier attachment is made mechanical (R3: modifier-before-head, one unit per slot), replacing the current "nearest eligible slot + context" rule.

**Toki Pona is the nearest reference but a different niche.** Both share tiny roots, invariant words, and a single question pro-form. Fonoran's distinct direction is *deterministic recoverability by strangers*, measured empirically — not Toki Pona's context-maximal minimalism.

## What Changed

**Live (documentation only):**

- [`docs/fonoran-grammar-constitutional-audit.md`](../docs/fonoran-grammar-constitutional-audit.md) — structured Phase V audit (Pass 1)
- [`docs/fonoran-grammar-redesign-proposal.md`](../docs/fonoran-grammar-redesign-proposal.md) — ground-up redesign proposal optimizing grammar for stranger recovery (Pass 2), with R1–R8, before/after inventory, and Toki Pona comparison
- This note (RN-24) — Phase V grammar research arc opened; now carries both the conservative audit and the redesign proposal

**Not changed:** [`data/fonoran-grammar-particles.json`](../data/fonoran-grammar-particles.json), translator particle resolution, grammar doc particle table, slot names, word-order rules, or focus-particle wiring. Every R1–R8 recommendation is gated on human repair playtests before implementation.

**Prior notes this builds on:** [RN-14 · Grammar as particles](/research/notes/grammar-as-particles-not-words), [RN-21 · Beginner core remediation](/research/notes/beginner-core-remediation), [RN-12 · The Constitution](/research/notes/the-campfire-test-communication-over-correctness).

## Open Questions

- Do focus particles (**vat**, **vet**, **vit**) survive repair playtests, or should *only* / *also* compile structurally (R6)?
- Is **zos** (why) recoverable enough to keep as a form, or does the R4 pro-form + reason compound recover better?
- Does a single slot-placed question pro-form (R4) get recovered by strangers as well as the six dedicated wh-particles — or better, given the homophone risk?
- Can strict Actor/Action/Target order plus deterministic modifier attachment (R2 + R3) avoid role confusion **without** the R8 boundary marker?
- Does floating Place/Time (R2) actually read as intended, or do strangers still expect a fixed slot?
- What is the minimal possessive strategy — **mi** + noun vs dedicated particle — under campfire constraints?
- When should **ta**/**sa** graduate from "Under Development" to Active in the grammar spec?
- Does English trigger leakage still hide grammar/lexicon mistakes for non-English input paths?

## References

**Documentation:** [`docs/fonoran-grammar-redesign-proposal.md`](../docs/fonoran-grammar-redesign-proposal.md), [`docs/fonoran-grammar-constitutional-audit.md`](../docs/fonoran-grammar-constitutional-audit.md), [`docs/fonoran-grammar.md`](../docs/fonoran-grammar.md), [`docs/fonoran-constitution.md`](../docs/fonoran-constitution.md)

**Interactive demo:** [Grammar](/language#grammar), [Translator](/language#translator), [Puzzle Conversation](/language#puzzle)

**Source:** [`data/fonoran-grammar-particles.json`](../data/fonoran-grammar-particles.json), [`tools/fonoran-particles.js`](../tools/fonoran-particles.js), [`tools/fonoran-translator.js`](../tools/fonoran-translator.js)

**Prior notes:** [RN-14 · Grammar as particles](/research/notes/grammar-as-particles-not-words), [RN-17 · Can strangers recover meaning?](/research/notes/can-strangers-recover-meaning), [RN-21 · Beginner core remediation](/research/notes/beginner-core-remediation)

**Future research notes:** wh-collapse recovery playtest (R4); modifier-determinism + word-order flexibility trial (R2/R3); focus-particle playtest (R6); possession strategy; grammar spec status update after Session 4+ repair data
