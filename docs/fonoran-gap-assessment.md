# Fonora / Fonoran gap assessment

> **Status**: Audit, 2026-07-28. Assesses the project against descriptive-linguistics criteria and against named comparator languages. Findings are evidence-based and cite files; recommendations are proposals, not decisions. The human owns the lexicon.

## Verdict

**Fonora (the script) is a legitimate design in a real tradition.** A script whose glyph shapes encode articulation is a *featural* script. The tradition is small and respected: Hangul, designed in 1443, and Bell's Visible Speech, 1867. Hangul is routinely cited among the most learnable writing systems ever devised, for precisely the reason Fonora was built this way. This is the strongest layer of the project.

**Fonoran (the language) is a legitimate conlang project that is not yet a complete language.** Its structural profile is a **pidgin**: invariant word forms, no inflection, preverbal tense particles, zero copula, fixed constituent order, small root inventory, heavy compounding, no relativizer, no complementizer, no comparative construction, no modality. That list is not arbitrary. It is close to the standard description of what separates a pidgin from a creole.

This is the useful framing, and it is not a criticism. Pidgins are real communicative systems. More importantly, **creoles are the empirical answer to the question this project asks.** A creole is what arises when adults with unrelated native languages must build a shared system quickly, and creoles worldwide converge on a strikingly similar grammar despite unrelated parent languages: no inflection, preverbal tense-mood-aspect particles in a fixed order, zero copula, a general complementizer, a relativizer, and a small set of clause connectives.

Fonoran arrived at most of that profile from first principles. The remaining gaps are, with real precision, the features creolization supplies. That converts "expand the language" from an open-ended worry into a bounded checklist, and it means growth does not mean drifting toward English.

## Layer assessment

| Layer | Rating | Summary |
| --- | --- | --- |
| Script (Fonora) | **Strong** | Featural design, coherent composition, 0 exact symbol collisions |
| Root phonology | **Strong** | `a e i o u` only; `r` and `j` banned; onsets tiered by articulatory ease |
| Morphology | **Adequate** | Isolating and internally consistent; no derivational layer |
| Syntax | **Incomplete** | Cannot express choice, comparison, modality, aspect, or relative clauses |
| Lexicon | **Adequate, capacity-limited** | 135 roots, 454 compounds, but only 6 usable root forms remain |
| Seed integrity | **One live conflict** | Two seed files disagree on the particle inventory; `wo` is claimed as both particle and root |
| Validation | **Unvalidated** | Central hypothesis untested with diverse humans |
| Documentation | **Extensive, mis-structured** | Organized as design rationale, not as a reference grammar |
| Test methodology | **Biased** | Corpus omits the constructions the language cannot express |

## What is genuinely strong

**The script.** Nine sound symbols (5 places of articulation plus 4 manner modifiers) plus a vowel indicator, composing to 24 grid consonants, 4 derived consonants, and 12 vowel keys ([docs/language-rules.md](language-rules.md)). The collision audit reports **0 exact symbol duplicates** under v3. The glyph-to-articulation mapping is genuine, not decorative: simple vowels use place glyphs, long vowels use manner glyphs, diphthongs use nucleus plus glide.

**Root phonology is correctly designed, not accidentally.** Fonoran roots use only the vowels `a e i o u` ([data/fonoran-primitive-roots-config.json](../data/fonoran-primitive-roots-config.json)). That is the most common vowel system in the world's languages and the safest possible choice for cross-linguistic learnability. Onsets are tiered by articulatory ease, and `r` plus `j` are hard-banned from primitives ([tools/fonoran-phonetic-weights.js](../tools/fonoran-phonetic-weights.js)). Banning `r` is exactly right: rhotics are among the most cross-linguistically variable and late-acquired consonants. The stated goal of "sounds anyone can say" is met by construction, not by assertion.

**The separation of script from language is clean.** The script encodes a wide inventory so it can transcribe other languages; Fonoran roots use a deliberately narrow subset. These are different jobs and the project does not confuse them.

