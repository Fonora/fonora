---
status: Active
date: 2026-06-29
phase: phase-3
---

# Grammar as particles, not words

## Research Question

[RN-13](/research/notes/the-campfire-test-communication-over-correctness) closed Jun 28 with approved spellings for every root candidate and a working editorial loop, concepts in, phonetic proposals out, humans as the gate. Its explicit follow-up was grammatical, not lexical:

**With roots flowing cleanly, which relationships belong in the sentence skeleton, and which belong in the open-ended lexicon?**

That boundary had already failed once. [RN-10](/research/notes/optimal-sounds-wrong-premise) assigned Huffman syllables to English-ranked lemmas and produced `do` for *because*, while *with* and *without* competed for root slots. [RN-11](/research/notes/the-irreducible-dimensions-of-meaning) responded by demoting **cause** and **effect** from the primitive inventory and proposing a separate closed-class particle list, 32 roles in the v1.2 JSON, phonetic forms reserved but not finalized. Commit `d31ae25` (Jun 28) reserved tense and polarity placeholders in the root generator so particles would not collide with lexical assignment, but the inventory was still a proposal on paper.

By the same evening, [RN-15](/research/notes/concepts-are-canonical-sounds-are-editorial-proposals) had a three-layer English compiler: frame parser, resolution cascade, surface builder. It could map content words to approved concepts and surface honest red gaps. Running real sentences against that compiler made the particle question operational rather than philosophical. English treats *not*, *when*, *only*, and *if* as small words that sit beside content vocabulary; Fonoran had to decide which of those compile to invariant grammatical markers, which resolve to lexical concepts like **inside** or **here**, and which are handled structurally without any emitted form at all.

The question this note addresses:

**Which English surface relationships must live in a closed particle class, never as roots, so the translator, the root generator, and the grammar spec all agree on what is grammatical machinery versus vocabulary?**

## Hypothesis

The working hypothesis was that pronouns (at least **I**), tense, negation, affirmation, conditionals, interrogatives, and focus modifiers are **particles**: a small, invariant, closed class stored outside the root inventory. They occupy fixed slots in the sentence skeleton (`Subject · Time · Event · Object · Modifiers`) and never fuse into adjacent spellings.

Some relations need no marker at all, **present tense is simply unmarked** when the Time slot is empty. Polarity compositions like *nobody* = negation + **person** happen at the particle/root layer rather than through dedicated lexical entries.

The hypothesis was not that every relational English word becomes a particle. RN-11's 32-role proposal had grouped spatial prepositions, deixis, conjunctions, and causation connectives alongside tense: a useful first sketch, but one that risked duplicating the lexicon. The experiment was whether drawing a hard line and wiring only the genuinely grammatical subset into the translator would (a) stop grammar from leaking back into roots and (b) let the English regression corpus reach full coverage without inventing vocabulary.

## Approach

### From proposal to reserved forms

The semantic foundation (`e8f81f1`, Jun 27) shipped [`data/fonoran-grammar-particles.json`](../data/fonoran-grammar-particles.json) at version `1.2-grammar-inventory`: 32 proposed roles across pronoun, tense, logical, relationship, deixis, and interrogative groups, with **cause** / **effect** explicitly routed to *because* / *therefore* particles rather than noun dimensions. Only **mi**, **ta**, and **na** (future) had placeholder forms; everything else was role + gloss only.

Commit `d31ae25` (Jun 28) restructured the live inventory around that separation: 97 true primitives, derivable concepts moved into [`data/fonoran-compounds.json`](../data/fonoran-compounds.json), and `reserved_particles` added to [`data/fonoran-primitive-roots-config.json`](../data/fonoran-primitive-roots-config.json) so [`tools/fonoran-root-sound-assign.js`](../tools/fonoran-root-sound-assign.js) could block particle forms during editorial assignment. The `particleFlowPenalty` scorer already penalized roots that matched or abutted common particle frames (`mi ___`, `mi ta ___`, `mi na ___`); collision profiles in [`data/fonoran-collision-profiles/en.json`](../data/fonoran-collision-profiles/en.json) surfaced `particle_near_miss` warnings when a candidate root sat too close to a reserved form.

### Wiring particles into the runtime

Commit `80162e7` (Jun 29) made particles a first-class runtime category alongside roots and compounds:

