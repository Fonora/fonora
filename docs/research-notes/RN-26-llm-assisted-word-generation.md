---
status: Foundational
date: 2026-07-03
phase: phase-5
---

# LLM-assisted word generation

> **Status (Jul 2026):** This note documents the **active production pipeline** for LLM-assisted vocabulary growth — gap classifier, proposal store, vocab survey, Proposal Review UI, and `fonoran:regenerate` promotion. Status `Foundational` means the architecture shipped here remains the editorial default; it is not obsolete.
>
> **What was retired:** the reactive per-gap CLI (`fonoran:suggest-compounds`) and the Gap Workshop **Gaps** sub-tab (word-by-word lookup). **Successor experiment:** [RN-27 · Automated refine loop](/research/notes/automated-refine-loop) adds corpus-driven auto-accept gates and `fonoran:refine` on top of the same modules — it extends RN-26; it does not replace the vocab-survey → review → regenerate path.

## Research Question

After Phase IV established meaning-attempts and playtest authority, and Phase V (RN-25)
eliminated translation fabrication, the remaining pain point became clear: **the language
creator is doing too much manual work**. The workflow — think of a phrase, try it in the
translator, see what is missing, go to the Word Manager, try to build the word — bottlenecks
at step four. Missing concepts like `behind`, `front`, `rule`, and `straight` require roots
that do not exist, and the compound generator produces technically-valid but semantically
thin candidates because hand-seeded strategies contain phantom concept IDs that fail build
validation silently.

The research question is: **can the translation gap baseline, the existing LLM proposer, and
the community voting layer be connected into a closed loop so that vocabulary growth becomes
mostly automated and human effort becomes exception handling?**

## Hypothesis

The existing architecture already has the right pieces: an LLM proposer
(`fonoran-llm-candidates.js`), a translation gap tracker (`fonoran-translation-gaps.js`),
community votes and proposals (`fonoran-community-store.js`), and a Word Manager that
aggregates inventory. None of them flow into each other. Connecting them with:

1. an LLM gap classifier that turns honest gaps into typed proposals,
2. a persisted proposal store that bridges gap analysis and the editorial pipeline,
3. a seed integrity validator that closes the silent phantom-ID failure, and
4. a playtest promotion function that surfaces playtest data as canon candidates,

should allow vocabulary to grow through a propose → validate → rank → review → accept loop
where the human only decides, not discovers.

## Approach

### 1. LLM gap classifier (`tools/fonoran-gap-analyzer.js`)

A new module that takes a gap word, its semantic role, and the full allowed-concept inventory,
and asks the LLM to classify the word as `compound`, `primitive`, or `alias`. For compound
classification it returns 3–5 compositions using only approved concept IDs, validated through
the build resolver. For primitive classification it returns a proposed concept record (id,
gloss, domain, priority class, campfire rationale). For alias it returns the existing concept
that best covers the meaning.

The LLM is given a full glossary of the current primitive roots so it can reason about what
is already expressible. All proposals are advisory — they do not touch `fonoran-concept-inventory.json`
or `fonoran-compounds.json` until a human accepts them.

A batch entry point `analyzeGaps` runs at configurable concurrency (default 3 parallel calls)
against all current translation gaps.

### 2. Persisted proposal store (`tools/fonoran-compound-proposals.js`)

LLM-generated proposals land in `data/fonoran-compound-proposals.json`, a new editorial
data file with status lifecycle `open → accepted | rejected | skipped`. The schema carries
full provenance: source, classification, rationale, all proposed compositions (raw and
build-validated), primitive proposal fields, and alias proposal fields.

Accepted compound proposals feed back into `generateCandidates` through
`getAcceptedCompositionSeeds`, so the next compound generation run automatically includes
LLM-validated strategies without any manual seed editing. Accepted primitive proposals are
surfaced as `getAcceptedPrimitiveProposals` for inventory-migration review.

### 3. Seed integrity validation (`validateSeedIntegrity`)

An export added to `fonoran-expression-candidates.js` that checks every component ID in
`ASSOCIATION_SEEDS` against the allowed concept set. This exposed 15 phantom IDs across 12
concepts — concept IDs that were never in the primitive inventory or compounds, causing the
build validator to silently exclude candidate strategies and leaving only vague fallbacks.