**Engineering discipline exceeds nearly every comparable project.** Seeds are canonical, a 1001-phrase golden corpus gates CI, gaps are tracked honestly in `unresolved[]` rather than papered over, and 37 research notes record reasoning. Most conlangs have a wiki page. This has a regression suite.

## Findings, in severity order

### 1. Disjunction is not merely missing, it inverts meaning

This is the most serious defect found and it is worse than a gap.

All ten corpus phrases containing *or* render the alternatives as bare juxtaposition, which is the same surface form Fonoran uses for conjunction:

- "That person is a friend or an enemy." to `ba guba gamba`, readable only as "person friend enemy"
- "Are you tired or sick?" to `be nes femtam du`, "you feel tired sick"
- "Is the pain here or there?" to `tes nam tak`, "pain here there"
- "Is the baby a girl or boy?" to `fa dehu`, both alternatives gone entirely
- "Do you mean this or that?" to `be kenwihu`, both alternatives gone entirely

**Juxtaposition is a valid strategy for conjunction and an invalid one for disjunction.** A listener recovering `ba guba gamba` will conclude the person is both a friend and an enemy, which is the opposite of the assertion. The language currently cannot distinguish "A and B" from "A or B" at all, and it fails silently in fluent-looking output.

By contrast, phrasal *and* works correctly. "I am cold and hungry" gives `mi nes mak saklo`, and a reader recovers the conjunction naturally. Of 90 corpus phrases containing *and*, exactly one surfaces a bracketed `[and]` failure, and that phrase also contains an unrelated gap. **Conjunction is a non-problem; disjunction is a blocking one.** The previous framing of "conjunctions are missing" was too coarse and pointed at the wrong half.

**The mechanism differs by engine, and the distinction matters for where a fix belongs.**

In the production LLM path the connective is not discarded by a stopword list at all. The prompt instructs the model to record it in `unresolved[]` as a short gap token ([tools/fonoran-llm-translate.js](../tools/fonoran-llm-translate.js) line 456), and the model parses both alternatives into a single slot. So the cached frames already carry everything a fix needs: `Are you tired or sick?` yields `object: ["tired","sick"]` with `unresolved: ["or"]`. The information was never lost, only unrendered.

In the deprecated rule-based path the loss is a stopword drop: the `SKIP` set at [tools/fonoran-translator.js](../tools/fonoran-translator.js) spreads in `...CONJUNCTIONS` and `...MODALS` wholesale, where `CONJUNCTIONS` is `and, or, but, nor, yet, so` ([tools/fonoran-english-resolve.js](../tools/fonoran-english-resolve.js) line 163). The doc comment directly above `SKIP` states the rule it breaks:

> Contentless words dropped from the lexical stream. Meaning-bearing relational words (e.g. `from` to source) are NOT skipped: they resolve to a concept or surface as an honest gap rather than being silently discarded.

`or` is unambiguously meaning-bearing, and so are `can`, `must`, and `should`, yet all are classified as contentless in a set whose own contract forbids exactly that.

**Status: fixed in the production path.** Disjunction now renders via `lu` for all eight corpus phrases where the alternatives survive parsing. The rule is applied deterministically at render time rather than by the model, consistent with "LLMs advise, deterministic code decides."

One clarification, because it explains why this defect stayed invisible: the gap *tracking* is honest while the *output* is not. `or`, `and`, `can`, `let`, `must`, and `should` all appear in the 132-entry gap baseline, so the project correctly records that it cannot express them. But the rendered translation is a clean, fluent, well-formed string with no marker of loss. A reader looking at output sees success; only the baseline reveals the failure. Contrast this with genuine gaps, which surface visibly as bracketed forms like `[tetsas]`.

**The implemented design.** The quantity domain already contains the exact operators needed, and no new root or particle is required:

- `mel` (`all`), glossed "every one of them"
- `lu` (`one`), glossed "a single one"
- `ket` (`some`), glossed "a few; part of them"

Coordination can be expressed as quantification over the coordinated set, which is what conjunction and disjunction actually are:

