# Synthetic intuition ranking (Compositional Intuition Battery v3)

## Research Question

[RN-17](/research/notes/puzzle-conversation) established human Puzzle Conversation as the constitutional test for recoverable meaning. [RN-19](/research/notes/phase-iv-first-learner-signal) showed early learner signal after Phase IV regen: dictionary clustering, translator compilation, and ~98% puzzle recovery at small scale, but only **61** of **111** concepts had any human playtest data, and each concept carries multiple seed candidates competing for preferred form.

Heuristic understandability ([`tools/fonoran-understandability.js`](../tools/fonoran-understandability.js)) ranks candidates by length, collision, and experience tiers. It does not simulate root-knower listening. v2 LLM playtests copied the Puzzle MC UI and failed: a shared answer key let every candidate pass after repair.

The question this note addresses:

**Can synthetic root-knower intuition, without multiple choice or answer-key leakage, rank competing seed compositions well enough to guide preferred-form selection, while keeping humans as final authority?**

This is not LLM *inventing* words. It is LLM *evaluating* pre-seeded meaning-attempts with the constitutional question: *If someone only knew the roots, would this expression probably help them recover the intended meaning?*

## Hypothesis

1. **Task B (composition naturalness)** assigns meaningfully different scores to seed candidates for the same concept, avoiding v2's MC failure mode.
2. **Conservative promotion**: auto-change preferred forms only when `intuition_weight` shows clear margin; most concepts remain split for human review.
3. **Human correlation**: LLM rankings on calibration concepts align with author intuition on promoted forms; mismatches flag concepts for Puzzle Conversation first.

The hypothesis is not that LLM playtests replace humans. It is that they can pre-filter 111 concepts × ~3 candidates each at a scale no human session can match alone.

## Approach

### Instrument: Compositional Intuition Battery (cib-v3)

Three tasks, no multiple choice (Tasks A and B used for full inventory; Task C optional for tie-breaks):

| Task | Stimulus | Measures |
| --- | --- | --- |
| **A: Cold hearing** | Primitive root glossary + Fonoran spelling only | Inferred meaning, confidence |
| **B: Composition judgment** | Roots + composition breakdown | Naturalness, vagueness, composition recovery |
| **C: Pairwise** (optional) | Two candidates side-by-side | Preference, reasoning |

**Weight formula:** `0.35×cold + 0.40×naturalness + 0.25×pairwise − 0.15×vagueness`

Four synthetic personas · prompt version **3** · battery **`cib-v3`**. Full protocol: [`docs/fonoran-llm-playtest-experiment.md`](../fonoran-llm-playtest-experiment.md).

### Implementation

| Component | Path |
| --- | --- |
| Batch runner | [`scripts/fonoran-llm-intuition.js`](../scripts/fonoran-llm-intuition.js) |
| Task prompts + personas | [`tools/fonoran-llm-intuition.js`](../tools/fonoran-llm-intuition.js) |
| Aggregation + consensus | [`tools/fonoran-llm-aggregate.js`](../tools/fonoran-llm-aggregate.js) |
| Anthropic client | [`tools/fonoran-llm-client.js`](../tools/fonoran-llm-client.js) |
| Storage | [`data/fonoran-llm-evaluations.json`](../data/fonoran-llm-evaluations.json) |
| Promotion | [`scripts/fonoran-optimize-compounds.js`](../scripts/fonoran-optimize-compounds.js) `--use-llm` |
| Preferred selection | [`tools/fonoran-preferred-select.js`](../tools/fonoran-preferred-select.js) |

Requires `ANTHROPIC_API_KEY` in `.env` (documented in [`.env.example`](../.env.example)). Resume keys skip completed `(concept, composition, persona, task)` tuples.

### Run sequence (Jul 2026)

```bash
npm run fonoran:llm-intuition -- --pilot          # tool, weapon, tribe
npm run fonoran:llm-intuition -- --calibration --resume
npm run fonoran:llm-intuition -- --resume        # full 111 concepts, Tasks A+B
npm run fonoran:optimize-compounds -- --use-llm
npm run fonoran:build:approved
npm run fonoran:compound-audit
```

## Evaluation

### Scale

| Stage | API calls | Est. cost | Gate |
| --- | --- | --- | --- |
| Pilot | 80 | ~$0.32 | Task B discriminates, pass |
| Calibration (10 concepts) | 232 | ~$0.94 | Task B spread ≥7/10, **pass (7/10)** |
| Full inventory | 2,168 | ~$8.78 | Complete |
| Resume (failures) | 5 | ~$0.02 | 0 failed |
| **Total stored** | **2,432** | **~$10** | |

### Full inventory metrics

- **111/111** concepts with v3 weights
- **88/111** (79%) show Task B naturalness spread ≥0.10 between candidates
- **37–38/111** (~34%) reach clear consensus (promotion-eligible margin)
- **22/111** (19.8%) auto-promoted by `optimize-compounds --use-llm`, at the <20% conservative target
- **111/111** build after optimize, **0** dropped; one flattened-length warning on `world` (5 roots)

### Calibration detail (10 concepts)