All 15 were fixed:

| Phantom | Used in | Fix |
|---------|---------|-----|
| `end` | `death` | → `after` |
| `fall` | `rain` | → `move + down` |
| `future` | `hope` | → `after` |
| `much` | `wisdom` | → `more` |
| `new` | `birth` | → `change` |
| `no` (×6) | `sad`, `peace`, `open`, `void`, `night`, `forget`, `almost`, `change`, `safe` | → `empty` or `less` where it means negation |
| `old` | `grandparent` | → `before + before + parent` |
| `past` | `remember` | → `before + inside` |
| `walk` | `journey` | → `move + far` (duplicate of existing seed) |

The validator now runs as part of `fonoran:compound-audit` and returns a `seed_violations`
list; the goal is zero violations at all times.

### 4. Community proposal auth fix (`fonoran-auth.js`)

`POST /api/fonoran/proposals` was gated as admin-only despite the docs and UI implying
community submission. Fixed: `isCommunityWriteRequired` now includes the proposals creation
route so any signed-in user can submit a proposal, while `isAdminWriteRequired` explicitly
exempts it.

### 5. Word Manager gap and proposal filters (`fonoran-word-manager.js`)

`listWordInventory` now accepts `filter: 'llm_proposals'` and `filter: 'gaps'` in addition
to the existing filters. The `queue` filter was extended to include `llm_proposal` items.
Translation gaps from the latest gap report appear as `kind: 'gap'` items with their role,
frequency, corpus samples, and WordNet suggestions. LLM compound proposals appear as
`kind: 'llm_proposal'` items with their classification, compositions, and provenance.

### 6. Playtest promotion helper (`buildPlaytestPromotionCandidates`)

A new export in `fonoran-playtests.js` that cross-references playtest summary data against
`compounds.json` and returns concepts where `rounds >= minRounds` and `recovery_rate >=
minRecoveryRate` (defaults: 3 rounds, 0.7 rate) whose `preferred_source` is still
`heuristic` or `llm_consensus`. The list is sorted by recovery rate descending and surfaced
at `GET /api/fonoran/playtests/promotions`. This turns the constitutional authority layer
(human playtest > LLM > heuristic) into an actionable queue rather than a manual audit.

