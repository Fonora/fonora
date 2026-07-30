---
status: Active
date: 2026-07-04
phase: phase-5
---

# Automated refinement loop (pre-community experiment)

> **Builds on [RN-26 · LLM-assisted word generation](/research/notes/llm-assisted-word-generation).** This note documents the **corpus-driven experiment** (`fonoran:refine`) that auto-accepts proposals through phonetic and campfire gates. It reuses RN-26 modules (`fonoran-gap-analyzer.js`, `fonoran-compound-proposals.js`, `promoteAcceptedProposals`). The default editorial path remains vocab survey → Proposal Review → `fonoran:regenerate`; use refine when optimizing stranger-corpus coverage in bulk before community review.

## Research Question

Can we close an automated **gap → propose → gate → accept → build → measure** loop on the 1,000-phrase stranger corpus to grow Fonoran vocabulary *before* human playtests and community review—while enforcing cross-linguistic phonetic ease and campfire recoverability?

## Hypothesis

Frequency-ranked gaps from [`external/fonora-data/data/fonoran-stranger-corpus.json`](../../external/fonora-data/data/fonoran-stranger-corpus.json), LLM gap classification tuned for **stranger recovery** (not semantic taxonomy), and a multi-gate auto-accept policy will raise phrase coverage from ~74% toward ≥85% without introducing excluded phonemes (`th`, `z`, `v`, …) or double-consonant boundary violations.

## Approach

### Pipeline

```bash
npm run fonoran:refine
npm run fonoran:refine -- --dry-run --top-gaps 10
npm run fonoran:refine -- --skip-llm --max-iterations 1
```

1. Run stranger corpus through translator → gap report
2. [`tools/fonoran-phonetic-analytics.js`](../../tools/fonoran-phonetic-analytics.js) — onset/vowel/rhyme-family shares
3. Top-N gaps → [`tools/fonoran-gap-analyzer.js`](../../tools/fonoran-gap-analyzer.js) (campfire prompt)
4. [`tools/fonoran-proposal-gate.js`](../../tools/fonoran-proposal-gate.js) — hard + weighted gates
5. Auto-accept → [`data/fonoran-compound-proposals.json`](../../data/fonoran-compound-proposals.json) → promote → `fonoran:build`
6. Re-measure; append [`external/fonora-data/data/fonoran-refine-iterations.json`](../../external/fonora-data/data/fonoran-refine-iterations.json)

### Phonetic weights ([`tools/fonoran-phonetic-weights.js`](../../tools/fonoran-phonetic-weights.js))

Research-backed tiers — **weight, never ban** (for pool sounds):

| Tier | Onsets | Weight |
|------|--------|--------|
| Very safe | m, n, p, b, t, d, k, g, s, h, w, y | 0.95–1.00 |
| Fairly safe | f, l, ch, sh | 0.78–0.88 |
| Difficult | r, j (Fonoran /dʒ/) | 0.45–0.55 |
| Excluded | th, z, v, zh, … | block new primitives |

Rhyme-family saturation targets: stop+a ≤25%, stop+e ≤15%, glide+h ≤10%.

### Auto-accept gates

| Gate | Threshold |
|------|-----------|
| Compound boundary | hard pass (`checkCompoundBoundary`) |
| Parseability | unique segmentation via `validateComposition` |
| Phonetic score | ≥ 0.70 |
| Understandability | ≥ 0.65 |
| Anti-abstract | ≥1 communicative_core / survival_body component |
| LLM Task A (campfire_stranger) | recovered OR confidence ≥ 0.55 |

Primitives deferred; aliases accepted when target exists.

## Evaluation

### Baseline (before first refine run)

| Metric | Value |
|--------|-------|
| Stranger phrases | 1,000 |
| Coverage | 74% (737/1000 clean) |
| Distinct honest gaps | 117 |
| Top gap | please (43×) |

### First refine run (3 iterations, `--skip-llm`)

| Iteration | Auto-accepted | Rejected | Promoted to compounds | Coverage after |
|-----------|---------------|----------|----------------------|----------------|
| 1 | 24 | 6 | 14 | 74% (unchanged) |
| 2 | 22 | 8 | 1 | 74% |
| 3 | 23 | 7 | 0 | 74% |

