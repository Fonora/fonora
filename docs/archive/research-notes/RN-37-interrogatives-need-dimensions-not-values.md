---
status: Active
date: 2026-07-28
phase: phase-5
---

# Interrogatives need dimensions, not values

## Research Question

Fonoran forms content questions by naming an unknown alongside the kind of thing being asked about, so `nohu ba` is *who* and `nohu che` is *where*. If that construction is systematic, then the range of questions Fonoran can ask is bounded by a distinction the lexicon has never made explicit: which roots name a **dimension**, and which name a **value** on one. This note asks whether the interrogative inventory is complete, and what the answer reveals about how the quantity domain was built.

[RN-36](/research/notes/llm-role-testing-not-generation) argued that LLMs test the language rather than author it. The immediate follow-on question was what other tools could occupy that testing role. This note answers it from an unexpected direction: a rendering tool caught a structural defect that the gap baseline had already logged but never explained.

## Hypothesis

If every content question is built as `nohu` plus a category root, then two things follow. First, the set of askable questions equals the set of dimension roots in the inventory, so a missing dimension silently removes a question type. Second, a probe built on a scalar value instead of a dimension will be malformed in a way that no unresolved-token count can detect, because the translator will have produced a fluent surface string and logged only the English word it could not place.

The stronger form of the hypothesis: the dimension-versus-value distinction is already doing structural work in Fonoran without ever having been written down as a design rule.

## Approach

The trigger was a visualization, not an audit. A phrase aligner was built under `showcase/` to render Fonoran translations as shareable posters: each token shown with its Fonora script glyphs, its roman spelling, and its gloss, joined by curved lines to the English words it corresponds to. It calls `POST /api/fonoran/translate` and derives alignment by matching token glosses against the English input.

Drawing the connecting lines is what forced the question. For the phrase *how many animals do you own?* the translator returns `be dela nohu lek kal?` and the aligner had to decide what `nohu` connects to. It connected to nothing. A dangling token is invisible in a text-only translator view, where `nohu lek` simply reads as fluent output, but a line that cannot be drawn is conspicuous.

The gap baseline had recorded `how_many` as unresolved, and the translator's own reasoning string said that `unknown+many` approximates the quantity probe. Both were accurate. Neither indicated that the approximation was built from the wrong kind of root.

## Evaluation

Five interrogatives were translated and their dimension roots compared:

| English | Fonoran | Dimension root | Kind of root |
| --- | --- | --- | --- |
| who | `nohu ba` | `ba` person | category |
| what | `nohu to` | `to` thing | category |
| where | `nohu che` | `che` place | category |
| when | `nohu kan` | `kan` time | category |
| how many | `nohu lek` | `lek` many | value on a scale |

Four of the five pair `nohu` with a root that names a kind of thing without committing to which one. The fifth pairs it with a root glossed "a lot; lots of them", which commits to a position on the scale before the question is asked.

The `quantity` domain in `data/fonoran-concept-inventory.json` was then audited in full. It holds `one` (`lu`), `many` (`lek`), `some` (`ket`), `all` (`mel`), `more` (`mas`), and `less` (`sha`), plus `fast` (`nek`), which appears misfiled since speed is a rate rather than a quantity. Every quantity entry names a position. None names the axis. Searches for `amount`, `count`, `quantity`, `number`, `total`, and `measure` returned nothing in any seed file.

Two candidate substitutes were tested against the existing compound inventory, since both look plausible at first glance:

- **`mel` (all)**: rejected by evidence already in `data/fonoran-compounds.json`. The compound `always` is `all` + `time`, and `beginning` is `one` + `time`. If `mel` named the quantity axis, then `mel` + `kan` would mean a duration, an amount of time. It means *always*, which is what applying the maximum value to the time axis produces. `mel` is therefore behaving as a value that composes with dimensions, not as a dimension.
- **`lekmel` (whole)**: rejected on sense. Its gloss is "all the parts together", which is completeness or intactness rather than cardinality. A whole object is not a count of objects, so `nohu lekmel` asks for an unknown entirety, and a stranger answering with a number would not be answering the question.

