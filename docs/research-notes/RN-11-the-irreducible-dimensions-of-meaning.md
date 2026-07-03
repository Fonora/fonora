# The irreducible dimensions of meaning

## Research Question

[RN-10](/research/notes/optimal-sounds-wrong-premise) treated vocabulary generation as a coding problem: sort ~200 human concepts by curated priority, allocate syllables with Huffman-like phonetic cost, and score candidates with Gen 3.1 distinctiveness heuristics. The numbers cooperated, top-decile concepts averaged a phonetic cost of 9.7 versus 68 for the bottom decile, but the premise failed. Grammar leaked into the lexicon (`because` became a root; `with` and `without` competed as words). Compounds concatenated flatly (`lobawi` for war instead of teaching `tribe → conflict`). Most critically, every sound had been assigned before anyone approved the underlying meanings.

RN-10 closed with an explicit reordering:

**What if meaning came first: a deliberate, human-approved inventory of concepts, and sound assignment waited its turn?**

That question sits at the boundary between Phase II's generator experiments and Phase III's push toward a language people could actually use. Gen 1, Gen 2, Gen 3, Gen 3.1, and the Huffman run had all started from English lemmas, grid coordinates, or ranked word lists. None had asked what *dimensions of reality*, not English vocabulary, not DDA abbreviations: a compound system should carve before anyone touched phonetics.

The question this note addresses:

**What are the irreducible semantic primitives from which Fonoran compounds should write themselves, and how do we decide what counts as primitive without sneaking English word slots or grammar into the lexicon?**

## Hypothesis

The working hypothesis was that there exists a small set of semantic primitives, on the order of ~100, identifiable by a **fundamental experience test**: a concept qualifies as primitive only if it *cannot be naturally expressed using simpler Fonoran concepts*. This is a test of expressibility within the language being built, not a toddler word list and not a Swadesh-style frequency ranking.

From that premise:

- Primitives are **dimensions of reality** (move, thing, bond, empty), not glosses for English lemmas.
- **Grammar is separate** from roots: pronouns, tense, negation, causation (`because` / `therefore`), and relational scaffolding belong in a closed particle class, never as lexical entries.
- **Compounds are hierarchical**, not flat chains: `tribe = community + identity`, where `identity` is itself a taught compound (`self + memory`), rather than `collective + person + conflict` mashed into one unteachable string.
- **Phonetics come last.** No syllable assignments until the semantic inventory earns human approval.

The hypothesis was not that 99 is the mathematically correct ontology. It was that freezing meaning *before* sound would expose whether prior generators failed because of bad phonetics or because they never agreed on what they were naming.

## Approach

### Reversing the pipeline order

The semantic foundation shipped in the same week as RN-10's Huffman generator, in fact, in the same commit (`e8f81f1`, Jun 27, 2026) that added `tools/fonoran-primitive-roots.js` and its 200-primitive output. The contrast was intentional. [`docs/fonoran-semantic-foundation.md`](../archive/fonoran-semantic-foundation.md) opens by superseding that tooling: phonetic forms assigned before semantic approval are archive-only; canonical work starts from concepts only.

The deliverables were deliberately phonetics-free:

| Artifact | Role |
| --- | --- |
| [`data/fonoran-semantic-primitives.json`](../data/fonoran-semantic-primitives.json) | 99 primitive dimensions with language-neutral descriptions and domain tags |
| [`data/fonoran-grammar-particles.json`](../data/fonoran-grammar-particles.json) | Proposed closed-class particles (32 roles in v1.2; forms reserved, not finalized) |
| [`data/fonoran-semantic-demo-compounds.json`](../data/fonoran-semantic-demo-compounds.json) | 50 demonstration compounds as concept trees only, no roman spellings |
| [`docs/fonoran-semantic-foundation.md`](../archive/fonoran-semantic-foundation.md) | Human-readable proposal: design principles, irreducibility rationales, Mermaid hierarchy diagrams |

[`docs/fonoran-grammar.md`](../docs/fonoran-grammar.md) was updated in the same push to embed the fundamental experience test and point at the semantic inventory as the authoritative primitive list.

### The fundamental experience test

The defining rule, repeated in both the proposal doc and the JSON metadata:

> A primitive concept represents a fundamental human experience that cannot be naturally expressed using simpler Fonoran concepts.

