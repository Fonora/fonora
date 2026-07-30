---
status: Foundational
date: 2026-07-28
phase: phase-5
---

# LLMs test the language, they do not generate it

## Position

Fonoran is a human-designed language. Every primitive root is an editorial decision made by a person: what concept needs a root, what sound it gets, and what ring it belongs to. The grammar particles and the constitution rules are written by hand. Preferred compound forms are selected by a deterministic algorithm (`fonoran:regen:four-rules`), but the four criteria that algorithm scores against are human-defined language research decisions, not model outputs. Ring assignments, concept inventory boundaries, and the 150-primitive hard cap are all editorial choices. No part of the language's identity was minted by a language model.

LLMs appear in the Fonoran toolchain in one role only: **as simulated strangers**. They stand in for a person from a different linguistic background trying to recover meaning from a compound they have never seen. That is a testing role, not an authoring role. The analogy is a spell-checker that flags suspicious forms without deciding what the word should be.

The toolchain uses LLMs the way a phonetics researcher might use a naive listener panel: to ask "does this recover?" not "what should it say?"

## What LLMs do in this project

### 1. Cross-cultural semantic recovery simulation

The campfire test ([RN-12](/research/notes/the-campfire-test-communication-over-correctness)) asks whether two strangers with no shared language can recover meaning from a compound. Human playtests are slow to run at volume. An LLM prompted as "a speaker with no knowledge of Fonoran, given only the constituent roots" can simulate that stranger and flag compounds where recovery fails. This is the core use described in [RN-20](/research/notes/synthetic-intuition-ranking) and extended in [RN-30](/research/notes/synthetic-only-llm-validity).

The LLM does not decide which form survives. It returns a signal. A human or a deterministic scoring rule decides.

### 2. Translation gap classification

The gap analyzer ([RN-26](/research/notes/llm-assisted-word-generation), `tools/fonoran-gap-analyzer.js`) takes a word that has no Fonoran equivalent and asks the LLM: is this a concept that should be a new primitive, a compound of existing roots, or an alias for something already in the inventory? For compound gaps it returns candidate compositions using only approved concept IDs, which the build resolver then validates. The LLM proposes; the human reviews in the Proposal Review UI before anything touches the seeds.

No LLM-generated proposal becomes a seed without a human accept decision.

### 3. Compound proposal ranking

When multiple valid compositions exist for the same concept, an LLM can provide a ranked intuition signal: which form would a naive listener recover most readily? This supplements the deterministic four-rules scoring ([RN-33](/research/notes/seeds-are-truth-and-four-rules-regen)), which is always the deciding factor for preferred-form selection. The LLM signal is advisory, not determinative.

### 4. Translator and playtest output testing

The multilingual semantic compiler ([RN-28](/research/notes/multilingual-llm-semantic-compiler)) and the translation gap baseline ([RN-25](/research/notes/concept-first-translation-and-honest-gaps)) use LLMs to verify that a translated Fonoran phrase makes sense to a stranger, and to surface honest gaps where the inventory has no equivalent concept. This is QA, not authorship.

## What LLMs do NOT do

- **Invent primitives.** Root names, their phonetic forms, their concept assignments, and their ring placement are human editorial decisions. A primitive is added by editing `data/fonoran-approved-roots.json` or the Word Manager and committing the seed. An LLM cannot write to seeds.
- **Design grammar.** The constitution, the particle set, and the sentence template are human-written documents. Grammar changes require editing `data/fonoran-grammar-particles.json` and `docs/fonoran-constitution.md` plus a version bump.
- **Choose preferred spellings.** The preferred compound form is selected by four-rules scoring (`npm run fonoran:regen:four-rules`), a deterministic algorithm. LLM ranking is a secondary signal, not the tiebreaker.
- **Constitute the language in any sense.** Clearing the LLM cache does not delete any part of Fonoran. The seeds in `data/` remain complete and buildable without any model call.

## Why this framing matters

Seeds are truth. The human owns the lexicon (`CLAUDE.md`). LLM calls happen inside a closed toolchain that writes to a proposal store, not directly to seeds, and every proposal requires a human accept before promotion. Clearing the LLM cache leaves the language completely intact.

A language model trained on many languages has internalized something like naive cross-linguistic intuition: it can flag when a compound form that looks clear in English fails to recover in the semantic frame of a Spanish or Arabic speaker. That is precisely the signal a single-author design process is structurally bad at producing on its own, and it is the only thing the toolchain asks an LLM to do.

The research notes that document the LLM toolchain ([RN-20](/research/notes/synthetic-intuition-ranking), [RN-26](/research/notes/llm-assisted-word-generation), [RN-27](/research/notes/automated-refine-loop), [RN-28](/research/notes/multilingual-llm-semantic-compiler), [RN-30](/research/notes/synthetic-only-llm-validity)) describe testing and validation infrastructure. None of them describe language design authority.

## References

- [RN-12 · The campfire test](/research/notes/the-campfire-test-communication-over-correctness): the recovery standard LLM simulation serves
- [RN-20 · Synthetic intuition ranking](/research/notes/synthetic-intuition-ranking): first LLM-as-evaluator experiment
- [RN-25 · Concept-first translation](/research/notes/concept-first-translation-and-honest-gaps): honest gaps; LLM does not fabricate
- [RN-26 · LLM-assisted word generation](/research/notes/llm-assisted-word-generation): proposal pipeline; human review gate
- [RN-28 · Multilingual semantic compiler](/research/notes/multilingual-llm-semantic-compiler): cross-language testing
- [RN-30 · Synthetic-only LLM validity](/research/notes/synthetic-only-llm-validity): scope and limits of synthetic evaluation
- [RN-31 · Phonetic seeds pipeline readiness](/research/notes/phonetic-seeds-pipeline-readiness): language builds without LLM inventory
- [RN-33 · Seeds are truth and four-rules regen](/research/notes/seeds-are-truth-and-four-rules-regen): deterministic preferred-form selection
- `CLAUDE.md`: "Human owns the lexicon: never bulk-invent vocabulary via LLM without admin edit + seed write"