| Meaning | Form | Reading |
| --- | --- | --- |
| A and B | `A B` (bare juxtaposition, unchanged) | default, already works |
| A or B | `A B lu` | "A B, a single one", exactly one of the set |
| A and B, emphatic | `A B mel` | "A B, every one of them" |
| some of A, B | `A B ket` | "A B, part of them" |

So "friend or enemy" becomes `guba gamba lu` and "Are you tired or sick?" becomes `be nes femtam du lu`. This is lego-recoverable in the constitutional sense: a reader who knows only that `lu` means "a single one" decodes "friend enemy one" as one-of-the-two, which is disjunction. It spends none of the six remaining root slots, adds nothing to the closed particle class, and leaves the sentence skeleton untouched. It also preserves the existing default, since bare juxtaposition keeps meaning conjunction.

### 3b. The structural probe suite tested a deprecated engine

Found while adding disjunction probes, and it compounded finding 3.

All 42 structural probes ran through `translateEnglish`, an alias for `translateEnglishLegacy` carrying an explicit `@deprecated Use translate() from fonoran-translate.js` marker. **The probe suite did not exercise the engine that ships.**

The gap between engines was large, not cosmetic. The rule-based engine never groups coordinated items into a single slot, scattering *tired or sick* into `event: [tired]` and `object: [sick]`, and it renders *food or water* and *food and water* identically as `be sak tel ye`. It also drops the WH word when a content question carries a destination path, returning `be ta gi nan yenan?` for *why did you go to the river?* while reporting no gaps. Production does neither.

**Status: fixed.** Probes now run the production compiler, cache-only so CI stays offline, with `--engine legacy` retained for comparison and the engine labelled in the output. Switching engines moved the suite from 32 passing and 14 broken to 38 passing and 8 broken. Six probes recorded as broken were already working in production, including both disjunction cases and the WH-with-path loss, which had been filed as a translator defect and was an artifact of the measuring engine. Fifteen `target_frame` specs had to be rewritten, because they named legacy output vocabulary (`go`, `to`, `tell`, `story`) rather than the concepts production emits (`move`, bare destination, `speak`); one of them, `story`, has no root or compound at all, so the old target was only satisfiable by the legacy engine guessing.

**Switching the engine immediately exposed two production defects that no test could previously see**, which is the clearest available evidence for this section's thesis:

- **Multi-clause results were uncacheable.** The multi-frame branch returned before reaching its cache write, so any input the model split into clauses was never cached. It could not appear in a cache-only CI run at all, and every request re-paid for the API call. Clause frames are now stored under the full input and replayed on lookup.
- **Negation leaked across clauses, inverting meaning.** Each clause was repaired against the *whole* sentence, so text-driven negation repair applied one clause's `not` to all of them. *Machines act and do not learn* rendered as `kelto no mo kelto no lahu`, asserting that machines do not act. The clause frames were correct; the repair pass corrupted the first one. Negation repair is now skipped for multi-clause frames, where the model already marks negation per clause.

Both are the same failure shape as disjunction: fluent, confident, wrong, and reported as success.

### 1b. Two canonical seed files disagree about the closed class

Found while designing the fix above. The particle inventory is the most fundamental part of the grammar and two seed files state it differently.

[data/fonoran-grammar-particles.json](../data/fonoran-grammar-particles.json), which is the file the code actually loads ([tools/fonoran-translator.js](../tools/fonoran-translator.js) line 170, [tools/fonoran-llm-translate.js](../tools/fonoran-llm-translate.js) line 49, [tools/fonoran-particles.js](../tools/fonoran-particles.js) line 13), lists `mi`, `ta`, present-as-null, `sa`, `no`, `ya`, `von`.

The `particles` array in [data/fonoran-concept-inventory.json](../data/fonoran-concept-inventory.json) lists `ta`, `na`, `no`, `ya`, `wo`.

The conflicts are not cosmetic:

