# The campfire test (communication over correctness)

## Research Question

[RN-11](/research/notes/semantic-foundation) answered a structural question: could Fonoran freeze meaning before anyone touched phonetics? The semantic foundation shipped ~99 primitive dimensions, a closed grammar-particle proposal, and fifty demo compounds as concept trees, all deliberately phonetics-free. Its closing section, though, left a sharper question unresolved:

**Is Fonoran an ontologically correct decomposition system, or a communication experiment where multiple compound strategies for the same idea are valid if meaning is recoverable?**

RN-10's Huffman run had already shown what "optimal" looked like when the metric was phonetic cost: top-decile concepts averaged a cost of 9.7, grammar leaked into the lexicon, and compounds like `lobawi` for *war* were transparent on paper and unteachable in practice. Gen 3 and Gen 3.1 had pushed further in the opposite direction, coordinate correctness with high explainability scores, but memorability landed at 70/100 because seven focal-aspect roots shared an `-ee` rhyme class. The semantic foundation fixed the *order* of work (meaning before sound) without yet fixing the *measure* of success.

The question this note addresses is the Phase III pivot those notes deferred:

**Can two strangers who share only a small set of roots, and no native language, invent expressions that the other can reasonably understand, without first agreeing on one canonical compound for every idea?**

## Hypothesis

The working hypothesis was that Fonoran is a **communication experiment**, not a perfect ontology or a deterministic compound generator. The measure of any root, compound, or rule is a single question:

**If someone only knew the shared roots, would they probably recover the intended meaning?**

From that premise:

- **Recoverable meaning beats identical words.** Three speakers can express *river* as `water + path`, `flow + water`, or `long + water`; all are valid if a root-knower would guess the intent.
- **Compounds are meaning-attempts**, not canonical answers. The dictionary keeps a preferred form and a list of understandable alternates.
- **The campfire test gates the root inventory:** would two stranded strangers plausibly need this root in their first week? Yes → communicative core (~50 roots). No → extended or complete vocabulary.
- **Automated heuristics rank only.** Human guess-the-meaning playtests decide which form is preferred; when score and playtest disagree, the playtest wins.

The hypothesis was not that the earlier generators had been useless. It was that they had optimized for the wrong objective, technical correctness, lowest phonetic cost, coordinate explainability, and that reframing the success metric would change what got built next.

## Approach

The pivot shipped as a single coordinated commit (`5cfe28a`, Jun 30, 2026) rather than as a gradual doc edit. The deliverables fell into four layers: philosophy, data model, advisory tooling, and a first playtest surface.

### The Fonoran Constitution

[`docs/fonoran-constitution.md`](../docs/fonoran-constitution.md) is the authoritative statement of *what Fonoran is for*. Where [`docs/fonoran-grammar.md`](../docs/fonoran-grammar.md) describes *how* concepts combine, the constitution describes *why* and *how success is judged*. Its opening reframes the project:

> Fonoran is an experiment in whether people from different native languages can communicate basic meaning by combining a small shared set of roots.

The document defines the one question, the tiered language model (~50 communicative core → ~100 extended → unlimited complete language), the campfire test, puzzle conversation as the repair protocol, and working principles for contributors and generators. [`docs/fonoran-grammar.md`](../docs/fonoran-grammar.md) and [`docs/fonoran.md`](../docs/fonoran.md) were updated in the same commit to point at the constitution as the arbiter when design decisions conflict.

Archive docs were explicitly demoted, not deleted. [`docs/fonoran-gen3.md`](../archive/fonoran-gen3.md), [`docs/fonoran-gen3-1.md`](../archive/fonoran-gen3-1.md), and [`docs/fonoran-primitive-roots-report.md`](../archive/fonoran-primitive-roots-report.md) each gained a banner stating that the Gen 3/DDA coordinate track and the Huffman ~200-primitive run are reference material under the new constitution, not production design.

### Experience tiers and the campfire test

[`tools/fonoran-experience-tiers.js`](../tools/fonoran-experience-tiers.js) became the single source of truth for how roots are organized. Seven **experience tiers** (survival/body, space/motion, social, emotion, time, thinking, abstract) replace linguistic category as the primary grouping axis. Three **language tiers** (communicative core, extended core, complete) gate which roots belong in the "~50-root challenge."

The communicative core is a hand-curated set of 51 concept IDs, `person`, `eat`, `water`, `happy`, `help`, `before`, and so on, chosen by the campfire thought experiment: roots two strangers would plausibly reach for in week one. A separate `COMPLETE_ONLY` set (`pulse`, `signal`-class abstractions) marks concepts that fail the campfire test and stay in the outer ring.

