# Compiling English into meaning

## Research Question

[RN-13](/research/notes/the-campfire-test-communication-over-correctness) closed the editorial loop: every concept in the inventory could carry exactly one human-approved spelling, and algorithms were demoted to proposing candidates rather than minting vocabulary. That answered *how roots get into the language*. It left a different problem open: *how does ordinary English get into the language?*

A word-for-word gloss is the wrong model. English *jump* does not map to a Fonoran root for jumping if the nearest approved concept is **move**; *over* is not a preposition particle but a spatial path that compiles to **up**. Earlier generators (RN-10's Huffman run, the retired Word Generator) tried to fill gaps by inventing spellings. The Constitution's honesty principle forbids that: if a concept has no approved root, the system should show the gap, not hide it behind a guess.

The question this note addresses:

**Can English be compiled into Fonoran by mapping to the nearest *approved concepts* the language actually has, rather than substituting word for word, while being honest about everything it cannot express yet?**

## Hypothesis

The working hypothesis was that a **three-layer semantic compiler** could do this job:

1. A **frame parser** tokenizes English, strips contentless function words, and assigns grammar slots (Subject · Time · Event · Path · Object · Modifiers) before falling back to naive word order.
2. A **resolution cascade** maps each slot to an approved concept: direct alias → interpretation rules → single-concept WordNet fallback → unknown. The cascade must **never invent spelling**.
3. A **surface builder** walks resolved tokens in slot order and emits roman, pronunciation, and Fonora script, with unresolved tokens visible as honest gaps.

Two constraints rode alongside the architecture:

- **Semantic economy:** prefer the shortest transparent path through approved concepts; omit implied ideas unless emphasis or disambiguation requires them.
- **Visible uncertainty:** interpreted and semantic matches are tinted by confidence tier; genuinely unknown words surface in red rather than being fabricated or silently dropped.

This was a hypothesis to test against real sentences, not a claim that machine translation was solved.

## Approach

The interpretive translator shipped in commit `e8f81f1` (Jun 27, 2026); the same push as the semantic foundation (RN-11) and the archived Huffman generator (RN-10). The initial deliverable was [`tools/fonoran-translator.js`](../tools/fonoran-translator.js), [`tools/fonoran-interpretation.js`](../tools/fonoran-interpretation.js), [`data/fonoran-interpretation-rules.json`](../data/fonoran-interpretation-rules.json), and the specification in [`docs/fonoran-interpretive-translator.md`](../docs/fonoran-interpretive-translator.md), wired into a Translator tab in the language lab.

The design philosophy, stated from the first commit, treats Fonoran as a language of **concepts**. English surface forms are inputs to a compiler, not keys in a bilingual dictionary:

```text
English text
    ↓  Frame parser (phrase-aware, multi-sentence)
Semantic frame (subject, time, event, path, object, modifiers)
    ↓  Resolution (curated aliases → rules → semantic; honest gaps)
Concept ids + spellings
    ↓  Surface builder
Roman line + pronunciation + script
```

### Layer 1: Frame parser

The frame parser in `fonoran-translator.js` assigns slots per [`docs/fonoran-grammar.md`](../docs/fonoran-grammar.md). Articles, auxiliaries, modals, and conjunctions are stripped from the lexical stream; meaning-bearing relational words like `from` are kept and resolved (to **source**) rather than discarded.

Before naive slotting, phrase matchers in `fonoran-interpretation.js` handle idioms (`at war` → **conflict**), be-constructions (`are created equal`), linking predicates (`air feels cool`), phrasal verbs, spatial phrases (`jumped over the moon`), time adverbials, coordinated clauses, and future markers (`will`, `going to`). Present tense emits **no time particle**: only past (`ta`) and future (`sa`) are marked. First-person pronouns map to **mi**; other pronouns resolve to nearest concept hints (`we` → **collective**, `it` → **thing**).

Commit `d407dc3` (Jun 28) expanded this layer substantially: discourse and clause splitting, linking-verb frames, time adverbials, and a unified resolve pipeline shared with the (then still present) Word Generator.

### Layer 2: Resolution cascade

Resolution lives in [`tools/fonoran-english-resolve.js`](../tools/fonoran-english-resolve.js), which builds a runtime context from approved roots, lab compounds, localized aliases (`data/localizations/en.json`), and interpretation rules.

Per-token resolution order: frame concept hint → direct alias → interpreted rule (verb classes, spatial preps, irregular past in `data/fonoran-interpretation-rules.json`) → semantic WordNet fallback (existing root only) → alias_weak (description gloss) → unknown (red gap, never fabricated). Locomotion verbs class-map to **move**; spatial preps map to path concepts (`over` → **up**, `under` → **down**).

Guardrails accumulated as real failures appeared. Commit `d929358` added WordNet deny lists (`reason` must not map to earth; `spirit` must not map to feel), semantic bridges for meaningful function words, and UDHR-style formal parsing (be + participle split, subject carried across coordinated clauses). Strong aliases always beat weak description-derived aliases, so a gloss token like `light` from dark's "no light" cannot shadow the real **light** root.

The standalone Word Generator, which had offered a "guessed compound" tier, was retired in `e03f6db` once compound work moved to Word Creator and the interpretive layer. The resolution header comment still mentions a guessed-compound tier historically, but the live cascade ends at semantic/alias_weak/unknown.

### Layer 3: Surface builder and UI

The surface builder walks resolved tokens in slot order, emits grammar particles unchanged, and attaches pronunciation via `fonoran-pronunciation.js`. The Translator tab (`language/fonoran-app.js`) color-codes resolution tiers: direct (default), interpreted (yellow), semantic and alias_weak (orange), unknown (red). Example chips use sentences that resolve cleanly, *All men are created equal* compiles to `person · make · equal` rather than a literal gloss of every English word.

`POST /api/fonoran/translate` returns the surface line, semantic slots, per-token `resolution_kind`, and an `unresolved` list for gap tracking.

## Evaluation

There was no formal user study. Evaluation was engineering regression against a growing English corpus and informal inspection of whether the compiler behaved honestly.

**Golden regression suite.** Commit `80162e7` (Jun 29) introduced [`data/fonoran-translation-tests.json`](../data/fonoran-translation-tests.json), roughly 100 canonical English sentences across 11 levels, each carrying an expected `fon` (roman) output. The CLI runner [`scripts/fonoran-translation-gaps.js`](../scripts/fonoran-translation-gaps.js) (`npm run test:translator`) fails on any drift from golden output. A separate quality report tracks pass / soft-review / hard-gap tokens by resolution tier.

**Coverage milestone.** After grammar particles were wired as a first-class closed class (RN-14, same sprint), the English corpus reached **100% resolution** on the graded test set (96/96 phrases in commit `80162e7`). That metric measures "every token resolves to *something* approved," not "every translation is semantically perfect."

**Formal-prose stress test.** UDHR Article 1 was added as an integration target in `d929358`. With the lexicon available at the time, it still surfaced multiple red tokens, `[free]`, `[dignity]`, `[rights]`, `[conscience]`, `[spirit]`, `[brotherhood]`, which the spec documents as intentional:

```text
ba me [free] mal [dignity] [rights] · fi tu pa [conscience] che mam sam [spirit] [brotherhood]
```

Long formal English is an acceptance target for *frame parsing*, not for full lexical coverage.

Informal review focused on whether phrase patterns recovered hidden clause structure, whether interpretation rules produced nearest concepts rather than lazy homonyms, and whether red tokens reflected genuine lexical gaps versus missing aliases.

## Findings

**The three-layer architecture held.** English input reliably compiles into grammar frames and nearest-concept mappings for the curated test corpus. Direct matches render plainly; interpreted and semantic matches are flagged by tier; unknown words stay red. The flagship example, *the man jumps over the moon* → `person · move · up · moon`, demonstrates the design intent: compile meaning, not morphology.

**Honest gaps work as a language-development signal.** Red tokens are treated as inventory TODOs, not errors to hide. The grammar doc states explicitly that the translator should function as a **language development tool**, not just a translation tool. Formal prose correctly surfaces many gaps until matching roots exist.

**Phrase-aware parsing mattered more than expected.** Naive word-order slotting failed on linking verbs, be-constructions, idioms, and multi-clause sentences. The Jun 28 frame-parser push (`d407dc3`, `d929358`) was as important as the resolution cascade itself.

**WordNet fallback is useful but dangerous.** The semantic tier rescued tokens with no curated alias when a legitimate hypernym already had a root, but it also produced bogus mappings without deny lists and bridges. It remains a **review-tier** fallback, not a trusted gloss.

**100% corpus coverage is a narrow claim.** Full resolution on the graded test set required grammar particles (tense, negation, connectives) living outside the lexicon, work documented in RN-14 and integrated in `80162e7`. Coverage on curated short sentences does not extend to statutes, modals (`should`, `must`), or compound assembly from approved roots alone.

**Compound assembly remains open.** The compiler resolves to existing roots and approved lab compounds. It does not yet build transparent multi-root compounds on the fly from approved primitives; the future-work list in the spec still calls this out explicitly.

## What Changed

The interpretive translator became the primary English entry point for the language lab and the regression gate for grammar and vocabulary changes:

- **Resolution cascade** rules in [`docs/fonoran-grammar.md`](../docs/fonoran-grammar.md) (Resolution cascade & honest gaps) are the operational spec; the translator enforces them at runtime.
- **Localized aliases** in `data/localizations/en.json` are the preferred path for exact English words; interpretation rules handle classes and frames.
- **Grammar particles** emit from `tools/fonoran-particles.js` and never fuse into spellings; the frame parser and particle runtime share the same slot model RN-14 defined.
- **Lab bucket** (`fonoran-sound-bucket.js`) is the runtime source of truth for concept spellings once roots are approved through RN-13's pipeline.

What was superseded or removed:

- The **Word Generator** guessed-compound tier: retired in `e03f6db`; compound work belongs in Word Creator under human review.
- **Word-for-word substitution** as a design goal, explicitly rejected from the first commit onward.

Later notes in sequence:

- **RN-14: Grammar as particles, not words**: closed-class particles that let the test corpus reach full token resolution (developed in parallel and integrated during the same sprint)
- **RN-16: Typing an invented script**: closing the read-write loop after read-only translation
- **RN-17: Can strangers recover meaning?**: playtests that ask whether compiled output is communicatively recoverable, not merely resolvable

## Open Questions

The compiler answered "can English map to nearest approved concepts honestly?" with a qualified yes for curated input, enough to make translation the project's daily regression surface.

It left sharper questions that motivated what followed:

- **Production, not just consumption:** Reading and translating were covered; how do learners physically *type* Fonora script, and can spelling skill be measured? (RN-16)
- **Recoverability vs resolvability:** The corpus can reach 100% token resolution while still failing the campfire test, does compiled output communicate to a root-knower who never saw the English source? (RN-17)
- **Compound assembly:** Can the translator build transparent compounds from approved roots at runtime, or must every compound be pre-approved in the lab?
- **Formal and modal English:** Modals, legal constructions, and long coordinated prose still degrade or omit meaning (`should` dropped until obligation grammar exists).
- **Weak aliases:** Description-derived alias_weak hits remain a review-tier compromise, when should they be promoted to curated aliases or rejected entirely?

The read-write gap, translation without production, is the bridge to RN-16's Research Question.

## References

**Related commits**
- `e8f81f1`: Initial interpretive translator, interpretation rules, translator tab (Jun 27, 2026)
- `d407dc3`: Discourse/clause splitting, unified resolve pipeline, resolution tier UI (Jun 28, 2026)
- `d929358`: UDHR-style formal parsing, WordNet guardrails (Jun 28, 2026)
- `2605d99` / `31acdce`: Lab bucket as runtime spelling source of truth
- `80162e7`: Grammar particles wired; golden corpus; 100% graded coverage (Jun 29, 2026)
- `e03f6db`: Word Generator retired; addressee root for second-person `you`

**Documentation:** [`docs/fonoran-interpretive-translator.md`](../docs/fonoran-interpretive-translator.md), [`docs/fonoran-grammar.md`](../docs/fonoran-grammar.md) (Resolution cascade & honest gaps)

**Interactive demo:** [Translator](/language#translator)

**Source:** [`tools/fonoran-translator.js`](../tools/fonoran-translator.js), [`tools/fonoran-english-resolve.js`](../tools/fonoran-english-resolve.js), [`tools/fonoran-interpretation.js`](../tools/fonoran-interpretation.js), [`data/fonoran-interpretation-rules.json`](../data/fonoran-interpretation-rules.json)

**Future research notes:** RN-14 (grammar particles), RN-16 (typing and keyboard), RN-17 (puzzle conversation / recoverability)