- **future tense** is `sa` in the loaded file and `na` in the inventory
- **`wo` is claimed as the question particle** by the inventory, but `wo` is an approved root meaning `lonely`, and the corpus uses it that way in "I feel less lonely now" giving `gem mi nes wo sha`. A particle form is being claimed by a live content root.
- **`von`** (conditional) and **`mi`** appear only in the loaded file

The inventory copy is stale and should be reconciled to the loaded file or removed. This matters beyond tidiness because `fonoran-concept-inventory.json` feeds root-candidate generation ([tools/fonoran-build.js](../tools/fonoran-build.js), [tools/fonoran-root-candidates.js](../tools/fonoran-root-candidates.js)), so a wrong particle list is a latent hazard for any generator that reserves particle forms: it would protect `na` and `wo` while leaving `sa` and `von` unprotected.

Related and smaller: `nek` (`fast`) is filed in the **quantity** domain, where it does not belong. Speed is not a quantity, and the misfiling inflates the quantity domain to 7 when it holds 6 genuine members.

### 2. Modality is absent and it is the largest hole by volume

Ability, obligation, and permission have no Fonoran form. Golden output drops them without trace: "I can make fire" gives `mi kel dat`, identical to "I make fire."

Corpus frequency, counted over 1001 phrases:

- ability: 84 phrases contain *can*, *cannot*, or *could*, plus 1 *able to*
- obligation and necessity: 11 *must*, 12 *have to* or *need to*, 8 *should* or *ought*
- permission: 13 *let*, 2 *may* or *might*

That is roughly 131 phrase-level hits, the largest single expressive gap in the language. The corpus data supports **three** senses that genuinely recur, with ability dominant, necessity secondary, and permission real but smaller. It does not support importing all four English modal words as distinct forms.

Fonoran already has the mechanism. *Want* is an ordinary root chained in the Action slot: "I want to go" is `mi sak gi` ([docs/fonoran-grammar.md](fonoran-grammar.md) Serial Action). Modals can follow that pattern exactly, requiring no new particle and no change to the sentence skeleton.

Existing roots are plausible raw material. `ha` (`rule`) is glossed "a pattern to follow; how things must be done", which is obligation in all but name. Ability is commonly derived cross-linguistically from knowledge (compare Spanish *saber*, "to know how to") or from strength, and both `hu` (`know`) and `strong` are approved roots.

### 3. The test corpus systematically omits what the language cannot do

This is the methodological finding, and it directly answers whether the grammar "actually works."

The corpus generator instructs the model to avoid constructions the language lacks. [tools/fonoran-stranger-corpus-generate.js](../tools/fonoran-stranger-corpus-generate.js) contains "NEVER use how questions" and, until today, "NEVER use why or how questions (those concepts are intentionally absent from the target language)."

The corpus reflects that filtering. Counted over 1001 phrases:

- *than*: **0** phrases. Comparative comparison is completely untested.
- *because*: **0** phrases.
- *why*: **0** phrases (established in RN-37).
- *if*: **1** phrase, despite `von` being an active particle.

**The 66% clean-coverage figure is therefore measured against a corpus curated to avoid the language's known weaknesses.** Coverage of unrestricted English would be materially lower. The suite is a good regression guard and a poor completeness measure, and it cannot surface a missing construction that it never attempts. RN-37 found this for interrogatives; the pattern is general.

### 4. Comparison is absent, and the quantifier sense masks it

`mas` (`more`) works as a quantifier: "Is there more water?" gives `mas ye`. That is quantity-more, not comparative-more. There is no construction for "X is bigger than Y", the Future Work table lists Comparisons as **Open**, and with zero *than* phrases in the corpus nothing tests it. The working quantifier makes the gap easy to overlook.

### 5. The vocabulary ceiling is phonotactic, not the stated cap

The constitution sets a hard cap of 150 primitive roots with 135 assigned, implying 15 slots remain. The usable number is **6**.

From [data/fonoran-prefix-safe-roots.json](../data/fonoran-prefix-safe-roots.json):