A value-neutrality test emerged from this: a dimension root must not commit to a position. `che` does not say which place, `kan` does not say when, `ba` does not say who. All six quantity roots fail that test by construction.

## Findings

**The quantity domain has no dimension.** Time carries both values (`ta` past, `sa` future) and a dimension root (`kan` time). Space carries relations and a dimension root (`che` place). Quantity carries six values and nothing that names what they are values of. This is a structural asymmetry across domains, not a missing vocabulary item, and it is why `nohu lek` reads as "unknown a-lot" rather than "unknown amount".

**Invariant spelling raises the cost.** Because Fonoran words never inflect, plural is not marked on the noun: `kal` is both animal and animals. Quantity words are therefore the only means of expressing number at all, which means the quantity slot carries more grammatical load in Fonoran than its English counterpart. A domain with no dimension root is a heavier omission here than it would be in a language with plural morphology.

**The grammar doc gave the wrong reason for why being unavailable, and the fix was one line of policy.** `docs/fonoran-grammar.md` listed why and how together as deferred, "no reason/method concept yet". The outcome was correct: translating *why did the child cry?* returned `why` in `unresolved`. The stated cause was not. `cause` has an approved root, `gak`, so the raw material for `nohu gak` existed and had for some time. What was missing was not a concept but a decision. `why` is now wired as `nohu gak`, and *why are you here?* returns `be nam nohu gak?` with no gaps. *How* is a different case and the doc is substantially accurate there: `way`, `manner`, and `method` are all absent, so it is blocked at the concept layer. The nearest existing root is `rule` (`ha`), glossed "a pattern to follow; how things must be done", which an inventory audit will surface and which is worth ruling out explicitly. It is prescriptive and filed under the social domain, so `nohu ha` asks which norm applies rather than by what means something happens, and it fails the value-neutrality test for a different reason than `lek` does. Two failures with different causes had been filed under one explanation.

**The interrogative system is almost entirely untested.** This is why the discrepancy survived. The golden corpus contains zero phrases asking *why*. Neither `why` nor `how` nor `how_many` appears in the 132-entry gap baseline, not because they resolve but because nothing in the corpus attempts them. The forms that do work, `who`, `what`, and `where`, are absent from the baseline for the opposite reason. The result is a construction family where success and failure are indistinguishable from the tracked data, and CI passes either way. `when` is the lone interrogative in the baseline, and it appears to be tracked for its subordinating use (*when the dog barked, the child ran*) rather than its question use, which resolves cleanly as `nohu kan`.

**Adjacent documentation drift was found in the same pass.** The behind/front/between line in `docs/fonoran-grammar.md` is stale for two of three: `behind` is `so` and `front` is `cha`, leaving only `between` as a live gap. In `docs/fonoran-numerals.md`, the disambiguation table still lists `fa` as the lexical root for "one", which has not been true since `one` was respelled to `lu` and `fa` was reassigned to `child`. That staleness propagates: the deferred open question in the same file proposes swapping digits 1 and 7 so that the root for *one* aligns with numeral 1, and its premise no longer holds.

**The numerals specification is documentation for something that was never built.** `docs/fonoran-numerals.md` defines cardinals 1 to 99, but no number word appears in any seed file, none appears in the 132-entry gap baseline, and translating *two* returns it as unresolved. Separately, the spec assigns digits by sound-grid position rather than by meaning, which collides with grammar: `ta` is digit 2 and the past particle, `sa` is digit 10 and the future particle. The spec acknowledges the overlap as coincidental and unplanned, and defers to context and intonation. For a language whose premise is that strangers recover meaning from written shared roots, intonation is not available on the page, and tense marking and counting both occur constantly in adjacent positions.

