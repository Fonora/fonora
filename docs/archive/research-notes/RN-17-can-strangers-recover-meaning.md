---
status: Open
date: 2026-06-30
phase: phase-3
---

# Can strangers recover meaning?

## Research Question

[RN-16](/research/notes/typing-an-invented-script) closed the last prerequisite loop. Learners could read Fonora symbols, hear them, translate English into approved concepts, and type them back through a visual QWERTY IME with scored spelling and keyboard drills. The read-write cycle was no longer hypothetical.

That left the question the entire Phase III arc had been deferring since [RN-12](/research/notes/compiling-english-into-meaning):

**Does the whole system pass its own test? Can two root-knowers, with no shared native language, recover each other's intended meaning from compounds neither of them rehearsed?**

RN-12 reframed success as recoverable meaning and named puzzle conversation as the repair protocol. RN-13 through RN-16 operationalized the pipeline: editorial root approval, grammar particles, an interpretive translator, and script production. Each note answered *how* a piece of the language gets built. This note asks *whether any of it communicates*, not to a regression runner, not to an understandability heuristic, but to a human who only knows the shared roots.

## Hypothesis

The working hypothesis is that recoverable meaning is measurable through *play*. A structured **puzzle conversation**: one speaker expresses a meaning from roots, another speaker guesses it, repair turns expose the literal breakdown when the first attempt fails, reveals communicative success better than any automated score.

From that premise:

- **Heuristics rank; humans decide.** The understandability score estimates whether a root-knower would likely recover intent. It orders candidate compounds. It does not declare winners.
- **The 50-root challenge is the experimental unit.** Restricting challenges to compounds built entirely from the communicative core tests the constitution's central claim: *how much can two people communicate with only ~50 roots?*
- **Repair is part of the protocol, not a failure mode.** A miss followed by a literal root breakdown models conversational repair; the loop strangers would actually use.
- **Recorded rounds accumulate evidence.** Each guess feeds [`data/fonoran-playtests.json`](../data/fonoran-playtests.json) so preferred forms and alternates can eventually be chosen from real recovery data rather than designer intuition.

The hypothesis is not that every current compound communicates on first exposure. It is that a fast, repeatable play protocol can measure which ones do, and that those measurements should override heuristic rankings wherever they disagree.

## Approach

The puzzle-conversation machinery shipped in commit `5cfe28a` (Jun 30, 2026) as part of the communication-experiment pivot documented in RN-12. RN-17 treats that machinery as the live experiment surface now that the surrounding toolchain exists.

### Protocol