**Root cause of zero coverage gain:** accepted compounds were written to `data/fonoran-compounds.json` on disk while `buildFonoran()` read the Postgres editorial store (`FONORAN_STORAGE=postgres`). Aliases were accepted in the proposal log but never written to `localizations/en.json`.

**Bugs fixed during experiment:**

1. `scoreComposition()` referenced undefined `v` → phonetic scores always 0.00 (fixed in `fonoran-proposal-gate.js`).
2. `promoteAcceptedProposals()` bypassed the editorial store API (now uses `readDoc` / `writeDoc`).
3. Added `promoteAcceptedAliases()` to wire accepted alias proposals into English localization.
4. Switched local dev to **`FONORAN_STORAGE=json`** in `.env` so promote → build → gap report share one source of truth.

### Post-fix measurement (promote + build + re-measure)

| Metric | Before | After |
|--------|--------|-------|
| Phrase coverage | 74% (737/1000) | **87% (866/1000)** |
| Distinct honest gaps | 117 | **94** |
| Lab compounds | 440 | **452** |
| Gap baseline | updated | `data/fonoran-translation-gap-baseline.json` (94 words) |

**Promotion summary:** 324 compound proposals already present in `fonoran-compounds.json`; **11 new English aliases** promoted to localization (e.g. `mean` → `meaning`, `little` → `small`, `a lot` → `many`). Top-frequency compounds from the refine loop (`please`, `try`, `show`, `worried`, `slowly`, …) now resolve in the stranger corpus.

**Stop condition:** coverage ≥ 85% met; refine loop dry-run confirms stop on `coverage` at 87%.

### Phonetic analytics (post-fix, iteration 4 snapshot)

| Metric | Value | Target / note |
|--------|-------|---------------|
| Very-safe onset share | **94.1%** | ≥ ~80% ✓ |
| Fairly-safe share | 5.0% | moderate ✓ |
| Difficult (`r`, `j`) share | **0.5%** | ≤ ~5% ✓ |
| Avg phonetic score | **0.80** | ≥ 0.70 gate ✓ |
| Rhyme family stop+a | 9.0% | ≤ 25% ✓ |
| Rhyme family stop+e | 11.6% | ≤ 15% ✓ |
| Excluded onsets in analytics | th(7), v(1) in *existing* lexicon tokens | no new excluded roots introduced |

### Remaining gaps (top frequency)

`relieved` (8×), `maybe` (6×), `closer` (5×), `breathe` (5×), `tonight` (4×), `mother` (4×) — mostly hard-gate failures (family kinship, time compounds) or phonetic score just under 0.70.

## Findings

**Hypothesis supported:** the automated loop can close high-frequency stranger gaps with research-weighted phonetic gates and campfire-oriented LLM proposals. The critical integration requirement is **store consistency** (JSON mode for local refine experiments, or promote/build must share the same editorial backend).

LLM Task A gate was not exercised in the validating run (`--skip-llm`); full gates should be run before community promotion to confirm campfire recoverability holds under LLM review.

Machine-readable snapshots: [`external/fonora-data/data/fonoran-refine-iterations.json`](../../external/fonora-data/data/fonoran-refine-iterations.json) and [`external/fonora-data/data/fonoran-phonetic-analytics.json`](../../external/fonora-data/data/fonoran-phonetic-analytics.json).

## Addendum — Lexicon hygiene (lemma + agentive collapse)

Follow-up pass after manual review of auto-accepted compounds.

### Problems fixed

| Issue | Before | After |
|-------|--------|-------|
| Inflection as concept id | `laughed` → `nesgubase` | `laugh` → `nesgubase`; `laughed`/`laughing`/`laughs` are English aliases only |
| Agentive duplication | `mentor` = person+know+give (`bahuku`) separate from `teacher` = give+know+person (`kuhuba`) | `mentor` removed as compound; aliases to `teacher` (`kuhuba`) |
| Gloss alias leak | `apprentice` gloss mentioned "mentor", shadowing teacher alias | Gloss shortened; `mentor` resolves to `teacher` |

### Guardrails added