**Gaps cluster in closed-class words.** Measured across the 1001-phrase corpus, the largest gaps are modal and connective rather than nominal: `can` appears 81 times, then `very` 12, `must` 11, `for` 11, `with` 10. Conjunctions are absent to the point that committed golden output contains bracketed English, as in `[badi] nes femtam femdi [and]`. Demonstratives `this` and `that` have no form. Concrete physical nouns are well covered by comparison. Fonoran currently describes scenes well and reasons poorly.

**Wiring one probe exposed a silent WH-word loss affecting all of them.** Adding `why` meant testing it in several sentence shapes, and one failed: *why did you go to the river?* returns `be ta gi nan yenan?`, dropping the probe entirely while reporting `unresolved` as empty. The first read was that the new wiring was incomplete. It is not. *Where did you go to the river?* drops `where` in exactly the same way, so the defect predates this work and affects the interrogatives that were considered finished. When a content question also carries a destination path, the question word is discarded and nothing records it. This is the worst of the three failure modes in this note: `nohu lek` was fluent and wrong but present, and a tracked gap is absent and logged, whereas this is absent and silently claimed as a complete translation. It is now a broken probe.

**A rendering tool made a better auditor than the gap report.** The gap baseline is a set of English words that failed to resolve on phrases the corpus happens to contain. It is a good instrument for coverage of what is tested and a poor one for well-formedness, because a construction can be fluent, logged, and wrong at the same time, and an untested construction produces no signal at all. Forcing every token to justify a visible correspondence surfaced both problems: the malformed quantity probe, and the absence of any interrogative coverage behind it.

## What Changed

The phrase aligner is reclassified. It was built to showcase the language and it works for that, but its alignment requirement turns out to be a language QA surface: any token that cannot draw a line is either a genuine structural difference from English, which is interesting, or a malformed construction, which is a defect. Both are worth seeing. It now also renders the translator's `unresolved` list on the poster, since an unresolved word is precisely the thing it cannot draw a line to and would otherwise omit silently.

The dimension-versus-value distinction is proposed as an audit lens for the concept inventory rather than as a new constitutional rule. It explains the interrogative inventory, it explains why `mel` and `lekmel` cannot substitute, and it predicts that any future probe type will need its own dimension root.

Four documentation corrections followed directly from this audit and were applied to `docs/fonoran-grammar.md` and `docs/fonoran-numerals.md`: the behind/front/between gap list is reduced to `between`, the numerals disambiguation table no longer claims `fa` means one and now maps all ten digits, the numerals spec records that it is unimplemented in seeds, and the `ta`/`sa` collision with the tense particles is written up as an open decision rather than deferred to intonation.

Three things then changed in the translator, all of them consequences of taking the dimension rule seriously.

**`why` is now wired as `nohu gak`.** It required no new vocabulary, only adding `cause` to the dimension set and lifting a prompt instruction that forbade the form. Five probes cover it across motion, desire, emotion, and transitive frames.

**`how many` no longer emits `nohu lek`.** The LLM path was approximating the quantity probe; it now leaves *how many* in `unresolved[]` instead. This is a deliberate reduction in coverage. The previous output was fluent and wrong, and an honest gap is worth more than a malformed probe, because the gap is visible to the tools that count gaps.

**The interrogative family now has test coverage.** Eight probes were added to `data/fonoran-translation-probes.json`: five passing for `why`, and three marked broken for `how many`, `how`, and a WH-loss case described below. The broken ones carry the reason they are broken and what must not be substituted, so the next person to look at *how many* finds the argument against `nohu lek` attached to the failing test rather than only in this note.

The dimension rule is also now recorded where it can be acted on. It was previously implicit in four working forms; it is stated in the `WH_QUESTION_COMPOSITION` policy comment, in the grammar doc, and in the LLM prompt as an explicit prohibition on approximating a probe with a scalar value.

