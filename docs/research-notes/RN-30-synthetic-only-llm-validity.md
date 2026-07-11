---
status: Active
date: 2026-07-09
phase: phase-5
---

# Synthetic-only LLM validity strategy

## Research Question

[RN-20](/research/notes/synthetic-intuition-ranking) established the Compositional Intuition Battery (CIB) as a scalable pre-filter for compound ranking, with human Puzzle Conversation as constitutional authority. In practice, **human playtest volume is too sparse** to calibrate or gate vocabulary growth — the project must rely on LLM synthetic evaluation while still optimizing for **human** intuitiveness: easy sounds, hearable root boundaries, and campfire recoverability.

The question this note answers:

**Without human calibration data, can we restructure the LLM pipelines so synthetic scores are a trustworthy proxy for cross-cultural spoken intuitiveness?**

## Hypothesis

A synthetic-only validity stack can work if we:

1. **Separate propose from judge** — different model families so no model scores its own vocabulary.
2. **Grade meaning blindly** — a dedicated judge call compares inferred vs target meaning under a strict rubric, replacing the English substring matcher that saturated Task A cold recovery.
3. **Simulate language diversity** — L1-prompted personas (es/zh/ar/hi/sw) with translated root glossaries, not English stance variants on one model.
4. **Require inter-model agreement** — Spearman rank correlation between two judge models on the same candidates; high agreement → promotion-eligible, disagreement → split queue.
5. **Measure spoken distinctness deterministically** — phoneme-feature confusability and boundary-quality scoring, not LLM guesses from romanized spellings.

## Approach

### Model roles (`tools/fonoran-llm-client.js`)

| Role | Default model | Pipelines |
| --- | --- | --- |
| **Proposer** | `claude-sonnet-4-6` | gap analyzer, vocab survey, llm-candidates |
| **Judge** | `claude-fable-5` (medium effort) | intuition battery, blind grader, proposal gate Task A |

Override via `ANTHROPIC_MODEL_PROPOSER`, `ANTHROPIC_MODEL_JUDGE`, `ANTHROPIC_JUDGE_EFFORT`.

### Compositional Intuition Battery v4 (`cib-v4`)

- **Battery:** `cib-v4` · **Prompt version:** `5`
- **Personas:** `es_native`, `zh_native`, `ar_native`, `hi_native`, `sw_native` — fully prompted in L1; glosses cached in `data/fonoran-persona-glossaries.json` via `tools/fonoran-persona-glossaries.js`.
- **Blind grader:** `gradeMeaningMatch()` — judge sees only inferred meaning + target gloss; returns `match` / `partial` / `no_match` (partial = 0.5 score).
- **Weights:** cold 0.30, naturalness 0.40, pairwise 0.25 (only when Task C ran); pairwise term omitted when no Task C data (no constant 0.5 injection).
- **Task C:** selective — only for concepts where top-two weights sit inside the consensus margin.

```bash
npm run fonoran:llm-intuition -- --pilot
npm run fonoran:llm-intuition -- --calibration --resume
npm run fonoran:llm-reliability -- --run --calibration
```

### Inter-model reliability gate (`scripts/fonoran-llm-reliability.js`)

Compares rankings from primary judge (`ANTHROPIC_MODEL_JUDGE`) and secondary (`ANTHROPIC_MODEL_RELIABILITY`, default `claude-sonnet-4-6`):

- Per-concept Spearman ρ on `intuition_weight` ranks
- Winner agreement between `pickConsensus()` on each model
- **Promotion-eligible** when ρ ≥ `LLM_RELIABILITY_MIN_SPEARMAN` (default 0.6) and winners agree
- Report: `data/fonoran-llm-reliability.json`

This replaces the human Spearman calibration gate from RN-20 when no human panel exists.

### Phonetic steering at generation

Gap analyzer and vocab survey prompts now include root spellings and `phoneticPromptBrief()` from `tools/fonoran-phonetic-weights.js` — onset tiers, boundary rule, 2-root preference, distinct-sound guidance.

### Spoken confusability (`tools/fonoran-compound-confusability.js`)

Deterministic audit:

