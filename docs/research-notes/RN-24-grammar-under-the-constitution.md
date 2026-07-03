---
status: Open
date: 2026-07-03
phase: phase-5
---

# Grammar under the Constitution

## Research Question

[RN-14](/research/notes/grammar-as-particles-not-words) wired 17 invariant particles to clear an English regression corpus, trimming a 32-role proposal to a closed class that separates grammatical machinery from lexical roots. That pass optimized for **compiler coverage**, not for the success metric [RN-12](/research/notes/the-campfire-test-communication-over-correctness) later encoded in the Constitution: recoverable meaning between root-knowers with **minimal memorization**.

[RN-21](/research/notes/beginner-core-remediation) rebalanced the 50-root communicative core toward pointing, repair, and survival dialogue — promoting **addressee**, **thing**, **here**, **there**, **understand**, and **need** while retiring abstract roots that had blocked transparent composition. The particle inventory was not re-audited against that new core.

The question this note addresses:

**Which grammatical relationships must remain invariant particles under the Constitution — and which should be expressed structurally or lexically — so strangers can invent and repair sentences without expanding the memorization budget?**

## Hypothesis

1. **The wired 17-form inventory is mostly constitutional** — pronoun **mi**, tense **ta**/**sa**, negation **no**, interrogative **wo** + wh-set, and quantifier compositions (**no** + **person**, **all** + **thing**) pass the campfire test and support puzzle-conversation repair.
2. **Focus particles are the weakest fit** — **vat**, **vet**, and **vit** (*only*, *also*, *even*) scored lowest on week-one need and recoverability in a structured pre-implementation audit; they may be demoted or paraphrased before new particles are added.
3. **Possession and comparison should not become particles by default** — week-one strangers point, negate, and ask wh-questions before they need scalar comparison or possessive morphology; transparent root compositions should be tried first.
4. **Present-as-zero and lexical spatial/deictic routing remain correct** — RN-14's trim and RN-21's core promotions did not create particle/lexicon boundary violations worth immediate surgery.

## Approach

### Constitutional audit (pre-implementation)

Ran a structured audit of every wired particle and RN-14 open question against Constitution criteria (campfire test, memorization budget, recoverability, repair-friendly skeleton). Full tables and per-particle verdicts: [`docs/fonoran-grammar-constitutional-audit.md`](../docs/fonoran-grammar-constitutional-audit.md).

Inventory source: [`data/fonoran-grammar-particles.json`](../data/fonoran-grammar-particles.json) v2.1. Grammar spec: [`docs/fonoran-grammar.md`](../docs/fonoran-grammar.md) Rule 3.

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

**Pre-implementation audit only (Jul 2026).** No translator changes, no inventory mutations, no human playtest data on grammar-specific repair rounds yet.

Automated gates unchanged: `npm run test:translator` golden corpus; particle wiring in [`tools/fonoran-particles.js`](../tools/fonoran-particles.js).

## Findings

**Audit verdict: keep the 17-particle core for the initial Phase V pass.** No additions recommended until human repair playtests complete. See [`docs/fonoran-grammar-constitutional-audit.md`](../docs/fonoran-grammar-constitutional-audit.md) for full tables.

**Strongest constitutional fit:** **mi**, **no**, **wo**, wh-set (**vus**–**zus** except **zos** flagged for review), tense **ta**/**sa**, present-as-zero.

**Weakest campfire fit:** focus trio **vat** / **vet** / **vit** — candidate demotion or paraphrase before any expansion.

**RN-21 did not break the particle/lexicon boundary** — **zis** (where) vs lexical **here**/**there** remains coherent; **vus** (what) pairs with core **thing** for repair.

**Open structural gap:** no dedicated "repeat / say again" marker — likely lexical (**same**) or gesture, not a new particle yet.

**Grammar doc honesty gap:** **ta**/**sa** still marked "Under Development" in [`docs/fonoran-grammar.md`](../docs/fonoran-grammar.md) despite translator wiring — teaching story should catch up after playtest validation.

## What Changed

**Live (documentation only):**

- [`docs/fonoran-grammar-constitutional-audit.md`](../docs/fonoran-grammar-constitutional-audit.md) — structured Phase V audit
- This note (RN-24) — Phase V grammar research arc opened

**Not changed:** [`data/fonoran-grammar-particles.json`](../data/fonoran-grammar-particles.json), translator particle resolution, grammar doc particle table, or focus-particle wiring.

**Prior notes this builds on:** [RN-14 · Grammar as particles](/research/notes/grammar-as-particles-not-words), [RN-21 · Beginner core remediation](/research/notes/beginner-core-remediation), [RN-12 · The Constitution](/research/notes/the-campfire-test-communication-over-correctness).

## Open Questions

- Do focus particles (**vat**, **vet**, **vit**) survive repair playtests, or should *only* / *also* compile structurally?
- Is **zos** (why) recoverable enough to keep, given *because* is structural not lexical?
- What is the minimal possessive strategy — **mi** + noun vs dedicated particle — under campfire constraints?
- When should **ta**/**sa** graduate from "Under Development" to Active in the grammar spec?
- Does English trigger leakage still hide grammar/lexicon mistakes for non-English input paths?

## References

**Documentation:** [`docs/fonoran-grammar-constitutional-audit.md`](../docs/fonoran-grammar-constitutional-audit.md), [`docs/fonoran-grammar.md`](../docs/fonoran-grammar.md), [`docs/fonoran-constitution.md`](../docs/fonoran-constitution.md)

**Interactive demo:** [Grammar](/language#grammar), [Translator](/language#translator), [Puzzle Conversation](/language#puzzle)

**Source:** [`data/fonoran-grammar-particles.json`](../data/fonoran-grammar-particles.json), [`tools/fonoran-particles.js`](../tools/fonoran-particles.js), [`tools/fonoran-translator.js`](../tools/fonoran-translator.js)

**Prior notes:** [RN-14 · Grammar as particles](/research/notes/grammar-as-particles-not-words), [RN-21 · Beginner core remediation](/research/notes/beginner-core-remediation)

**Future research notes:** Focus-particle playtest; possession strategy; grammar spec status update after Session 4+ repair data
