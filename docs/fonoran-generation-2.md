# Fonoran Generation 2 — Architecture Snapshot

> **Historical snapshot.** This document records the decisions and structure of Generation 2 (89 primitives, 455 compounds). The active vocabulary is now **483+ compounds** built on the same editorial principles. The `tools/legacy/` directory referenced in the Deprecated section no longer exists. Active workflow: [fonoran.md](fonoran.md) · [fonoran-cli-tools.md](fonoran-cli-tools.md).

---

## What changed from Generation 1

Generation 1 (101 primitives, 127 compounds) tried to cover vocabulary breadth by making specific concepts primitives — `happy`, `angry`, `trust`, `hope`, `metal`, `tree`, `left`, `right`, `child`, `parent`, etc. This produced low generativity: each primitive could only express itself, not produce a family of derived meanings.

Generation 2 inverts this: **primitives are productive concepts, not specific words.** The guiding question for any root is the *campfire test* — "Could two strangers use this root meaningfully within their first week of interaction?" If the root only ever means itself, it becomes a compound.

### Key insight

`around` as a concept produces: *spin, orbit, surround, return, again, cycle, revolution, recurring.* A single root unlocks dozens of derived words. That generativity is the metric that matters, not raw coverage.

---

## The "Rings of Experience" model

Primitives are organized by proximity to direct human experience:

| Ring | Domain | Examples |
|---|---|---|
| 0 — Body | Physical self | `body`, `hand`, `eye`, `mouth`, `breath`, `blood`, `sleep` |
| 1 — Action | Core verbs | `do`, `go`, `make`, `give`, `take`, `say`, `want`, `know`, `feel`, `see`, `hear` |
| 2 — Space | Position and direction | `up`, `down`, `in`, `out`, `near`, `far`, `here`, `now`, **`around`**, **`front`**, **`back`**, **`through`** |
| 3 — Quantity | Scale and measure | `one`, `more`, `all`, `big`, `small`, `much`, `little` |
| 4 — Quality | Universal properties | `good`, `bad`, `true`, `new`, `same`, `other`, `fast`, `hard` |
| 5 — Relation | Social and causal | `with`, `not`, `if`, `because`, `before`, `after` |

The four spatial primitives added in Generation 2 (`around`, `front`, `back`, `through`) each unlock a cluster of derived spatial and metaphorical meanings that previously required approximations or were simply missing.

---

## Primitive set (89 roots)

The Generation 1 set had 101 primitives. Generation 2:

- **Added**: `around`, `front`, `back`, `through` (highly generative spatial concepts)
- **Demoted to compounds**: `happy`, `angry`, `calm`, `sick`, `trust`, `hope`, `understand`, `wait`, `metal`, `tree`, `left`, `right`, `child`, `parent`, `surface`, `center` (expressible from existing roots)
- **Net result**: 89 primitives

Each demoted concept gets a clean compound decomposition. For example:
- `happy` → `feel + good`
- `understand` → `know + through`
- `trust` → `know + good`
- `left` → `side + not` (relative to `front`)
- `child` → `person + small + new`

---

## Compound vocabulary (455 words)

### How compounds are generated

Generation 1 grew compounds reactively: find a translation gap → run `fonoran-gap-analyzer.js` → accept one word at a time. This was slow and inconsistent.

Generation 2 uses **`fonoran-vocab-survey.js`**: a proactive LLM-driven tool that takes the full primitive glossary and asks the LLM to propose 300–500 compound concepts across semantic domains in a single structured pass. Each proposal is validated against the allowed primitive set before being queued.

```
npm run fonoran:vocab-survey          # generate batch of proposals
npm run fonoran:vocab-survey:dry      # dry run (see seeds only, no LLM call)
```

Proposals are queued in `data/fonoran-compound-proposals.json` and reviewed in the **Proposal Review** tool (formerly Gap Workshop).

### Compound definition format

`data/fonoran-compounds.json` stores the canonical definitions:

```json
{
  "behind": {
    "preferred": ["back", "near"],
    "alternatives": [["back", "side"], ["back", "place"]],
    "gloss": "at the back, not visible from the front"
  }
}
```

The `preferred` composition is what gets a phonetic spelling. The `alternatives` are ranked fallbacks.

### Association seeds

`tools/fonoran-expression-candidates.js` holds `ASSOCIATION_SEEDS` — the LLM-scoring hints that tell the understandability ranker which root combinations are most guessable. These are now generated from vocab survey output rather than hand-written.

---

## Build pipeline

```
npm run fonoran:vocab-survey          # 1. Propose new compounds (proactive)
# — review proposals in Proposal Review UI —
npm run fonoran:regenerate            # 2. Import → optimize → build
npm run test:translator               # 3. Validate golden translations + probes
```

### What `fonoran:regenerate` does

1. `fonoran-editorial-import.js` — imports hand-edited seeds from `ASSOCIATION_SEEDS`
2. `fonoran-optimize-compounds.js` — re-ranks compound forms using updated seeds
3. `fonoran-build.js` — assigns phonetic spellings to roots, builds compounds, emits the dictionary

---

## Health metrics (Generation 2)

| Metric | Score |
|---|---|
| Learnability | 100 / 100 |
| Pronounceability | 100 / 100 |
| Memorability | 100 / 100 |
| Parseability | 100 / 100 |

Previously missing concepts that now resolve:

| Concept | Fonoran |
|---|---|
| behind | `so-near` (back + near) |
| again | `yi-do` (around + do) |
| surround | `yi-near` (around + near) |
| return | `yi-go` (around + go) |
| hide | `so-body` (back + body) |
| understand | `know-through` |
| happy | `feel-good` |
| curious | `know-want` |

---

## Tools that led to this generation

| Tool | Role |
|---|---|
| `tools/fonoran-vocab-survey.js` | Primary vocabulary discovery — run when you want to grow the compound set |
| `tools/fonoran-expression-candidates.js` | Understandability ranker + ASSOCIATION_SEEDS |
| `tools/fonoran-build.js` | Full language builder |
| `scripts/fonoran-regenerate.js` | Orchestrates the full regen pipeline |
| `tools/fonoran-gap-analyzer.js` | Gap classification (compound / primitive / alias); used by vocab survey, gap batch, and refine loop |
| `scripts/fonoran-refine-loop.js` | Optional corpus experiment — auto-accept through phonetic gates ([RN-27](research-notes/RN-27-automated-refine-loop.md)) |

Research notes: [RN-26 · LLM-assisted word generation](research-notes/RN-26-llm-assisted-word-generation.md) (foundational pipeline) · [RN-27 · Automated refine loop](research-notes/RN-27-automated-refine-loop.md) (corpus experiment)

## Deprecated / removed

| What | Why |
|---|---|
| `tools/legacy/` | Gen3 experiments, fully superseded |
| `scripts/fonoran-suggest-compounds.js` | Reactive gap-filler, replaced by vocab survey |
| `scripts/fonoran-seed-gapfill-localization.js` | Old approach to seeding, no longer applicable |
| Gap Workshop UI (Gaps tab) | Reactive word-by-word analysis; the proactive vocab survey makes this obsolete |