The proposal explicitly guards against misreads. "Would a two-year-old say this?" is the wrong question; **equal**, **before**, and temporal knowing are primitives even if toddlers lack the English words. **Walk** is not: locomotion inherits from **move** plus a modality (**run** = move + fast, **swim** = move + water). **Useful** is not; it compounds from **good + use**. **Cause** and **effect** are grammar particles, not noun dimensions; humans link clauses with *because* / *therefore*, they rarely lexicalize causation as a standalone root.

### v1.2 review changes (Jun 27–28)

The first JSON drop and the v1.2 proposal doc were refined over two days of review before the Jun 28 date stamp:

- Demoted: walk, useful, cause, effect, void (documented in `demoted_from_primitives` with compound or grammar paths).
- Added: use, help, empty, fast, action and absence dimensions the Huffman list had treated unevenly.
- Elevated **thing** and **change** as the most productive noun/process dimensions; **bond**, **conflict**, **equal**, and **strong** as high-leverage relationship and evaluation roots.

Thirteen domains organize the 99 primitives (being, action, ontology, element, space, time, quantity, emotion, evaluation, relationships, process, body, life).

Commit `2de91d1` (Jun 27) moved English into `data/localizations/en.json`; concept IDs and descriptions became language-neutral. [`tools/fonoran-concept-store.js`](../tools/fonoran-concept-store.js) wired CRUD for the inventory via the [Concept Editor](/language#concepts). Commit `d31ae25` (Jun 28) moved derivable concepts into `fonoran-compounds.json` and reserved tense/polarity particles so they could not collide with lexical roots.

### Hierarchical compounding as pedagogy

The 50 demo compounds were chosen to teach trees, not to maximize coverage. Tier-1 pairs (`community = collective + person`, `family = person + bond`) sit beside tier-2 and tier-3 chains where intermediate nodes matter:

```
tribe  = community + identity     (identity = self + memory)
war    = tribe + conflict
nation = tribe + bound + place    (depth 4)
```

Flagship examples in the proposal doc contrast with RN-10's flat output: **language** = speak + shared_meaning (not signal + bond + group); **money** = exchange + equal + thing (no abstract "value" primitive); **peace** = collective + conflict + empty.

Phase 3 phonetic assignment was documented as deferred steps, rank by human fundamentality, reserve particles first, assign shortest syllables to highest-ranked concepts, with an explicit ban on running `fonoran-primitive-roots.js` for canonical work until semantic approval.

## Evaluation

There was no formal user study or automated ontology validator. Evaluation was editorial:

- **Irreducibility review**: argument-by-argument application of the fundamental experience test, with demotions documented in JSON.
- **Compound-tree inspection**: the 50 demo compounds and Mermaid diagrams as test corpus: could `government`, `religion`, `document` be reached through taught intermediates?
- **Failure-mode checklist**: the proposal doc's table mapping RN-10 symptoms (English-ranked lemmas, Huffman-first ordering, flat compounds, grammar-as-roots) against new constraints.
- **Side-by-side with Huffman output**: [`docs/fonoran-primitive-roots-report.md`](../archive/fonoran-primitive-roots-report.md): `lobawi` versus `tribe + conflict`, `do` for *because* versus a grammar particle.

No score was computed for ontology correctness. Approval was qualitative.

## Findings

**Reordering worked as a design constraint.** The semantic inventory became the reference for *what exists*; phonetic assignment had to justify itself against approved concepts. The proposal marks phonetics as superseded by [fonoran.md](fonoran.md) while the semantic inventory remains the compound reference.

**The fundamental experience test is usable but judgment-heavy.** Demoting **walk** while keeping **move** produced coherent modality compounds; demoting **cause** / **effect** removed Huffman roots that belonged in grammar. Borderline cases (**remember**, **forget**) appear as compounds in demo data while also listed among demoted candidates, ongoing human review, not one-shot classification.

**Hierarchical compounding is teachable on paper.** Chains like `self → memory → identity → community → tribe → war` read as motivated; whether strangers recover those meanings without shared English was deliberately deferred.

**Grammar separation was incomplete on day one.** The v1.2 proposal listed 32 particle roles; Jun 29–30 convergence trimmed this to 17 wired forms (`80162e7`, `79baa18`), with spatial relations staying lexical and only **mi** as a pronoun placeholder.

**Phonetics deferral held: mostly.** The Huffman run in the same commit was marked experimental and never canonical; human-reviewed sound assignment is RN-13's story.

Nothing here proved 99 is the correct count. It showed that meaning-first produces a reviewable artifact generators alone did not.

## What Changed

The semantic foundation's core decisions persisted into current architecture:

- **Concepts are canonical inputs.** [`docs/fonoran-grammar.md`](../docs/fonoran-grammar.md) still embeds the fundamental experience test and links to the semantic foundation doc for the full primitive inventory.
- **Grammar stays out of the lexicon.** Causation, tense, and negation route through particles; the live particle inventory in `data/fonoran-grammar-particles.json` (v2.1) is the operational descendant of the v1.2 proposal.
- **Hierarchical compounds** remain the preferred teaching shape in `fonoran-compounds.json` and demo data.
- **English is localization**, not ontology: `data/localizations/en.json` holds glosses; concept IDs are language-neutral.

What evolved or was challenged:

- **Particle inventory shrank** from the 32-role proposal to 17 wired forms once translation coverage and grammar-doc rules were enforced (RN-14).
- **Primitive count in the live inventory** converged toward ~97–118 approved roots through editorial review, not a hard lock at 99.
- **Success metric shifted.** Commit `5cfe28a` (Jun 30) added [`docs/fonoran-constitution.md`](../docs/fonoran-constitution.md) and demoted pure ontology in favor of recoverable communication; the campfire test. The semantic foundation's "correct decomposition" goal became one input to a broader question about whether two strangers could understand each other (RN-12).

Later notes in sequence:

- **RN-12: The campfire test (communication over correctness)**: constitution and playtest metric that reframed how the semantic inventory would be judged
- **RN-13: Concepts are canonical, sounds are editorial proposals**: the converged pipeline that finally assigned phonetics under human review
- **RN-14: Grammar as particles, not words**: operational particle class and 100% translation coverage
- **RN-15: Compiling English into meaning**: interpretive translator resolving English to nearest approved concepts

RN-10's Huffman generator, Gen 3's coordinate primitives, and the flat compound concatenators remain in the archive as cautionary references, not competing authorities.

## Open Questions

The semantic foundation answered "can we agree on meaning before sound?" with a qualified yes, enough to adopt the inventory as reference and build editorial tooling on top.

It left sharper questions that motivated what followed:

- **How should success be measured?** Is Fonoran an ontologically correct decomposition system, or a communication experiment where multiple compound strategies for the same idea are valid if meaning is recoverable? (RN-12)
- **How do approved concepts get exactly one Fonora-script spelling without algorithms silently minting vocabulary?** (RN-13)
- **Which relationships belong in the sentence skeleton versus the lexicon** once spatial and pronominal coverage is tested against real translation? (RN-14)
- **Can English input compile to the nearest approved concept** rather than demanding word-for-word glosses? (RN-15)
- **Is 99 the right scale**, or does the tiered model (~50 communicative core → ~100 extended → unlimited) from the constitution supersede a single flat primitive list?

The last question, ontology versus communication, is the bridge to RN-12's Research Question. The semantic inventory supplies the roots; the constitution asks whether sharing them actually works.

## References

**Related commits**
- `e8f81f1`: Semantic foundation doc, primitives JSON, grammar particles proposal, demo compounds (same push as primitive-roots generator)
- `2de91d1`: Separate concept ontology from English localization
- `d31ae25`: Restructure inventory around grammar particles and transparent compounds
- `16e9150`: Editorial root generation workflow with collision and boundary scoring
- `80162e7` / `79baa18`: Grammar particles as first-class category; trim to rule-compliant core
- `5cfe28a`: Communication experiment pivot; add constitution

**Documentation:** [`docs/fonoran-semantic-foundation.md`](../archive/fonoran-semantic-foundation.md), [`docs/fonoran-grammar.md`](../docs/fonoran-grammar.md)

**Interactive demo:** [Concept Editor](/language#concepts)

**Source:** [`data/fonoran-semantic-primitives.json`](../data/fonoran-semantic-primitives.json), [`data/fonoran-grammar-particles.json`](../data/fonoran-grammar-particles.json), [`data/fonoran-semantic-demo-compounds.json`](../data/fonoran-semantic-demo-compounds.json), [`tools/fonoran-concept-store.js`](../tools/fonoran-concept-store.js)

**Future research notes:** RN-12 (campfire test / constitution), RN-13 (editorial pipeline), RN-14 (grammar particles), RN-15 (interpretive translator)