### 7. New API surface

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/fonoran/compound-proposals` | GET | public | list proposals with status/classification filter |
| `/api/fonoran/compound-proposals/:id` | PATCH | admin | accept/reject/skip a proposal |
| `/api/fonoran/gaps/suggest` | POST | admin | LLM-classify a word and create a proposal |
| `/api/fonoran/playtests/promotions` | GET | public | compounds ready for playtest promotion |

### 8. CLI entry points (current)

Two complementary paths share the same proposal store (`fonoran-compound-proposals.json` locally, PostgreSQL on Heroku) and the same acceptance → `fonoran:regenerate` promotion step:

| Path | Command | When to use |
|------|---------|-------------|
| **Bulk survey (default)** | `npm run fonoran:vocab-survey` | Proactive growth — LLM proposes 300–500 compounds from the full primitive glossary in one batch |
| **Gap-targeted batch** | `npm run fonoran:gap-analyze-batch` | Analyze specific gap words from the latest gap report |
| **Automated refine loop** | `npm run fonoran:refine` | Corpus-driven experiment — gap → propose → gate → auto-accept → build → measure ([RN-27](/research/notes/automated-refine-loop)) |

> **Retired:** `scripts/fonoran-suggest-compounds.js` and `fonoran:suggest-compounds` (reactive one-gap-at-a-time CLI). Use vocab survey or refine instead.

```bash
npm run fonoran:vocab-survey                # bulk compound proposals (primary editorial path)
npm run fonoran:vocab-survey:dry            # dry run — seeds only, no LLM writes
npm run fonoran:gap-analyze-batch           # batch gap analysis from gap report
npm run fonoran:refine                      # automated loop (RN-27; optional experiment)
npm run fonoran:refine:dry                  # refine dry run — limited gaps, no writes
```

## Evaluation

The seed integrity fix is immediately verifiable: `validateSeedIntegrity` returns zero
violations after the 15 fixes. The compound quality impact will be measurable on the next
`fonoran:optimize-compounds` run, since candidate pools for the affected concepts now include
all previously excluded strategies.

Gap analysis quality depends on LLM availability (ANTHROPIC_API_KEY). The proposals are
validated through the same build resolver used by the main pipeline: only compositions whose
flattened root count is within `maxFlattenedRoots` and whose component IDs are in the allowed
set are persisted as `valid_compositions`.

The playtest promotion queue requires sufficient playtest data. With the current ~2,000
playtest rounds, several concepts already have enough signal to surface automatically.

The Word Manager gap and proposal filters are immediately usable: running `listWordInventory`
with `filter: 'gaps'` returns 9 actionable gap items from the existing gap baseline.

## Findings

The phantom seed problem was more significant than the audit log implied. Fifteen components
across 12 commonly-cited concepts (`forget`, `hope`, `birth`, `death`, `peace`, `wisdom`,
`rain`, `night`, `safe`, `open`, `void`, `change`) were silently excluded from candidate
generation on every build. The heuristic fallback then promoted whatever remained — often
a two-root composition involving `thing`, `place`, or `body` — not because it was the best
choice, but because the intended seeds were invisible. Fixing these does not change canon,
but it immediately expands the candidate pool the LLM intuition battery and playtest will
rank going forward.

The architecture diagnosis from the audit holds: the pieces are right, the connections were
missing. LLM classification + the proposal store + Word Manager filters form the missing
connective tissue between honest gap reporting and editorial action.

**Still active (Jul 2026):** `fonoran-gap-analyzer.js`, `fonoran-compound-proposals.js`,
`validateSeedIntegrity`, Word Manager gap/proposal filters, playtest promotion API,
`fonoran:vocab-survey`, Proposal Review UI, and `promoteAcceptedProposals()` as the first
step of `fonoran:regenerate`. Operational sequences: [fonoran-compound-workflow.md](../fonoran-compound-workflow.md),
[fonoran-cli-tools.md](../fonoran-cli-tools.md).

## What Changed

- `tools/fonoran-gap-analyzer.js` — new LLM gap classifier (compound / primitive / alias)
- `tools/fonoran-compound-proposals.js` — new persisted proposal store
- `tools/fonoran-expression-candidates.js` — `validateSeedIntegrity` export; fixed 15
  phantom component IDs in `ASSOCIATION_SEEDS`; `generateCandidates` merges accepted proposal
  seeds; `loadCandidateContext` loads accepted proposals
- `tools/fonoran-auth.js` — community proposal creation no longer admin-only
- `tools/fonoran-word-manager.js` — `llm_proposals`, `gaps` filters; `queue` includes
  LLM proposals; gap report items and LLM proposals appear in inventory
- `tools/fonoran-playtests.js` — `buildPlaytestPromotionCandidates` export
- `tools/fonoran-api.js` — compound-proposals, gaps/suggest, playtests/promotions endpoints
- `data/fonoran-compound-proposals.json` — new proposal store (runtime; Postgres on Heroku)
- ~~`scripts/fonoran-suggest-compounds.js`~~ — removed; replaced by vocab survey and refine loop

## Addendum — Generation 2 milestone (July 2026)

### What changed and why

The RN-26 architecture succeeded at wiring the pipeline, but the primitive set it operated
on had a deeper problem: **too many primitives were over-specific words, not generative
concepts**. 101 primitives included `happy`, `angry`, `sick`, `curious` — states that
should be *expressed through* primitives, not listed alongside them. This capped vocabulary
growth because every gap analysis either proposed a new primitive (inflating the root set)
or produced thin compounds from an undersupplied set of spatial/directional roots.

The fix came from applying the **"campfire test"** at the root level: *could this concept
realistically come up between two strangers in their first week together?* Four new spatial
primitives survived the test and had unusually high generativity:

| Root | Spelling | Gloss | Expressible from it |
|------|----------|-------|---------------------|
| `around` | `yi` | surrounding / cycling | again, circle, repeat, spin, surround |
| `front` | `cha` | facing / before in space | face, forward, direct, confront |
| `back` | `so` | behind / returning | return, retreat, behind, previous |
| `through` | `fel` | passing / penetrating | across, pierce, via, tunnel, filter |

Sixteen over-specific concepts were demoted to compounds and given explicit compositions:

`happy`, `angry`, `sad`, `fear`, `sick`, `alive`, `hope`, `curious`, `peace`,
`understand`, `trust`, `love`, `hate`, `remember`, `forget`, `enjoy`.

This reduced the primitive count from 101 to **89** and immediately opened ~300 new
compound slots for the vocab survey.

### Vocabulary survey at scale

`fonoran-suggest-compounds.js` (the reactive per-gap CLI) was retired. In its place:
**`tools/fonoran-vocab-survey.js`** (`npm run fonoran:vocab-survey`) sends the full
primitive inventory to the LLM once and receives 300–500 compound proposals in a single
batch. This is a one-shot LLM operation; subsequent `fonoran:regenerate` runs never call
the LLM again.

The survey generated **312 proposals** covering concepts from `storm` to `democracy` to
`deadline`. All proposals are validated through the live composition resolver before
saving — only compositions whose flattened root count ≤ 4 and whose component IDs are in
the allowed set are persisted.

### Acceptance flow fix

Previously, accepting a proposal in the Proposal Review UI attempted to write the word
directly to the lab via `POST /api/fonoran/lab/compounds` — silently failing because it
sent concept IDs as bare strings instead of `{type, ref}` objects. Accepted words never
appeared in the dictionary.

Fixed by removing the inline write and adding `promoteAcceptedProposals()` as the **first
step** of `fonoran:regenerate`. On each regeneration run it merges any accepted proposals
from `fonoran-compound-proposals.json` into `fonoran-compounds.json`, then the standard
build pipeline picks them up. The `fonoran-compound-proposals.json` file is ephemeral
(gitignored); the promoted words are baked permanently into `fonoran-compounds.json`.

### A+B+A primitive repetition check

Compounds that involve two concepts sharing an underlying primitive can flatten to patterns
like `water + path + water` (river = flow + water, where flow = water + path). This is
linguistically valid (water shapes the path that water follows) but can look redundant.

`detectRedundantRootPattern(flatRoots)` in `tools/fonoran-composition-resolve.js` flags:
- **`adjacent_repeat`** — same root appears twice in a row (`A A B`)
- **`edge_repeat`** — same root appears at both ends (`A B A`)

The check is **soft**: it tags proposals with `redundancy_warning` in the UI but does not
block acceptance. Human review decides whether the repetition is meaningful or an artifact.

### Pipeline redesign (UI)

The **Gap Workshop** tab was renamed **Proposal Review** and the Gaps sub-tab was removed
(honest gaps remain tracked in the API but the workflow now starts with the vocab survey,
not individual gap lookup). The **Advanced** tab was redesigned from a Mermaid diagram to a
**five-step visual pipeline** — Roots → Vocab Survey → Proposal Review → Regenerate →
Validate — with live stats for each step.

### Storage (local vs production)

During the Gen 2 sprint, local dev briefly defaulted to Postgres to mirror Heroku. The
[RN-27](/research/notes/automated-refine-loop) refine experiment then exposed a critical
integration rule: **promote → build → gap report must share one editorial backend** or
accepted proposals never reach the lab. Local `.env` now defaults to **`FONORAN_STORAGE=json`**
(see `.env.example`). Production Heroku sets **`FONORAN_STORAGE=postgres`** with
`DATABASE_URL`. The proposal queue follows the same rule: JSON file locally, Postgres rows
on Heroku.

### Reproducibility

A fresh clone + `npm install` + `npm run fonoran:regenerate` reproduces the committed lab
from `data/fonoran-compounds.json` without any LLM key:

1. `promoteAcceptedProposals` merges any newly accepted queue items (usually none on a clean clone)
2. `importEditorialFromSeedPaths` reads editorial JSON (`fonoran-compounds.json`, roots, inventory)
3. `fonoran-build.js` resolves, validates uniqueness, writes the lab bucket or Postgres
4. Some editorial entries may drop at build time due to phonetic collisions (handled deterministically)

`ANTHROPIC_API_KEY` is only required to run a new `fonoran:vocab-survey`, gap-analysis batch,
refine loop with LLM gates, or LLM playtest.

### What Changed (Generation 2)

| File | Change |
|------|--------|
| `data/fonoran-concept-inventory.json` | 4 new primitives, 16 demoted to compound_candidate; primitive_count → 89 |
| `data/fonoran-semantic-primitives.json` | Added `around`, `front`, `back`, `through`; added `demoted_from_primitives` |
| `data/fonoran-approved-roots.json` | New spatial roots approved; demoted concepts removed |
| `data/fonoran-compounds.json` | Explicit entries for 16 demoted concepts; 305 new compounds added |
| `tools/fonoran-vocab-survey.js` | New bulk LLM proposal generator |
| `tools/fonoran-composition-resolve.js` | Added `detectRedundantRootPattern` |
| `tools/fonoran-gap-analyzer.js` | Integrated redundancy check; tags proposals with `redundancy_warnings` |
| `tools/fonoran-regen.js` | Added `promoteAcceptedProposals` as first regeneration step |
| `scripts/fonoran-regen-compounds.js` | Fixed: excluded `compound_candidate` concepts from primitive ID set |
| `tools/fonoran-concepts.js` | Fixed: null-check in `buildConceptAliasIndex` for demoted concepts |
| `tools/fonoran-canonical-stabilization.js` | Deleted (dead file importing deleted legacy gen3) |
| `js/gap-workshop-page.js` | Removed gaps tab logic; removed broken lab-create; added redundancy badge |
| `language/index.html` + `fonoran-app.js` | Advanced tab: five-step visual pipeline |
| `language/fonoran.css` | Pipeline step styles; `.gw-badge--warn` for redundancy |
| `index.html` | Gap Workshop → Proposal Review; Gaps tab removed |
| `.env` | Gen 2: briefly `FONORAN_STORAGE=postgres`; RN-27 refine fix: local default back to `json` |
| `package.json` | Added `fonoran:vocab-survey`, `fonoran:refine`; removed `fonoran:suggest-compounds`, gen3 scripts |

## Open Questions

Resolved during the Gen 2 addendum above:

- **Phantom seed IDs** — `validateSeedIntegrity` + 15 fixes; enforced in `fonoran:compound-audit`
- **Broken accept → lab write** — replaced by `promoteAcceptedProposals()` in `fonoran:regenerate`
- **Reactive gap UI bottleneck** — vocab survey + Proposal Review pipeline
- **Over-specific primitives** — 16 demoted; 4 spatial roots added (89 primitives)

Handed to [RN-27 · Automated refine loop](/research/notes/automated-refine-loop):

- Corpus coverage targets and auto-accept gate thresholds on the 1,000-phrase stranger corpus
- Phonetic analytics, proposal gates, alias promotion, and lexicon hygiene guardrails
- Whether refine runs on a schedule or only when manually triggered

## References

- [RN-27 · Automated refine loop](/research/notes/automated-refine-loop) — extends this pipeline with `fonoran:refine`
- [RN-25 · Concept-first translation and honest gaps](/research/notes/concept-first-translation-and-honest-gaps)
- [RN-21 · Beginner core remediation](/research/notes/beginner-core-remediation)
- [RN-20 · Synthetic intuition ranking](/research/notes/synthetic-intuition-ranking)
- [docs/fonoran-compound-workflow.md](../fonoran-compound-workflow.md) — operational sequences (local + Heroku)
- [docs/fonoran-cli-tools.md](../fonoran-cli-tools.md) — command reference
- [docs/fonoran-generation-2.md](../fonoran-generation-2.md) — Gen 2 primitive redesign snapshot
- [tools/fonoran-gap-analyzer.js](../../tools/fonoran-gap-analyzer.js)
- [tools/fonoran-compound-proposals.js](../../tools/fonoran-compound-proposals.js)
- [tools/fonoran-expression-candidates.js](../../tools/fonoran-expression-candidates.js)
- [tools/fonoran-vocab-survey.js](../../tools/fonoran-vocab-survey.js)
