# Remediating the beginner core

## Research Question

[RN-19](/research/notes/first-learner-signal-from-phase-iv-regen) showed that the Phase IV inventory teaches at small scale: dictionary clustering, translator compilation, and ~98% puzzle recovery on recorded rounds. [RN-20](/research/notes/synthetic-intuition-ranking) added a third ranking layer, synthetic intuition, to pre-filter preferred forms across 111 compounds.

Neither note asked whether the **50-root communicative core** itself was the right scaffold for a first-week stranger conversation. The constitution ([RN-12](/research/notes/the-campfire-test-communication-over-correctness)) gates roots by recoverable meaning in week one, but the existing core was emotionally rich (`love`, `happy`, `trust`, `hope`) while thin on reference, location, repair, and basic needs (`thing`, `addressee`, `here`/`there`, `food`, `understand`, `need`).

Simulated beginner dialogues against the pre-remediation inventory surfaced a pattern: learners could express feeling states early but struggled to point, request, repair misunderstanding, or name food and sickness, the verbs of survival dialogue.

The question this note addresses:

**Can we rebalance the 50-root communicative core toward practical scaffolding without breaking the build pipeline, compound inventory, or synthetic evaluation instruments — and can we keep the growing research datasets out of the main codebase?**

## Hypothesis

1. **Core swaps, not expansion:** Promoting ~10 practical primitives into communicative core and demoting nuanced emotions and landscape nouns to extended tier improves beginner coverage without exceeding the 50-root experiment budget.
2. **Retired abstractions become compounds:** Fourteen overly abstract primitives (`pulse`, `wave`, `flow`, `will`, `cause`, …) should leave the atomic inventory entirely; their concepts survive as compounds with explicit teaching trees, not as roots that block the composition resolver.
3. **Synthetic eval remains valid after surgery:** A scoped LLM intuition rerun on changed concepts, with patched synonym maps and down-weighted cold-recovery scoring, can refresh aggregates without rerunning the full 2,400-call battery.
4. **Repository split is sustainable:** LLM rounds (~80k lines), playtests, translation snapshots, and the research-notes JSON store belong in a sibling data repo ([Fonora/fonora-data](https://github.com/Fonora/fonora-data)), pinned from the main repo via submodule + manifest, with Postgres as production canonical store.

## Approach

### Vocabulary audit and tier rewrite

A structured audit simulated 100+ beginner utterances against the Phase IV core and ranked missing concepts. The remediation rewrote [`tools/fonoran-experience-tiers.js`](../tools/fonoran-experience-tiers.js) communicative core to 50 roots emphasizing reference, location, body, and repair:

**Promoted into core:** `addressee`, `thing`, `need`, `food`, `here`, `there`, `place`, `path`, `inside`, `outside`, `near`, `far`, `understand`, `same`, and related survival/social scaffolding.

**Demoted to extended:** `love`, `happy`, `angry`, `calm`, `trust`, `hope`, `left`, `right`, `earth`, `sky`, `tree`, `animal`, `eye`, `mouth`, `after`, `think`.

**New atomic roots assigned spellings:** `food` = lo, `sick` = wu, `understand` = cha, `child` = re, `wait` = yo.

**Removed from inventory entirely** (not merely `compound_candidate`): `pulse`, `wave`, `flow`, `source`, `substance`, `form`, `will`, `cause`, `equal`, `mark`, `reach`, `strong`, `part`, `change` — required because [`tools/fonoran-composition-resolve.js`](../tools/fonoran-composition-resolve.js) treats every inventory primitive as an atomic root and ignores compound definitions for those ids.

**Kept as roots despite retirement pressure:** `still`, `empty` (compound parts), `true`, `same` (grammar: `no + true`, `no + same`).

Editorial JSON updated: [`data/fonoran-concept-inventory.json`](../data/fonoran-concept-inventory.json), [`data/fonoran-approved-roots.json`](../data/fonoran-approved-roots.json), [`data/fonoran-root-candidates.json`](../data/fonoran-root-candidates.json), [`data/fonoran-compounds.json`](../data/fonoran-compounds.json), [`data/localizations/en.json`](../data/localizations/en.json).

### Build pipeline

```bash
node scripts/fonoran-apply-experience-tiers.js
npm run fonoran:root-candidates
npm run fonoran:build:approved
npm run fonoran:regen-compounds
npm run fonoran:optimize-compounds
npm run fonoran:build:approved
npm run fonoran:compound-audit
npm run test:translator -- --update-golden   # rebase golden corpus
```

**Post-remediation lab:** 101 roots, 127 compounds, 130 lab words built, **0 dropped**. Health scores: Learnability 100, Parseability 100, Pronounceability 99. Compound audit: 0 critical, 0 broken dependencies.

Gap compounds added for dialogue repair: `come`, `later`, `own`/`mine`, `safe`. Fourteen retired primitives re-entered as compounds with `ASSOCIATION_SEEDS` in [`tools/fonoran-expression-candidates.js`](../tools/fonoran-expression-candidates.js).

### LLM evaluation methodology fixes

Before rerunning synthetic eval on changed concepts, the instrument was patched:

| Fix | Path |
| --- | --- |
| `CONCEPT_SYNONYMS` for ~23 changed concepts | [`tools/fonoran-llm-intuition.js`](../tools/fonoran-llm-intuition.js) |
| Env-overridable `intuition_weight` components | [`tools/fonoran-llm-aggregate.js`](../tools/fonoran-llm-aggregate.js) |
| Exclude `cross_lingual` from strict-match recovery | [`tools/fonoran-llm-aggregate.js`](../tools/fonoran-llm-aggregate.js) |
| `--concepts=a,b,c` scoped runner | [`scripts/fonoran-llm-intuition.js`](../scripts/fonoran-llm-intuition.js) |

Scoped rerun (~18 testable compounds, Tasks A+B+C): **572 API calls**, 0 failed. **10/18** clear consensus, **8/18** split. `optimize-compounds --use-llm` was **not** run on this pass (advisory data only until human Puzzle validation).

### Research data repository split

Growing JSON artifacts moved to [Fonora/fonora-data](https://github.com/Fonora/fonora-data):

| File | Role |
| --- | --- |
| `fonoran-llm-evaluations.json` | ~3,036 rounds (~80k lines) |
| `fonoran-playtests.json` | Human puzzle authority |
| `fonoran-translation-test-latest.json` | Regression snapshot |
| `research-notes-store.json` | Notebook canonical JSON |

Main repo changes:

- Git submodule at `external/fonora-data` (not `vendor/`, which is gitignored for WASM)
- [`tools/fonoran-data-paths.js`](../tools/fonoran-data-paths.js) + `FONORAN_DATA_DIR` env
- Pin file [`data/fonora-data.manifest.json`](../data/fonora-data.manifest.json) → tag `v0.1.0-migration`
- `npm run fonoran:data:status` verifies paths and manifest drift

Production remains Postgres-canonical on Heroku; release sync imports research notes from the external store path.

### GitHub organization

The codebase moved from `jamesc137/fonora` to [Fonora/fonora](https://github.com/Fonora/fonora). Package metadata, doc URLs, CONTRIBUTING clone instructions, and issue templates updated accordingly.

## Evaluation

**Informal audit:** Simulated beginner conversations against old vs proposed core showed improved coverage for pointing (`here`/`there`), addressee (`you`), repair (`understand`, `need`), and food/sickness without losing constitutional transparency on promoted roots.

**Automated gates:**

| Check | Result |
| --- | --- |
| `fonoran:build:approved` | 130/130 lab words, 0 dropped |
| `fonoran:compound-audit` | 0 critical |
| `test:translator` golden | 131/131 pass after rebase |
| Scoped LLM intuition | 572 calls, 0 failed |
| `fonoran:data:status` | 4/4 external files present |

**Not evaluated this pass:** Human Puzzle Conversation on the new core roots or on compounds whose seeds changed; full-inventory LLM rerun; production Postgres import of external data milestone.

## Findings

**The original 50-core was emotionally expressive but pragmatically incomplete.** Demoting nuanced emotions and landscape landmarks freed syllable budget for `food`, `addressee`, `thing`, and spatial deixis without abandoning the 50-root experiment frame.

**Inventory surgery is harder than tier relabeling.** Removing primitives that the composition resolver treats as atomic required deleting ids from the inventory, not marking them `compound_candidate`. Keeping `still` and `empty` as roots avoided breaking existing compound parts.

**Child moved from compound-only to atomic root** (`re`), reflecting its frequency in beginner dialogue and puzzle recovery signal from RN-19/RN-20.

**Synthetic eval survives vocabulary surgery when scoped.** Patching synonym maps and down-weighting saturated cold-recovery prevented false confidence on changed concepts; full 111-concept rerun remains deferred.

**The main repo was accumulating research ballast.** A single LLM evaluations file had grown to ~80k lines; splitting optional datasets into `fonora-data` keeps [Fonora/fonora](https://github.com/Fonora/fonora) reviewable while preserving audit trails in a pinned sibling repo.

## What Changed

- **Communicative core:** 50 roots rebalanced toward beginner scaffolding ([`tools/fonoran-experience-tiers.js`](../tools/fonoran-experience-tiers.js)).
- **Inventory:** 110 → 101 atomic roots; 127 compounds; 5 new root spellings; 14 abstractions retired to compounds or removed.
- **LLM tooling:** Methodology patches + scoped rerun appended to external [`fonoran-llm-evaluations.json`](https://github.com/Fonora/fonora-data).
- **Data architecture:** Submodule `external/fonora-data`, path resolver, manifest pin, gitignore of migrated blobs.
- **Org:** Canonical GitHub URL now [github.com/Fonora/fonora](https://github.com/Fonora/fonora).
- **Research notes:** This note (RN-21); store lives in fonora-data.

Prior notes this work builds on: [RN-19](/research/notes/first-learner-signal-from-phase-iv-regen), [RN-20](/research/notes/synthetic-intuition-ranking), [RN-12](/research/notes/the-campfire-test-communication-over-correctness).

## Open Questions

- Does the rebalanced 50-core improve real Session 4+ Puzzle recovery on location and repair phrases?
- Should any demoted emotions (`love`, `trust`) return as compounds before extended tier is taught?
- When should scoped LLM splits on changed compounds trigger `optimize-compounds --use-llm`?
- Does production need an automated fonora-data import on deploy, or is manual snapshot import sufficient for milestones?
- Will the 50-root puzzle mode (`?core=1`) feel teachable to a naive learner without gloss keys?

## References

**Documentation:** [`docs/fonoran.md`](../docs/fonoran.md), [`docs/fonoran-compound-audit-latest.md`](../docs/fonoran-compound-audit-latest.md), [`docs/fonoran-llm-playtest-experiment.md`](../docs/fonoran-llm-playtest-experiment.md), [`docs/deploy.md`](../docs/deploy.md)

**Data repository:** [Fonora/fonora-data](https://github.com/Fonora/fonora-data) (tag `v0.1.0-migration`)

**Interactive demo:** [Dictionary](/language#dictionary) (50-root filter), [Translator](/language#translator), [Puzzle Conversation](/language#puzzle)

**Source:** [`tools/fonoran-experience-tiers.js`](../tools/fonoran-experience-tiers.js), [`data/fonoran-concept-inventory.json`](../data/fonoran-concept-inventory.json), [`tools/fonoran-data-paths.js`](../tools/fonoran-data-paths.js), [`data/fonora-data.manifest.json`](../data/fonora-data.manifest.json)

**Prior notes:** [RN-20 · Synthetic intuition ranking](/research/notes/synthetic-intuition-ranking), [RN-19 · First learner signal](/research/notes/first-learner-signal-from-phase-iv-regen), [RN-18 · Compound reconstruction](/research/notes/reconstructing-compounds-under-the-constitution)