- free prefix-safe CV forms: **0**
- free prefix-safe CVC forms: **6** (`fek gas gel kak mat tan`)
- free CV forms blocked by Rule 2: **12**
- free CVC forms blocked by Rule 2: **30**

Rule 2 (no root may be a string prefix of another) creates mutual exclusion. Holding `ba` blocks all of `bak bal bam ban bas bat`; holding `dak dal dam dan das dat` blocks `da`. So 42 otherwise-usable forms are blocked by policy rather than by phonotactics.

Two consequences. First, **the cap and the reachable inventory diverge**: the language cannot reach 150 roots under current rules. Second, expansion is a rule decision, not a budget decision. The honest description of the current limit is roughly 141, not 150.

### 6. Aspect and relative clauses are Open, and both recur in the corpus

- **Aspect**: 39 corpus phrases use English progressive, which collapses into `move` (`gi`). The distinction between "I walk" and "I am walking" is not expressible.
- **Relative clauses**: 38 corpus phrases contain *who* or *which*. Listed **Open** in Future Work. "The person who helped me" has no form.

### 7. Numerals are specified but do not exist

[docs/fonoran-numerals.md](fonoran-numerals.md) defines cardinals 1 to 99. No numeral appears in any seed file, the translator returns number words unresolved, and number words are absent from the gap baseline so nothing tracks their absence. The specification also collides with grammar: `ta` is both digit 2 and the past particle, `sa` is both digit 10 and the future particle.

### 8. The central hypothesis is asserted as fact but is untested

The constitution states that two strangers can communicate after roughly an hour on roughly 50 roots. The available evidence is 292 puzzle rounds in `external/fonora-data/data/fonoran-playtests.json`, essentially all authored by one English-native speaker using English-gloss multiple choice. RN-17 concluded the question was unanswered at n=3. RN-30 states directly that the human panel does not exist.

The hypothesis may well be true. It is currently a design conjecture, and the constitution should say so. Note also that English-gloss multiple choice cannot test the hypothesis even in principle, because recognizing a gloss among options is an easier task than recovering meaning unaided.

### 9. A live contradiction in the grammar document

Rule 3 places the negation particle `no` before the Action. The Future Work table says `no` sits in the Time slot. Both cannot be right.

## Comparator context

| System | Inventory | What it tells us |
| --- | --- | --- |
| **Toki Pona** | ~137 words | Nearest in size, but explicitly a minimalist philosophical art project, **not** optimized for communicative range. Being Toki Pona-sized is a choice, not a target. |
| **Basic English** | 850 words | Ogden's attempt at exactly this goal for English. Suggests the order of magnitude for practical utility is high hundreds, not ~150. |
| **Esperanto** | ~900 morphemes | The key lesson: a modest morpheme count plus **regular derivation** yields tens of thousands of words. Fonoran has compounding but no derivational layer. |
| **NSM semantic primes** | 65 | Evidence that a very small meaning core is viable, but NSM is a research metalanguage for definitions, not for daily conversation. |
| **Creoles** | varies | The direct empirical precedent for Fonoran's goal, and the source of its remaining feature checklist. |
| **Hangul, Visible Speech** | featural | The tradition Fonora belongs to, and grounds for confidence in the script. |

The Esperanto comparison is the most actionable. Fonoran's 150-root cap is not really a vocabulary limit if compounds are unlimited, and 454 compounds already exist. What is missing is not root slots but **systematic derivation**: predictable ways to form an agent, an instrument, a place, a negated opposite, an abstraction. Compounding currently does this ad hoc, one entry at a time.

## The six questions, answered

**1. Is this a legit conlang, or the wrong direction?** Legitimate, and the direction is sound. The script is the strongest part and sits in a real tradition. The language is a well-built pidgin missing the specific features that make a pidgin into a full language. Nothing found suggests starting over.

**2. Were LLMs a detriment, and were deterministic algorithms better?** Settled, and correctly (RN-33, RN-36). Deterministic four-rules scoring is the right authority for preferred forms. One refinement worth adopting: LLM agreement that a compound is transparent is not evidence a human would recover it, but LLM **failure** to recover one is real evidence of ambiguity. Use models as falsifiers, never as validators.