[`docs/fonoran-constitution.md`](../docs/fonoran-constitution.md) defines puzzle conversation abstractly: speakers try a combination, sometimes fail, then repair until meaning is recovered. [`tools/fonoran-playtests.js`](../tools/fonoran-playtests.js) and the Puzzle Conversation page at [`/language#puzzle`](/language#puzzle) operationalize a first playable version of that loop.

The implemented round works like this:

1. **Challenge.** `buildPuzzleChallenge()` picks a compound from the live lab: a two-or-more-part spelling with a known concept gloss, optionally filtered to compounds whose atomic roots all belong to the communicative core (`coreOnly` / the "50-root challenge" checkbox).
2. **Guess.** The UI shows the Fonoran spelling (roman plus Fonora script when rules are loaded) and asks: *A speaker who knows the roots said this. What did they mean?* The player picks from four English glosses: the correct answer plus three distractors drawn from other compounds.
3. **Repair turn.** On the first wrong choice, the player gets a repair turn: the literal root breakdown (`fen` + `dam` → *hot* + *body*) and any registered alternate forms for that concept. They guess again without the multiple-choice buttons being disabled, same four options, now informed by the breakdown.
4. **Record.** Whether recovered or not, the round is POSTed to `/api/fonoran/puzzle/guess` and appended to the playtests store with `concept_id`, `shown_spelling`, `shown_composition`, `recovered`, `repair_turns`, `guess`, `core_only`, and `source: 'puzzle'`.

The repair-turn limit is one (`repairTurns < 1` in [`language/fonoran-app.js`](../language/fonoran-app.js)): first miss → hint; second miss → reveal and record a non-recovery. That matches the constitution's emphasis on conversational repair without turning every round into an unlimited hint cascade.

### API and storage

[`tools/fonoran-api.js`](../tools/fonoran-api.js) exposes three endpoints: `GET /api/fonoran/puzzle/challenge` (optional `?core=1` and `?concept=`), `POST /api/fonoran/puzzle/guess`, and `GET /api/fonoran/playtests/summary`. [`tools/fonoran-store.js`](../tools/fonoran-store.js) maps the `playtests` doc to [`data/fonoran-playtests.json`](../data/fonoran-playtests.json), treated as optional seed data that can start empty in older snapshots.

Playtests are intentionally public, [`tools/fonoran-auth.js`](../tools/fonoran-auth.js) allows unauthenticated recording so anyone who knows the roots can contribute rounds without signing in.

### Relationship to ranking aids

The puzzle UI surfaces advisory context without letting it decide outcomes:

- Each challenge carries the compound's `understandability` score and `alternate_forms` from the lab.
- The dictionary alternates panel links to Puzzle Conversation with the note that playtests decide, not the percentage.
- [`tools/fonoran-expression-candidates.js`](../tools/fonoran-expression-candidates.js) still generates overlapping strategies (`river` → `water + path`, `flow + water`, …); puzzle rounds are where those strategies would eventually be validated or demoted.

### What this is not (yet)

The current implementation is a **guess-the-meaning quiz** against system-built compounds, not a symmetric two-player session where each participant invents an expression. English glosses appear in the multiple-choice answers; the player is a root-knower guessing an intended concept, not a monolingual stranger decoding Fonoran in isolation. Those simplifications were deliberate trade-offs for crisp scoring and a shippable first instrument; they are also reasons to treat early results as protocol validation, not as proof of cross-lingual communication.

## Evaluation

There has been no formal cross-linguistic user study, no controlled stranger pairs, and no playtest battery across the full compound inventory.

What exists is:

- **A recording pipeline** verified on the day the tool shipped.
- **Three pilot rounds** in [`data/fonoran-playtests.json`](../data/fonoran-playtests.json), all recorded on Jun 30, 2026 from the Puzzle Conversation UI (`source: "puzzle"`):
- `whole` (`taktes` = `tak` + `tes`): recovered on the first guess, `core_only: false`
- `fever` (`fendam` = `fen` + `dam`): recovered after one repair turn
- `answer` (`kuhu` = `ku` + `hu`): recovered after one repair turn, `core_only: true` (50-root challenge)
- **Session and aggregate counters** in the UI (`Recovered X / Y this session`; `All players: recovered/total rounds`) backed by `summarizePlaytests()`.

The informal questions the team was actually asking when the tool went live:

- **Does the loop run end-to-end?** Challenge → guess → optional repair → persist → summary.
- **Does the 50-root filter produce a playable pool?** At least one core-only round succeeded without empty-pool errors.
- **Do repair turns help?** Two of three pilots needed the literal breakdown; one did not.
- **Is the heuristic directionally sane?** No systematic comparison of understandability rank versus human recovery rate has been run. Alternate `status` fields in [`data/fonoran-compounds.json`](../data/fonoran-compounds.json) remain `"plausible"` / `"heuristic"`, playtests have not yet promoted or rejected them in bulk.

No automated score was treated as proof of understandability on day one, and none should be now.

## Findings

**The instrument works; the experiment does not yet have an answer.** Three recovered rounds confirm that challenges can be drawn from the lab, repair turns can fire, and rounds persist. They do not establish a recovery rate, do not cover unrehearsed invention, and do not test whether root-knowers who do not share English would perform similarly on English-gloss multiple choice.

**Repair turns matter in the pilot sample.** Two of three rounds required the literal root breakdown before the player chose correctly. That is consistent with the constitution's bet on conversational repair, but with *n = 3*, it is anecdote, not statistics.

**The 50-root filter is operable.** The `answer` round (`kuhu`) played under `core_only: true`, showing that `isCoreCompound()`, checking every atomic root against `language_tier === 'communicative_core'` via [`tools/fonoran-experience-tiers.js`](../tools/fonoran-experience-tiers.js), can restrict the challenge pool without exhausting it.

**Heuristic rankings remain unvalidated against human recovery.** Compounds like `birth` still prefer `source + life` (understandability 0.81) while the heuristic ranks `life + before` higher (0.94). Puzzle Conversation is the intended arbiter for cases like that; no playtest round has yet flipped a preferred form.

**Feedback into the dictionary is specified but not automated.** The constitution says playtests decide preferred forms; the playtests module records rounds and per-concept summaries but does not, in the current code, PATCH compound records when recovery rates cross a threshold. Human editors would need to act on summaries manually until that loop is built.

**The full toolchain is finally in place for real playtests.** Reading (script grid), hearing (TTS pipeline), compiling (translator), typing (keyboard IME), and guessing (puzzle conversation) all existed by Jun 30, 2026. What is missing is volume: rounds from diverse players, concepts across the inventory, failure cases, and eventually pairs inventing compounds rather than guessing pre-built ones.

## What Changed

RN-17 is the live end of the published research-note sequence. Nothing after it has shipped yet. What *has* changed is the project's definition of "done" for vocabulary work:

- **Success metric in production docs:** [`docs/fonoran-constitution.md`](../docs/fonoran-constitution.md), [`docs/fonoran-grammar.md`](../docs/fonoran-grammar.md), and [`docs/fonoran.md`](../docs/fonoran.md) all point at playtests as the human authority over [`tools/fonoran-understandability.js`](../tools/fonoran-understandability.js).
- **Compound data model:** Version `2.0-communicative` compounds carry preferred forms plus alternates explicitly marked "heuristic until playtested."
- **UI surfacing:** Dictionary alternates, experience-tier badges, communicative-core filters, and Puzzle Conversation cross-links keep the ranking aid / human verdict distinction visible.

Prior notes established the stack this experiment runs on:

- **RN-12: The campfire test (communication over correctness)**: constitution, tiers, and the puzzle-conversation *mandate*
- **RN-13: Concepts are canonical, sounds are editorial proposals**: human-gated root pipeline
- **RN-14: Grammar as particles, not words**: closed-class particles and translation coverage
- **RN-15: Compiling English into meaning**: interpretive translator
- **RN-16: Typing an invented script**: read-write loop for the Fonora script

RN-12 introduced the playtest surface; RN-17 is where that surface stops being a pilot attachment to a pivot commit and becomes the project's primary empirical obligation.

## Open Questions

This note is intentionally open. The questions below are the ones playtests are meant to answer; none have sufficient data yet.

- **Recovery rate at scale:** Across many rounds and players, what fraction of compounds are recovered on the first guess, after one repair turn, or not at all?
- **Heuristic calibration:** Does understandability score correlate with human recovery? Where they diverge, which should change; the heuristic weights or the preferred compound?
- **Preferred vs alternate promotion:** When playtests consistently recover an alternate better than the preferred form, what is the editorial workflow for swapping them?
- **The 50-root boundary:** Is the communicative core the right experimental unit, or should the tier list shrink or grow once failure patterns appear?
- **Symmetric invention:** Can the protocol be extended so both players build compounds, not just guess system-built ones, closer to the constitution's "two strangers invent expressions" scenario?
- **Cross-lingual validity:** Do players who share roots but not English recover meaning when glosses are removed or replaced with root-only prompts?
- **Tier growth from evidence:** Which roots and compounds fail repeatedly enough to justify expanding the core, and which failures indicate bad compositions rather than missing roots?

The stub that seeded this note named the branching direction explicitly: *what the playtests reveal about which roots and compounds communicate, and how the tiered core should grow in response.* Those threads do not yet have RN codes, they are the work ahead.

## References

**Related commits**
- `5cfe28a`: Reorient Fonoran around the communication experiment; add constitution, playtests store, Puzzle Conversation UI, understandability heuristic, compound alternates
- `0305077`: Replace Keyboard tab with visual QWERTY IME
- `6c4a7c8`: Add keyboard testing and spelling practice with improved compose UX
- `1ad6139`: Split Script into Learn and Tools with `/learn` and `/tools` routes
- `b9a306f`: Cross-link archive docs and doc viewer to research notebook

**Documentation:** [`docs/fonoran-constitution.md`](../docs/fonoran-constitution.md)

**Interactive demo:** [Puzzle Conversation](/language#puzzle)

**Source:** [`tools/fonoran-playtests.js`](../tools/fonoran-playtests.js), [`data/fonoran-playtests.json`](../data/fonoran-playtests.json), [`language/fonoran-app.js`](../language/fonoran-app.js), [`tools/fonoran-api.js`](../tools/fonoran-api.js)
- Prior research notes in sequence: RN-12 (constitution / campfire test), RN-13 (editorial pipeline), RN-14 (grammar particles), RN-15 (interpretive translator), RN-16 (typing and keyboard)

**Future research notes:** none published yet, RN-17 is the current frontier of the notebook
