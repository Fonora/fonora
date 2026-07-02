# Reconstructing compounds under the constitution

## Research Question

[RN-17](/research/notes/puzzle-conversation) established the measurement instrument: puzzle conversation records whether root-knowers recover intended meaning from compounds, and playtests should eventually override heuristic rankings. Phase III closed the prerequisites: constitution, editorial roots, grammar particles, the interpretive translator, script literacy, and a frontend that presents the project as open language research.

That leaves the vocabulary work the constitution actually describes:

**How do we rebuild the compound inventory as teaching trees and meaning-attempts, not flat algorithmic outputs, so strangers can invent and recover expressions from a small shared root set?**

RN-10 through RN-13 already rejected one-answer compound generation. The converged model in [`data/fonoran-compounds.json`](../data/fonoran-compounds.json) (v2.0-communicative) stores a preferred form plus ranked alternates per concept. Most alternates remain `source: "heuristic"` until playtests promote them. Phase IV is where that model gets rebuilt concept by concept under the new identity, tooling, and communication experiment.

## Hypothesis

The working hypothesis for Phase IV:

- **Compounds are communicative strategies**, not canonical decompositions. Multiple root combinations for one concept can coexist if a root-knower would likely recover the intent.
- **Teaching trees beat flat strings.** Compounds should prefer paths through already-approved roots and intermediate compounds (`war` → `tribe` + `conflict`, not opaque concatenations).
- **Seeds propose; playtests decide.** [`tools/fonoran-expression-candidates.js`](../tools/fonoran-expression-candidates.js) and `ASSOCIATION_SEEDS` generate overlapping strategies; [`tools/fonoran-playtests.js`](../tools/fonoran-playtests.js) and Puzzle Conversation are the authority for preferred forms.
- **Understandability ranks; it does not certify.** The heuristic in [`tools/fonoran-understandability.js`](../tools/fonoran-understandability.js) orders candidates for review. It must not silently mint vocabulary.

## Approach

Phase IV work picks up from the compound stack frozen at RN-17:

| Layer | Path | Role |
| --- | --- | --- |
| Candidate generator | [`tools/fonoran-expression-candidates.js`](../tools/fonoran-expression-candidates.js) | Multi-strategy compositions from `ASSOCIATION_SEEDS` |
| Ranking aid | [`tools/fonoran-understandability.js`](../tools/fonoran-understandability.js) | Advisory scores for alternates |
| Curated inventory | [`data/fonoran-compounds.json`](../data/fonoran-compounds.json) | Preferred + alternates (82 concepts at Phase IV entry) |
| Migration | [`scripts/fonoran-migrate-compounds.js`](../scripts/fonoran-migrate-compounds.js) | Refresh alternates without losing human-chosen preferred forms |
| Build | [`tools/fonoran-build.js`](../tools/fonoran-build.js) | Resolve curated compounds into the live lab bucket |
| Evidence | [`data/fonoran-playtests.json`](../data/fonoran-playtests.json) | Human recovery data from Puzzle Conversation |

### Planned workflow

1. **Audit** each concept in the compound inventory against the constitution: is the preferred form a plausible meaning-attempt? Are alternates diverse enough to test?
2. **Expand seeds** in `ASSOCIATION_SEEDS` for concepts that lack communicative variety.
3. **Re-run migration** to refresh heuristic alternates and scores (`node scripts/fonoran-migrate-compounds.js`).
4. **Playtest** promoted candidates through Puzzle Conversation; record recovery rates.
5. **Promote** preferred forms when playtest evidence consistently favors an alternate.
6. **Rebuild lab** with `npm run fonoran:build` after editorial approval.

### What Phase IV is not

- **Not phonetic assignment at scale.** Semantic foundation Phase 3 (rank primitives, assign shortest syllables) remains deferred per RN-11.
- **Not a return to bulk generators.** Legacy Huffman and Gen 3 pipelines live under `tools/legacy/` as archive reference only.
- **Not automated dictionary mutation from playtests yet.** The feedback loop from playtests to preferred forms is specified in the constitution but still manual in the builder.

## Evaluation

Phase IV has just begun. Success criteria:

- Compound inventory grows with **transparent teaching trees** documented in glosses and notes.
- **Playtest coverage** increases across the inventory; preferred forms change when evidence demands it.
- **Puzzle recovery rates** improve for core-tier compounds without expanding the root set prematurely.
- **Heuristic vs human divergence** is measured and documented (where understandability rank disagrees with recovery).

## Open Questions

- Which concepts in the current 82-compound set fail the campfire test first?
- How deep should compound trees go before learners lose recoverability?
- When should an alternate become preferred automatically vs through editor review?
- Which missing concepts block compound reconstruction (inventory gaps vs composition gaps)?

## References

**Documentation:** [`docs/fonoran-constitution.md`](../docs/fonoran-constitution.md), [`docs/fonoran-semantic-foundation.md`](../docs/fonoran-semantic-foundation.md) (Phase 4 semantic hierarchy)

**Interactive demo:** [Language lab](/language#dictionary), [Puzzle Conversation](/language#puzzle)

**Source:** [`tools/fonoran-expression-candidates.js`](../tools/fonoran-expression-candidates.js), [`data/fonoran-compounds.json`](../data/fonoran-compounds.json), [`scripts/fonoran-migrate-compounds.js`](../scripts/fonoran-migrate-compounds.js)

**Prior note:** [RN-17 · Can strangers recover meaning?](/research/notes/puzzle-conversation)