[`scripts/fonoran-apply-experience-tiers.js`](../scripts/fonoran-apply-experience-tiers.js) migrated `experience_tier`, `language_tier`, `campfire_pass`, and `campfire_reason` onto entries in the concept inventory, approved roots, and root candidates. It also seeded gap-fill concepts the core was missing, `happy`, `angry`, `calm`, `trust`, `hope`, `drink`, `tree`, `sky`, `left`, `right`, without touching existing spellings.

### Compounds as ranked meaning-attempts

The old compound model stored one canonical recipe per concept. [`scripts/fonoran-migrate-compounds.js`](../scripts/fonoran-migrate-compounds.js) migrated [`data/fonoran-compounds.json`](../data/fonoran-compounds.json) to version `2.0-communicative`: each entry now has a `preferred` composition plus an `alternates[]` array with advisory `understandability` scores and `status` fields (`plausible` / `confusing` until a human playtest promotes or rejects them).

[`tools/fonoran-expression-candidates.js`](../tools/fonoran-expression-candidates.js) generates the alternate strategies. Its header states the model change explicitly: communicative intent → several simple root-expression candidates → understandability ranking → preferred + alternate forms. Hand-seeded `ASSOCIATION_SEEDS` provide intuitive overlapping compositions, for *river*, `water+path`, `flow+water`, `water+move`, `water+far`, deliberately non-canonical variety rather than one deterministic decomposition.

### Advisory understandability and playtests

[`tools/fonoran-understandability.js`](../tools/fonoran-understandability.js) estimates communicative success as a weighted blend of familiarity (core roots score higher), simplicity (two-root compounds ideal), transparency, ambiguity, and concreteness. The module header repeats the constitution's constraint: **ranking aid only, not an authority.**

[`tools/fonoran-playtests.js`](../tools/fonoran-playtests.js) and [`data/fonoran-playtests.json`](../data/fonoran-playtests.json) record human rounds: whether a root-knower recovered the intended meaning, how many repair turns it took, and whether the challenge used the 50-root filter. The Puzzle Conversation UI in [`language/fonoran-app.js`](../language/fonoran-app.js) operationalizes the protocol: show a Fonoran compound, ask the player to guess the meaning from multiple choice, offer a repair turn with the literal root breakdown on failure, record every round. The dictionary view gained an alternates panel, experience-tier badges, and a communicative-core filter in the same commit.

## Evaluation

There was no formal cross-linguistic user study at this stage. Evaluation was the constitution itself plus a minimal pilot of the playtest machinery on the day it shipped.

The questions the pivot was actually built to answer were narrower than "does Fonoran work as a language":

- **Framing:** Does a written constitution give contributors a single arbiter when ontology work and communication work pull in different directions?
- **Data migration:** Can existing compounds be migrated to preferred + alternates without losing human-chosen preferred forms? (The migration script is idempotent and re-derives heuristic alternates on re-run.)
- **Tier tagging:** Does the campfire test produce a usable ~50-root subset that the Puzzle Conversation can filter on?
- **Heuristic sanity:** Do understandability scores rank intuitive compositions above awkward ones well enough to be useful as a sorting aid?

[`data/fonoran-playtests.json`](../data/fonoran-playtests.json) records three rounds from Jun 30, 2026, all recovered, two after one repair turn (`fever`, `answer`) and one on the first guess (`whole`). One round used the communicative-core filter. This is pilot data, not evidence of communicative success at scale. It confirms the recording pipeline works; it does not validate the campfire test as a predictive gate.

No automated score was treated as proof of understandability. The constitution states the rule explicitly: where score and playtest disagree, the playtest wins.

## Findings

**The reframing held as a design constraint.** Stating that Fonoran optimizes for recoverable meaning, not perfect decomposition, gave a consistent answer to questions that had produced conflicting priorities across RN-07 through RN-11. Generators propose; humans approve. "Optimal" stopped meaning lowest phonetic cost and started meaning most recoverable.

**Multiple valid compounds for the same concept is workable in data.** The migrated compound file (`compound_count`: 82) carries preferred forms and heuristic alternates side by side. Death, for example, prefers `bound + life` while alternates include `no + life` and `end + life`, overlapping strategies a stranger might independently invent. Whether listeners actually recover those alternates without shared English remains an open empirical question (RN-17).

**The tiered model superseded the flat ~99-primitive count as the organizing principle.** RN-11's semantic foundation asked whether 99 is the right scale. The constitution's answer is structural rather than numeric: ~50 for the experiment, ~100 for everyday fluency, unlimited for specialized vocabulary. The communicative core is 51 IDs, not a mathematical derivation from the irreducibility test.

**Earlier experiments became evidence, not authorities.** Gen 3's DDA coordinates, Gen 3.1's distinctiveness scorer, and the Huffman primitive-roots generator remain in the repository. The constitution demoted their *authority* without deleting their *output*. Gen 3.1's distinctiveness logic, for instance, still feeds editorial root scoring in the converged pipeline, but as an advisor to human review, not as an oracle that assigns vocabulary.

