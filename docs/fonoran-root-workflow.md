# Fonoran root workflow

> **Status:** active · Words first, semantics follow · Root Review is the primary development workflow

## Philosophy

Fonoran is designed the way a real language evolves:

1. **Words come first** — phonetic roots with meanings humans can say and remember.
2. **The semantic network evolves afterward** — compounds and trees grow from approved roots.
3. **Human judgment is canonical** — AI proposes; you approve, reject, or edit.

The previous workflow tried to freeze the entire semantic hierarchy before assigning sounds. **That is superseded.** Semantic refinement can happen continuously; what must be stable first is the **root vocabulary**.

## Workflow

There is now **one converged pipeline**. `npm run fonoran:build` regenerates roots
(locking everything you have approved), builds curated compounds from those roots,
validates that every compound parses uniquely, and imports roots + compounds into
the lab so Concept Editor, Dictionary and Health all read one consistent inventory.

```text
fonoran:build → roots (approved locked) → compounds (unique-parse checked) → lab + health
```

| Step | What happens |
| --- | --- |
| 1. Build | `npm run fonoran:build` assigns spellings + IPA to the concept inventory, **locking approved spellings**, builds compounds, imports to lab |
| 2. Review | Open **Root Review / Concept Editor** at `/fonoran/#root-review` |
| 3. Decide | Approve, reject, edit spelling/meaning/pronunciation, or regenerate |
| 4. Rebuild | Re-run `fonoran:build`; approved roots stay locked, the rest re-optimize |
| 5. Health | Live scores at `/fonoran/` → Health (Parseability comes from the curated compounds) |

> `npm run fonoran:root-candidates` still exists to refresh candidates **without**
> touching the lab; `fonoran:build` calls it internally and then composes + imports.

### Converging the two old generators

`fonoran:root-candidates` (human-review roots) and the retired `fonoran:primitive-roots`
(bulk lab seed) used **incompatible concept vocabularies**, so they produced different
spellings for the same ideas and only ~20% of the old compounds resolved. They are now
merged into a single source:

- **Concepts:** `data/fonoran-concept-inventory.json` — 99 core primitives + 19 curated
  extended dimensions (size, body parts, cognition verbs) pulled from the old 200-set
  where they did not conflict.
- **Compounds:** `data/fonoran-compounds.json` — curated transparent compounds authored
  in that one vocabulary, prefer two roots, dropped automatically if they ever parse
  ambiguously.
- **Approved feel preserved:** every approved spelling is locked before assignment, so
  the language keeps the sound you signed off on.

## Unified concepts

All naming tools read from **`data/fonoran-root-candidates.json`** via `GET /api/fonoran/concepts` and `GET /api/fonoran/lexicon`:

| Tool | Uses concepts |
| --- | --- |
| Root Review | Candidate spellings + gloss definitions |
| Word Matcher | Same concepts + proposed spellings; hides matched pairs |
| Root Creator | Concept picker (domains + glosses) |
| Translator | Alias index + interpretive rules ([fonoran-interpretive-translator.md](fonoran-interpretive-translator.md)) |
| Word Review | Root Review card layout + concept lookup |

Approved roots store `concept_id` on lab sounds so meaning stays the full gloss while English aliases resolve in translation.


Each proposed root includes:

| Field | Example |
| --- | --- |
| Fonoran spelling | `ba` |
| IPA | `/bʌ/` |
| English concept | a sentient being; someone |
| Domain | being |
| Why primitive | Fundamental being concept… |
| Pronunciation ease | very easy (1–5) |
| Semantic usefulness | very high (1–5) |

Sound assignment optimizes for:

- Shortest, easiest syllables on highest-leverage concepts
- Pleasant compounds and cross-language accessibility
- Avoiding awkward syllables (`pi`, `pee`, `po`, `poo`) unless deliberately added later

## Files