Task B spread passed on **7/10**: `community`, `exchange`, `knowledge`, `memory`, `tool`, `teacher`, `war`. Failed spread on `language`, `tribe`, `weapon`. Only **`community`** and **`knowledge`** reached clear consensus at calibration scale.

Pilot directional checks matched intuition: on `tool`, `useful + thing` beat `hand + thing` on naturalness; `weapon` and `tribe` remained near-ties.

### Instrument limits observed

- **Task A cold recovery** saturated (~100% on some concepts) because synonym matching is too loose, do not rely on cold alone for promotion until scoring tightens.
- **No Task C** on full inventory: disputed concepts (`tool`, `tribe`) remain split.
- **Synthetic personas ≠ humans**: Session 4 in [`docs/fonoran-learning-sessions-log.md`](../fonoran-learning-sessions-log.md) is the correlation gate.

Per-concept reports: `node tools/fonoran-llm-aggregate.js --report <concept>`

## Findings

**v3 works for its intended job: rank seed candidates, promote conservatively.** Task B composition naturalness does what v2 MC failed to do, separate constructions for the same concept without a giveaway answer key. 88/111 concepts show measurable spread; auto-promote stayed at 20%.

**Strongest synthetic signals** clustered on transparent body/social compounds: `people` (many + person, 0.84), `child` (small + person, 0.82), `community` (collective + person, 0.77), `river` (water + flow + path, 0.78). Weakest: `morning`, `forget`, `container`, `cloud`, `vehicle`, `identity`, `meaning`, `book`, all below 0.27 weight; these need seed or teaching-tree work, not a preferred-form swap alone.

**22 promotions are hypotheses, not canon.** Examples: `community` (bond+collective → collective+person), `river` (flow+water → water+flow+path), `birth` (life+before → source+life), `island` (earth+water → earth+inside+water). One promotion (`meal`) fixed an invalid current form rather than LLM consensus. `world` (whole+place+earth+life) triggers a 5-root flatten warning, monitor in human play.

**73 concepts remain split**: explicit human review queue. Audit reports **73** `llm_split`-class findings alongside **37** consensus candidates.

**Three authority tiers now operate in parallel:** heuristic understandability (fast rank), synthetic intuition (volume rank), human Puzzle Conversation (constitutional authority). [`docs/fonoran.md`](../fonoran.md) documents the preferred-form tier order: `human` / `playtest` → `llm_consensus` → `heuristic`.

## What Changed

- **New tooling:** v3 intuition battery, LLM aggregate, optimize-with-LLM pipeline, composition resolver, preferred-select module.
- **Data:** [`data/fonoran-llm-evaluations.json`](../data/fonoran-llm-evaluations.json) (2,432 rounds); 22 compounds with `preferred_source: llm_consensus` in [`data/fonoran-compounds.json`](../data/fonoran-compounds.json).
- **Lab:** Rebuilt via `build:approved`; puzzle supports `#puzzle?concept=<id>` for targeted human validation.
- **Docs:** [`docs/fonoran-llm-playtest-experiment.md`](../fonoran-llm-playtest-experiment.md) (protocol + results), [`docs/research-notes-authoring.md`](../research-notes-authoring.md) (RN expansion workflow).
- **Legacy:** v2 runner (`npm run fonoran:llm-playtest`) retained for comparison only; do not use for promotion.

Human Puzzle Conversation ([RN-19](/research/notes/phase-iv-first-learner-signal)) remains the gate for whether promoted spellings actually teach.

## Open Questions

- Do human recovery rates on the 22 promotions beat their demoted alternates?
- Where LLM and author disagree (e.g. `tool`, LLM ranks `thing + hand + useful` above `useful + thing`), which wins in live play?
- Should Task A cold scoring tighten, or should cold weight drop in `intuition_weight`?
- Does Task C pairwise on `tool`, `tribe`, `weapon` break ties worth breaking?
- When does a human playtest lock override `llm_consensus`?
- Can Spearman correlation on the 10 calibration concepts reach ≥0.6 vs author ordering?

## References

**Documentation:** [`docs/fonoran-llm-playtest-experiment.md`](../fonoran-llm-playtest-experiment.md), [`docs/fonoran-compound-audit-latest.md`](../fonoran-compound-audit-latest.md), [`docs/fonoran-learning-sessions-log.md`](../fonoran-learning-sessions-log.md), [`docs/research-notes-authoring.md`](../research-notes-authoring.md)

**Interactive demo:** [Puzzle Conversation](/language#puzzle), [Dictionary](/language#dictionary), [Translator](/language#translator)

**Source:** [`data/fonoran-llm-evaluations.json`](../data/fonoran-llm-evaluations.json), [`data/fonoran-compounds.json`](../data/fonoran-compounds.json), [`scripts/fonoran-llm-intuition.js`](../scripts/fonoran-llm-intuition.js), [`tools/fonoran-llm-aggregate.js`](../tools/fonoran-llm-aggregate.js)

**Prior notes:** [RN-19 · First learner signal](/research/notes/phase-iv-first-learner-signal), [RN-17 · Puzzle conversation](/research/notes/puzzle-conversation), [RN-18 · Compound reconstruction](/research/notes/compound-reconstruction)