**3. Do we expand vocabulary?** Yes, but not primitives. Only 6 root forms are reachable, so meaningful growth must come from compounds plus a proper derivational layer. The high-value additions are few and closed-class: disjunction, modality, comparison, aspect. These are small in number and large in effect.

**4. Is the grammar complete?** No, and the document's length disguises this because it is organized by design rationale rather than by phenomenon. Four categories are fully Open (comparison, relative clauses, aspect, numbers), disjunction is broken, modality is absent, and the test corpus cannot reveal any of it because it was built to avoid them.

**5. What needs addressing right away?** In order: disjunction, because it actively inverts meaning and the fix is free; the particle-inventory disagreement between two seed files, including the `wo` collision; the silent WH-word loss when a destination path is present; modality, on volume; then comparison and aspect. The negation contradiction is a five-minute fix.

**6. How do we make this legit?** Fill the propositional gaps above, add a derivational layer, restructure the grammar as a reference grammar, restate the hypothesis honestly, and **translate the canonical texts**. That last one is the conlang community's de facto proof of life: the Babel text, "The North Wind and the Sun" (the IPA's own illustration passage), Article 1 of the UDHR, and Schleicher's fable. Each will expose grammar holes no corpus phrase reaches, and nothing else produces the "this is a real language" reaction as reliably.

## What "a real language" would require

Ordered by how much each contributes to an informed observer's judgment:

1. **Expressive completeness for propositions.** Choice, comparison, modality, aspect, relativization. Without these a system describes scenes but cannot argue, hedge, rank, or specify.
2. **A derivational layer.** Predictable word formation, not case-by-case compounds.
3. **Canonical translated texts.** Demonstrates the grammar under load rather than on curated sentences.
4. **A reference grammar organized by phenomenon**, so a reader can find what a language is expected to have.
5. **Honest validation status**, which costs nothing and buys credibility.
6. **An unbiased test corpus**, including the constructions the language currently fails.

## Recommended sequencing

Detailed plan lives with the audit roadmap. Summary:

1. Disjunction and the silent WH loss. Correctness before capability.
2. Modality as compounds in the Action slot, following the `sak` precedent.
3. Comparison, then aspect.
4. Decide the root-capacity question explicitly: accept ~141 and grow by compounds, relax Rule 2 to a distinctness threshold and unlock 42 forms, or permit disyllabic Ring 3 roots.
5. Build a compound ambiguity metric: for each compound, count how many other inventory concepts its root stack could equally express. This is a solo-executable proxy for the campfire test and converts an untestable claim into a measurable one.
6. Canonical texts, then restructure the grammar.

## References

**Internal**

- [fonoran-constitution.md](fonoran-constitution.md): four rules, rings, 150 cap, central hypothesis
- [fonoran-grammar.md](fonoran-grammar.md): particle inventory, sentence skeleton, Future Work table
- [language-rules.md](language-rules.md): script symbols, sound grid, vowel grammar, `fonora_version: v3`
- [fonoran-numerals.md](fonoran-numerals.md): the unimplemented cardinal specification
- [data/fonoran-prefix-safe-roots.json](../data/fonoran-prefix-safe-roots.json): the real capacity ceiling
- [data/fonoran-translation-tests.json](../data/fonoran-translation-tests.json): 1001-phrase corpus used for all counts here
- [data/fonoran-translation-gap-baseline.json](../data/fonoran-translation-gap-baseline.json): 132 tracked gaps
- RN-12 campfire test, RN-17 stranger recovery, RN-30 synthetic-only validity, RN-33 seeds are truth, RN-36 LLM role, RN-37 interrogative dimensions

**External comparators**

- Hangul (1443) and Bell's Visible Speech (1867): the featural script tradition
- Creole prototype literature: the convergent grammar of contact languages
- Toki Pona, Basic English, Esperanto, Natural Semantic Metalanguage: inventory-size comparators