| File | Role |
| --- | --- |
| [`data/fonoran-concept-inventory.json`](../data/fonoran-concept-inventory.json) | **Converged** concept inventory: 99 core + 19 extended (no phonetics) |
| [`data/fonoran-compounds.json`](../data/fonoran-compounds.json) | Curated transparent compound definitions |
| [`data/fonoran-root-candidates.json`](../data/fonoran-root-candidates.json) | Proposed roots awaiting review |
| [`data/fonoran-semantic-primitives.json`](../data/fonoran-semantic-primitives.json) | Original 99 primitives (reference; core of the inventory) |
| [`tools/fonoran-build.js`](../tools/fonoran-build.js) | **Unified build** (roots → compounds → lab → health) |
| [`tools/fonoran-root-candidates.js`](../tools/fonoran-root-candidates.js) | Root generator (called by the build) |
| [`tools/fonoran-root-store.js`](../tools/fonoran-root-store.js) | Review API persistence |

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/fonoran/roots/candidates` | List candidates (`?status=pending`) |
| GET | `/api/fonoran/roots/candidates/:id` | One candidate |
| PATCH | `/api/fonoran/roots/candidates/:id` | `{ action: approve\|reject\|edit\|reopen, … }` |
| POST | `/api/fonoran/roots/candidates/:id/regenerate` | New spelling for one concept |
| POST | `/api/fonoran/roots/generate` | Regenerate all (preserves approved/rejected) |
| GET | `/api/fonoran/roots/canonical` | Approved root inventory |

## Superseded approaches

| Old | Why replaced |
| --- | --- |
| Semantic-first, phonetics deferred | Roots need to feel speakable before theory freezes |
| Bulk `fonoran-primitive-roots` import | Machine output skipped human review |
| Gen3 canonical registry (36 DDA primitives) | Different experiment; root review is the new path |

The semantic foundation docs remain useful **reference material** for compound design later — they are not a gate before phonetics.

## Commands

```bash
npm run fonoran:reset             # blank slate: clears lab + review queue + canonical roots
npm run fonoran:build             # generate everything for MANUAL review (nothing approved)
npm run fonoran:build:approved    # generate everything PRE-APPROVED across all layers (testing)
npm run fonoran:build -- --approve-all   # equivalent flag form
npm run fonoran:root-candidates   # refresh candidates only (no lab import)
npm start                         # open /fonoran/#root-review
```

### Typical loops

```bash
# Manual review loop (your main workflow)
npm run fonoran:reset && npm run fonoran:build   # 118 roots + 46 words, all "needs review"
#   → open /fonoran/#root-review and approve/reject/edit by hand

# Quick full-language test (skip review)
npm run fonoran:reset && npm run fonoran:build:approved   # everything approved everywhere

# Deprecated (now error out, kept only as pointers):
#   npm run fonoran:primitive-roots
#   npm run fonoran:primitive-roots:gen
#   npm run fonoran:primitive-roots:import
```

---

## Open-source credits

The language generation and Word Generator tooling relies on the following open-source resources:

| Tool | Source | Used for |
|---|---|---|
| **WordNet** | Princeton University (George A. Miller, Christiane Fellbaum et al.) · [wordnet.princeton.edu](https://wordnet.princeton.edu) · [License](https://wordnet.princeton.edu/license-and-commercial-use) | Semantic lexical database: synonym synsets, hypernym (is-a) chains used by the Word Generator to map English input to Fonoran concept primitives |
| **wordpos** | [npmjs.com/package/wordpos](https://www.npmjs.com/package/wordpos) · MIT License | Node.js interface to the WordNet database |
| **fonoran-semantic-lookup.js** | Internal (`tools/`) | Thin wrapper over wordpos with local caching (`data/fonoran-semantic-cache.json`) and a curated hypernym bridge table mapping WordNet categories to Fonoran concept IDs |

WordNet license summary: free for research and non-commercial use with attribution. See the full license before any commercial redistribution.

*Related: [fonoran-grammar.md](fonoran-grammar.md) · [fonoran-semantic-foundation.md](fonoran-semantic-foundation.md) (reference)*