**The heuristic is usable but unvalidated.** Understandability scores order candidates plausibly (`birth`'s alternate `life + before` scores 0.94 versus the preferred `source + life` at 0.81), but alternate `status` fields remain `"plausible"` / `"heuristic"` until playtests promote them. No systematic comparison of heuristic rank versus human recovery rate existed on day one.

## What Changed

The constitution's core decisions persisted into current architecture:

- **Success metric:** Recoverable meaning between root-knowers, judged by playtests, is the stated goal in [`docs/fonoran-constitution.md`](../docs/fonoran-constitution.md), [`docs/fonoran-grammar.md`](../docs/fonoran-grammar.md), and compound data (`version: 2.0-communicative`).
- **Tier metadata:** `experience_tier`, `language_tier`, and `campfire_pass` on concept and root records flow from [`tools/fonoran-experience-tiers.js`](../tools/fonoran-experience-tiers.js).
- **Preferred + alternates model:** Compounds carry a preferred form and understandable alternates; the dictionary UI surfaces them.
- **Generator demotion:** Archive docs and the primitive-roots report explicitly subordinate algorithmic runs to human-experience organization.

What the constitution did *not* solve, and explicitly deferred:

- **Operational pipeline.** A philosophy is not a build loop. How concepts become sounds become reviewed compounds without sliding back into auto-generation is RN-13's story; the converged CV/CVC pipeline where collision and boundary scores advise and humans decide.
- **Grammar coverage.** Which relationships belong in the sentence skeleton versus the lexicon once real translation is tested is RN-14's story.
- **English input.** Compiling English to nearest approved concepts rather than word-for-word glosses is RN-15's story.
- **Empirical validation.** Whether strangers actually recover meaning from unrehearsed compounds is RN-17's story; the puzzle-conversation protocol exists; the answer is still being written.

Later notes in sequence:

- **RN-13: Concepts are canonical, sounds are editorial proposals**: the converged pipeline that operationalizes "generators propose, humans approve"
- **RN-14: Grammar as particles, not words**: operational particle class and translation coverage
- **RN-15: Compiling English into meaning**: interpretive translator resolving English to nearest approved concepts
- **RN-17: Can strangers recover meaning?**: playtests as the live empirical edge

RN-11's semantic foundation survived as the compound reference and irreducibility test; what changed is how its output would be *judged*. Correct decomposition became one input to recoverability, not the goal itself.

## Open Questions

The constitution answered "what is Fonoran for?" with enough clarity to reorient every downstream tool. It left operational and empirical gaps that motivated what followed:

- **How do we turn concepts into sounds into compounds into a human review queue without sliding back into auto-generation?** The constitution states the rule; the build loop enforces it. (RN-13)
- **Which relational scaffolding belongs in grammar particles versus lexical roots** once translation coverage is tested against real sentences? (RN-14)
- **Can English compile to the nearest approved concept** rather than demanding word-for-word glosses, and show gaps honestly when no concept fits? (RN-15)
- **Does the whole system pass its own test?** Can two root-knowers recover each other's intended meaning from compounds neither rehearsed? (RN-17)
- **Is the ~50-root communicative core the right experimental unit**, or does the tier boundary need revision once playtest data accumulates?

The last question, philosophy versus pipeline versus proof, is the bridge to RN-13's Research Question. The constitution supplies the *why*; the editorial pipeline supplies the *how*; puzzle conversation supplies the *whether*.

## References

**Related commits**
- `5cfe28a`: Reorient Fonoran around the communication experiment; add constitution, experience tiers, compound alternates, understandability heuristic, expression candidates, playtests, Puzzle Conversation UI
- `b9a306f`: Cross-link archive docs and doc viewer to research notebook

**Documentation:** [`docs/fonoran-constitution.md`](../docs/fonoran-constitution.md)

**Interactive demo:** [Puzzle Conversation](/language#puzzle)

**Source:** [`tools/fonoran-experience-tiers.js`](../tools/fonoran-experience-tiers.js), [`tools/fonoran-understandability.js`](../tools/fonoran-understandability.js), [`tools/fonoran-expression-candidates.js`](../tools/fonoran-expression-candidates.js), [`tools/fonoran-playtests.js`](../tools/fonoran-playtests.js), [`data/fonoran-playtests.json`](../data/fonoran-playtests.json), [`data/fonoran-compounds.json`](../data/fonoran-compounds.json)

**Future research notes:** RN-13 (editorial pipeline), RN-14 (grammar particles), RN-15 (interpretive translator), RN-17 (puzzle conversation / stranger recovery)