- Phoneme-feature edit distance between compound surfaces (not orthographic Levenshtein)
- Boundary-quality score: penalizes vowel–vowel joins and same-place consonant pairs (m/n, t/d); rewards CVC·CV rhythm
- Wired into proposal gate (`confusabilityPenalty` → phonetic score), preferred-form tie-breaking, and `fonoran:compound-audit`

```bash
npm run fonoran:compound-confusability
```

### Double-consonant boundary rule

**Stays hard.** Identical consonant at a morpheme join is rejected (`checkCompoundBoundary`). This protects hear = write = look up and unique segmentation; blocked joins mean a different root ordering, not a lost word.

## Evaluation

| Instrument | What it measures | Authority |
| --- | --- | --- |
| Blind grader | Semantic recovery strictness | Judge model, per Task A/B round |
| Inter-model ρ | Ranking stability across judge families | Reliability script |
| Confusability audit | Spoken near-pairs + boundary quality | Deterministic |
| Human playtest | Constitutional authority when data exists | Overrides all synthetic signals |

**Pilot first:** `--pilot` (3 concepts) and `--calibration` (10 concepts) before full 111-concept dual-model re-run — cost exceeds the prior ~$10 Sonnet v3 run.

## Findings

The v3 pipeline's main validity failures were methodological, not architectural:

- **Self-agreement:** one model proposed, gated, and ranked its own compounds.
- **Cold saturation:** loose English synonym matching inflated Task A recovery; it was overweighted at 0.45.
- **English-only personas:** "cross_lingual" was one line in an English prompt and excluded from recovery metrics.
- **No spoken distinctness:** `hard_pronounce` was the model guessing from spelling; no pairwise confusability check existed.

v4 addresses each with propose/judge separation, blind grading, L1 personas, inter-model reliability, and deterministic confusability — the best available proxy stack when human data is unavailable.

## What Changed

| File | Change |
| --- | --- |
| `tools/fonoran-llm-client.js` | Role-based models; Fable adaptive thinking + effort |
| `tools/fonoran-llm-intuition.js` | cib-v4 personas, blind grader, judge role |
| `tools/fonoran-llm-aggregate.js` | v4 weights, grade_score aggregation, pairwise omit |
| `tools/fonoran-persona-glossaries.js` | L1 glossary translation cache |
| `scripts/fonoran-llm-intuition.js` | Glossary warming, selective Task C, judge model logging |
| `scripts/fonoran-llm-reliability.js` | Inter-model Spearman gate |
| `tools/fonoran-compound-confusability.js` | Phoneme-feature distance + boundary quality |
| `scripts/fonoran-compound-confusability.js` | CLI audit |
| `tools/fonoran-gap-analyzer.js` | Phonetic brief + spellings in prompts |
| `tools/fonoran-vocab-survey.js` | Full existing list + phonetic brief |
| `tools/fonoran-proposal-gate.js` | Confusability penalty in phonetic score |
| `tools/fonoran-preferred-select.js` | Boundary-quality tie-break |
| `tools/fonoran-compound-audit.js` | Near-pair + boundary findings |
| `package.json` | `fonoran:llm-reliability`, `fonoran:compound-confusability` |

## Open Questions

- Does dual-model ρ on calibration concepts correlate with author intuition on promoted forms (manual spot-check until human panel exists)?
- Cost/latency of Fable judge + blind grader on full inventory — is selective Task C enough to break ties?
- Should reliability gate block `optimize-compounds --use-llm` automatically when ρ < threshold?
- Cache invalidation for persona glossaries when primitive glosses change.

## References

- [RN-20 · Synthetic intuition ranking](/research/notes/synthetic-intuition-ranking)
- [RN-26 · LLM-assisted word generation](/research/notes/llm-assisted-word-generation)
- [RN-27 · Automated refine loop](/research/notes/automated-refine-loop)
- [docs/fonoran-llm-playtest-experiment.md](../fonoran-llm-playtest-experiment.md)
- `tools/fonoran-llm-client.js`, `scripts/fonoran-llm-reliability.js`, `tools/fonoran-compound-confusability.js`