- [`tools/fonoran-lexicon-hygiene.js`](../../tools/fonoran-lexicon-hygiene.js) — inflection detection, agentive multiset duplicate check
- [`tools/fonoran-proposal-gate.js`](../../tools/fonoran-proposal-gate.js) — rejects inflected concept ids and agentive duplicates before auto-accept
- [`tools/fonoran-gap-analyzer.js`](../../tools/fonoran-gap-analyzer.js) — prompt rules for lemma invariants and agentive alias preference
- [`scripts/fonoran-lexicon-audit.js`](../../scripts/fonoran-lexicon-audit.js) — reports inflected concept ids, agentive duplicate groups, missing aliases

### Post-hygiene metrics

| Metric | Value |
|--------|-------|
| Coverage | 88% (882/1000) |
| Distinct gaps | 85 |
| Lab compounds | 455 built |
| Agentive duplicate groups | 0 (after mentor removal) |

Run audit: `node scripts/fonoran-lexicon-audit.js`

Apply rules to the full lexicon:

```bash
npm run fonoran:lexicon:hygiene              # preview (dry run)
npm run fonoran:lexicon:hygiene -- --apply --rebuild   # apply + sync lab
```

## What Changed

| File | Change |
|------|--------|
| `tools/fonoran-proposal-gate.js` | Fixed undefined `v` in `scoreComposition()`; added inflected concept id and agentive duplicate rejection |
| `tools/fonoran-gap-analyzer.js` | Campfire-oriented LLM prompt; lemma invariant and agentive alias prompt rules |
| `tools/fonoran-phonetic-analytics.js` | Onset/vowel/rhyme-family share analytics |
| `tools/fonoran-phonetic-weights.js` | Research-backed phonetic tier weights |
| `tools/fonoran-lexicon-hygiene.js` | New: inflection detection, agentive multiset duplicate check |
| `scripts/fonoran-lexicon-audit.js` | New: inflected concept id, agentive duplicate group, and missing alias reports |
| `data/fonoran-compound-proposals.json` | Accepted proposals from refine runs |
| `data/fonoran-translation-gap-baseline.json` | Updated to 94 gaps (post-fix), then 85 (post-hygiene) |
| `data/localizations/en.json` | 11 new English aliases promoted (`mean`, `little`, `a lot`, …) |
| `external/fonora-data/data/fonoran-refine-iterations.json` | Machine-readable iteration snapshots |
| `external/fonora-data/data/fonoran-phonetic-analytics.json` | Machine-readable phonetic analytics |
| `.env` | Switched to `FONORAN_STORAGE=json` for local refine experiments |

## Open Questions

- LLM Task A (`campfire_stranger`) gate was skipped in the validating run (`--skip-llm`). Full gates must be exercised before community promotion to confirm campfire recoverability holds under LLM review.
- Remaining top gaps (`relieved`, `maybe`, `breathe`, `tonight`, `mother`) require new primitives or deliberate compositions — each should pass the campfire test before acceptance.
- Should the refine loop run on a schedule (e.g. after each community playtest cycle) or only manually triggered?
- Auto-accepted proposals feed `compounds.json` directly; human playtests remain the constitutional authority for preferred-form promotion in production. Revert via git if an iteration regresses coverage or phonetic distribution.

## References

- [RN-25 · Concept-first translation and honest gaps](/research/notes/concept-first-translation-and-honest-gaps)
- [RN-26 · LLM-assisted word generation](/research/notes/llm-assisted-word-generation)
- [`tools/fonoran-gap-analyzer.js`](../../tools/fonoran-gap-analyzer.js)
- [`tools/fonoran-proposal-gate.js`](../../tools/fonoran-proposal-gate.js)
- [`tools/fonoran-phonetic-analytics.js`](../../tools/fonoran-phonetic-analytics.js)
- [`tools/fonoran-lexicon-hygiene.js`](../../tools/fonoran-lexicon-hygiene.js)
- [`scripts/fonoran-lexicon-audit.js`](../../scripts/fonoran-lexicon-audit.js)
- [`external/fonora-data/data/fonoran-refine-iterations.json`](../../external/fonora-data/data/fonoran-refine-iterations.json)
- [`external/fonora-data/data/fonoran-phonetic-analytics.json`](../../external/fonora-data/data/fonoran-phonetic-analytics.json)