| Component | Role |
| --- | --- |
| [`data/fonoran-grammar-particles.json`](../data/fonoran-grammar-particles.json) | Curated inventory with assigned `v*`/`z*` phonetic forms, English `triggers[]`, and `quantifier_pronouns` composition table |
| [`tools/fonoran-particles.js`](../tools/fonoran-particles.js) | Loader, trigger index, quantifier expansion, runtime bundle for the translator |
| [`tools/fonoran-translator.js`](../tools/fonoran-translator.js) | Particle resolution in `resolveSlot` before lexical lookup; tense pass emits **ta**/**sa**; wh-clauses emit **wo** + interrogative slot |
| `GET /api/fonoran/grammar-particles` | Read-only API surface; particles appear in the Dictionary as a separate category |
| [`docs/fonoran-grammar.md`](../docs/fonoran-grammar.md) Rule 3 | Living spec kept in lockstep with the JSON inventory |

Design constraints carried through from the stub:

- **Reserved forms are blocked** in root collision scoring: particles never compete with lexical concepts for syllables.
- **Particles emit in skeleton order** and stay separate tokens; they do not inflect or concatenate into roots.
- **The closed class stays small**: expansion requires both grammar-doc sanction and translator wiring.

The same commit normalized English possessives in the tokenizer (`man's` → `man`) on the premise that possession is grammatical scaffolding, not a separate vocabulary item, and added the transparent compound *almost* = **near** + **far** to cover a remaining lexical gap.

### Trimming to a rule-compliant core

Less than an hour later, commit `79baa18` cut the inventory from 35 entries to **17 wired particles**. The trim was principled, not arbitrary:

- **Spatial relations** (*in*, *at*, *toward*, *from*, *with*) → lexical concepts (**inside**, **here**, **up**/**dal**, **reach**/**ni**, etc.)
- **Deixis** (*this*, *that*) → lexical
- **Pronouns beyond `mi`** → lexical resolution (or gaps), not particles
- **Connectives** (*and*, *or*, *but*, *because*, *therefore*) → structural clause handling, not emitted particle forms

What remained: **mi**; tense **ta**/**sa** (present omitted); **no**/**ya**/**von**; interrogative set **wo** + **vus**/**zas**/**zes**/**zis**/**zos**/**zus**; focus **vat**/**vet**/**vit**; quantifier compositions (*nobody*, *everyone*, …) built from **no** or lexical **all**/**some** + **person**/**thing**.

A phonemic fix shipped in the same pass: future tense **`na` → `sa`**, so *will not* compiles as `sa no` rather than `na no`: two particles that had been one vowel apart.

Grammar-doc examples were rewritten to use real dictionary words (**ba**, **ben**, **nal**, **bem**, **benba**, **benbanal**) instead of legacy illustrative tokens, so the spec matched the vocabulary the translator actually resolved.

## Evaluation

The primary evaluation instrument was the English→Fonoran regression corpus exercised by `npm run test:translator` ([`scripts/fonoran-translation-gaps.js`](../scripts/fonoran-translation-gaps.js) with `--assert`). Commit `80162e7` persisted the first full run to [`data/fonoran-translation-test-latest.json`](../data/fonoran-translation-test-latest.json) and surfaced it at `/language#gaps`.

At that moment, corpus version `1.0` contained **96 phrases across ten levels** (basic statements through negation and questions). **Coverage was 100% (96/96)**: every phrase resolved without a hard lexical gap. Commit `79baa18` refreshed the saved report at the same percentage after the inventory trim.

There was no formal user study. Informal questions the team was actually asking:

- **Coverage:** does factoring grammar into particles clear the regression corpus without minting roots for *not*, *when*, *only*, or tense auxiliaries?
- **Collision safety:** does `reserved_particles.forms` prevent the root generator from proposing **no**, **mi**, or **zes** for unrelated concepts?
- **Grammar-vs-lexicon boundary:** when English uses a preposition, does mapping to a lexical spatial root produce intelligible Fonoran, or does it fight the particle model?
- **Present-as-default:** do sentences without a Time particle read correctly as present without an explicit marker?
- **Quantifier composition:** do *nobody* / *everyone* resolve as transparent **no**/**all** + **person** rather than as monolithic roots?

Secondary checks: particle entries browsable in the Grammar view (`/language#grammar`) and Dictionary; golden tests in [`js/tests.js`](../js/tests.js) updated in `d31ae25` for the restructured inventory.

## Findings

**Separating grammar from the lexicon worked for the wired subset.** Causation no longer competes for a root: *because* and *therefore* are not primitive dimensions (RN-11) and are not emitted as particles either, they are handled as clause-level structure in the translator, which matches how Fonoran treats conjunctions generally. The Huffman-era mistake of lexicalizing *because* was designed away rather than patched.

**The 32-role proposal was too broad.** Treating *with*, *in*, and *this* as particles would have shadowed spatial and deictic roots the semantic inventory already needed. The Jun 29 trim to 17 forms was a deliberate shrink, documented in the JSON `scope_note` and `deliberately_lexical` block. Spatial meaning stays lexical; only **mi** remains a pronominal particle for now.