No seed changes were made. Whether the quantity dimension becomes a new primitive, a compound, or a lexicalized idiom is an editorial decision, and the human owns the lexicon. Three options are on the table, and they differ in cost. A new primitive spends one of the 15 remaining slots under the 150-root cap, since 135 are currently allocated. A compound spends none but must satisfy lego recoverability. Lexicalizing `nohu lek` as a fixed unit meaning *how many* spends nothing at all and has direct precedent: `nohu` itself is described in `docs/fonoran-grammar.md` as a lexicalized word taught as one unit, adopted deliberately after playtests showed the separated form read as clause negation.

## Open Questions

- Should the quantity dimension become a root, a compound, or should `nohu lek` be lexicalized as an idiom the way `nohu` was? If a root, does it belong in a ring, given that the campfire core is meant to cover what two strangers need in a first week?
- If plural can only be expressed through quantity words under invariant spelling, does plurality warrant a particle instead, keeping the quantity domain purely lexical?
- What fixes the WH-with-path loss? The question word is dropped when a destination path is present, silently and for every interrogative, so it is a higher priority than any of the vocabulary questions here. Is the probe competing with the path slot, or is it being consumed before slot assignment?
- Should the golden corpus gain a *why questions* level? The corpus devotes levels 8 through 11 to what, who, where, and when, and has none for why, which is why the discrepancy survived. Probes now cover the construction, but 50 corpus phrases would exercise it against real sentence variety.
- Is a manner concept worth a root, now that *how* is the only WH word with no form at all? It is the last gap in the interrogative set, and unlike *how many* it cannot be fixed by naming a dimension of an existing domain.
- What resolves the numeral collision with tense particles: a numeral-frame marker, a reassignment of digit syllables away from `ta` and `sa`, or an explicit decision to mark the whole cardinal system as deferred until it is implemented in seeds?
- Modals are the largest gap by an order of magnitude, with `can` alone at 81 occurrences. Is ability a concept, a particle, or a compound, and does answering that unblock `must` and `should` at the same time?
- Does the aligner's line-drawing requirement generalize into a repeatable audit, where a corpus is swept for tokens that cannot establish correspondence, or is it only useful as a manual inspection tool?

## References

**Documentation:**

- `docs/fonoran-grammar.md`: interrogative construction, the Future Work status table, quantifier composition
- `docs/fonoran-numerals.md`: the cardinal 1 to 99 specification, the disambiguation table, the deferred digit-swap question
- `docs/fonoran-constitution.md`: the four rules, vocabulary tiers, the primitive cap

**Data:**

- `data/fonoran-concept-inventory.json`: the quantity domain audited here
- `data/fonoran-approved-roots.json`: 135 of 150 roots allocated; source for `gak`, `so`, `cha`, `mel`, `lek`
- `data/fonoran-compounds.json`: `always`, `beginning`, `whole`, `sea`, the compounds that settle the `mel` question
- `data/fonoran-translation-gap-baseline.json`: the 132 tracked gaps
- `data/fonoran-translation-tests.json`: the 1001-phrase golden corpus

**Interactive demo:**

- The phrase aligner under `showcase/`, served at `/showcase`

**Related research notes:**

- [RN-12 · The campfire test](/research/notes/the-campfire-test-communication-over-correctness): the recovery standard any new root or idiom must meet
- [RN-25 · Concept-first translation and honest gaps](/research/notes/concept-first-translation-and-honest-gaps): established the gap baseline this note finds insufficient for well-formedness
- [RN-26 · LLM-assisted word generation](/research/notes/llm-assisted-word-generation): the proposal pipeline any new dimension root would pass through
- [RN-29 · Allowing drift, enforcing grammar](/research/notes/allowing-drift-enforcing-grammar): gap sorting into vocabulary, structure, and quality
- [RN-33 · Seeds are truth and four-rules regen](/research/notes/seeds-are-truth-and-four-rules-regen): deterministic preferred-form selection
- [RN-36 · LLMs test the language, they do not generate it](/research/notes/llm-role-testing-not-generation): the testing-role framing this note extends to a non-LLM tool