**Present tense as zero marker held.** The grammar spec's "Time slot empty = present" rule survived contact with the regression corpus. Past and future require **ta** and **sa**; content roots never inflect for time.

**100% coverage was real for the corpus at the time, but fragile.** The milestone was measured on 96 phrases. The corpus has since grown (version `2.0`, 100 phrases); the latest saved report shows **97% coverage** with three distinct gaps; the metric is a moving target, not a permanent certificate. Coverage also distinguishes resolution quality tiers (`direct`, `interpreted`, `semantic`, `unknown`); a phrase can be "covered" while still relying on soft semantic matches.

**Phonemic distinctness matters between particles.** Renaming future **na** → **sa** addressed a real confusion risk with negation **no**. Particle forms were assigned from a reserved `v*`/`z*` pool precisely so they would not collide with approved roots.

**What did not fully settle:** possession particles (still TBD in the grammar table), comparison markers, full pronominal coverage beyond **mi**, and whether every English auxiliary pattern deserves a particle or a structural rewrite. The grammar doc still marks tense placeholders **ta**/**sa** as "Under Development" even though they are wired: a honesty flag that the architecture is live but not linguistically final.

## What Changed

Decisions that survived into current architecture:

- **Rule 3 in [`docs/fonoran-grammar.md`](../docs/fonoran-grammar.md):** grammar uses invariant particles; concepts never inflect.
- **`reserved_particles.forms` in config** blocks root assignment; collision profiles warn on near-misses.
- **[`tools/fonoran-particles.js`](../tools/fonoran-particles.js)** as the single loader/trigger index shared by translator and API.
- **Quantifier pronoun composition** at the particle/root layer per the JSON `quantifier_pronouns` table.
- **Present tense unmarked**: still the default in both spec and translator.

What was superseded or narrowed:

- The **32-role v1.2 proposal** (full pronoun paradigm, spatial particles, lexical *because*/*therefore* particles) → **17 wired forms** with explicit lexical routing for spatial/deictic meaning.
- Future particle **`na`** → **`sa`** for phonemic separation from **no**.
- The claim that particles alone finish English compilation, they clear grammatical slots, but content resolution still depends on the interpretive translator and an growing root inventory.

Later notes in sequence:

- **RN-12: The campfire test (communication over correctness)** (Jun 30): reframed success from corpus coverage to recoverable meaning between strangers
- **RN-15: Compiling English into meaning**: the three-layer compiler that consumes these particles in its surface builder (notebook reading order places RN-15 immediately before RN-14; development overlapped on Jun 28–29)
- **RN-16: Typing an invented script**: once reading and translation paths existed, how speakers physically produce Fonora spellings
- **RN-17: Can strangers recover meaning?**: playtests asking whether the particle + root system works for humans, not just the regression runner

## Open Questions

Factoring grammar into particles answered RN-13's boundary question for the wired inventory and cleared the Jun 29 regression corpus. It left sharper questions for what followed:

- **Can ordinary English compile into frames that use these particles and approved roots correctly, without fabricating spellings for gaps?** The interpretive translator (RN-15) was already underway; particles removed a class of false lexical resolutions but longer phrases, clause connectives, and compound assembly from approved roots remained uneven.
- **How should success be measured once coverage hits a plateau?** Hitting 96/96 on a curated corpus is useful engineering signal; it is not the same as two strangers understanding each other around a campfire (RN-12).
- **Which grammatical roles still belong in the particle class?** Possession, comparison, and the rest of the pronoun paradigm are explicitly open in the grammar spec.
- **Does a closed particle inventory scale to languages beyond English input?** Triggers are English surface words today; other localizations may surface different leakage patterns.

The notebook's next entry after RN-14 is RN-12's constitution; the pivot from "does the compiler resolve?" to "does communication recover?"

## References

**Related commits**
- `e8f81f1`: semantic foundation; v1.2 grammar-particle proposal (32 roles, forms reserved)
- `d31ae25`: restructure primitives; reserve tense/polarity particles; compounds split out
- `80162e7`: grammar particles as first-class category; translator wiring; 100% on 96-phrase corpus
- `79baa18`: trim to 17 rule-compliant particles; `na` → `sa`; grammar doc aligned to live vocabulary
- `e03f6db`: addressee root for second-person *you* (post-particle lexical gap work)

**Documentation:** [`docs/fonoran-grammar.md`](../docs/fonoran-grammar.md)

**Interactive demo:** [Grammar](/language#grammar)

**Source:** [`data/fonoran-grammar-particles.json`](../data/fonoran-grammar-particles.json), [`tools/fonoran-particles.js`](../tools/fonoran-particles.js)

**Future research notes:** RN-12 (campfire test / constitution), RN-15 (interpretive translator), RN-16 (typing and keyboard), RN-17 (puzzle conversation / stranger recovery)
