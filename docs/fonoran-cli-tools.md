# Fonoran CLI tools

Command-line tools for building, reviewing, and maintaining the Fonoran vocabulary. Run all commands from the repo root after `npm install`.

Most npm scripts wrap modules in `tools/` or `scripts/`. The [Fonoran guide](fonoran.md) covers the language model and web UI; this page is the operator reference for CLI workflows.

## Quick reference

| Goal | Command |
| --- | --- |
| Fresh lab + full build | `npm run fonoran:reset && npm run fonoran:build` |
| Generate compound proposals | `npm run fonoran:vocab-survey` |
| Review proposals in UI | Open **Review** at [`/tools#gap-workshop`](/tools#gap-workshop) |
| Edit roots & words in UI | Open **Words** at [`/tools#word-manager`](/tools#word-manager) |
| Publish after approvals | **Advanced** → regenerate dictionary, or `npm run fonoran:regenerate` |
| Find translation gaps | `npm run fonoran:translation-gaps` |
| Automated gap loop | `npm run fonoran:refine` |

---

## Build pipeline

These commands assign root spellings, resolve compounds, and import into the lab (`data/fonoran-sound-bucket.json` or PostgreSQL when `DATABASE_URL` is set).

| Command | What it does |
| --- | --- |
| `npm run fonoran:build` | Full pipeline: assign CV/CVC roots from concept inventory, build curated compounds, validate unique segmentation, import lab. Approved spellings stay locked on re-run. |
| `npm run fonoran:build:approved` | Same as build but pre-approves everything (testing only). |
| `npm run fonoran:reset` | Blank lab, review queue, and canonical roots — destructive reset for a clean start. |
| `npm run fonoran:root-candidates` | Refresh root candidate spellings and scores without importing into the lab. |
| `npm run fonoran:regenerate` | Regenerate the live dictionary export after lab changes (used after accepting proposals in Review). |
| `npm run fonoran:regen-compounds` | Re-resolve compound compositions from current roots. |
| `npm run fonoran:editorial:import` | Import editorial compound data into the lab. |

**Typical loop:**

```bash
npm run fonoran:reset && npm run fonoran:build
# → approve roots in Words (/tools#word-manager)
# → npm run fonoran:build again
# → npm run fonoran:regenerate
```

---

## Concept inventory & roots

| Command | What it does |
| --- | --- |
| `npm run fonoran:inventory-migrate` | Seed editorial metadata (`plain_description`, `priority_class`, etc.) on `data/fonoran-concept-inventory.json`. |
| `npm run fonoran:reconcile-inventory` | Reconcile concept inventory against lab state. |
| `npm run fonoran:root-capacity` | Report how many CV/CVC slots remain for new roots. |
| `npm run fonoran:root-capacity:tiers` | Capacity broken down by experience tier. |
| `npm run fonoran:canonical:init` | Bootstrap canonical constitution data. |
| `npm run fonoran:canonical:constitution` | Stabilize constitution-linked canonical records. |

---

## Vocabulary proposals & review

LLM-generated compound proposals land in a queue reviewed in the **Review** tab (`/tools#gap-workshop`).

| Command | What it does |
| --- | --- |
| `npm run fonoran:vocab-survey` | Domain-batch LLM survey: proposes 300–500 compound concepts, validates compositions, writes to proposal queue. Requires `ANTHROPIC_API_KEY`. |
| `npm run fonoran:vocab-survey:dry` | Dry run with seed output only — no writes. |
| `npm run fonoran:gap-analyze-batch` | Batch LLM gap analysis from stranger corpus (top gaps). |
| `npm run fonoran:refine` | Automated loop: find gaps → propose → gate → accept → build → measure coverage. |
| `npm run fonoran:refine:dry` | Refine loop dry run (limited gaps, no writes). |

After `fonoran:vocab-survey`, open **Review** to accept, skip, or reject proposals. Accepted compounds require dictionary regeneration (Advanced tab or `npm run fonoran:regenerate`).

---

## Stranger corpus

The stranger phrase corpus stress-tests translation coverage with realistic multi-word English.

| Command | What it does |
| --- | --- |
| `npm run fonoran:stranger-corpus:generate` | Generate new stranger phrase corpus entries via LLM. |
| `npm run fonoran:stranger-corpus:promote` | Promote corpus entries into the vocabulary pipeline. |
| `npm run fonoran:stranger-corpus:gaps` | Gap report scoped to the stranger corpus. |

---

## Translation gaps & probes

| Command | What it does |
| --- | --- |
| `npm run fonoran:translation-gaps` | Full gap report: unknown words, coverage stats, quality findings. |
| `npm run test:translator` | Golden regression — fails on unexpected translator drift. |
| `npm run test:translator:update` | Accept current translator output as new golden baseline. |

---

## Compound optimization & audit

| Command | What it does |
| --- | --- |
| `npm run fonoran:optimize-compounds` | Heuristic preferred-form promotion in `compounds.json`. |
| `npm run fonoran:optimize-compounds -- --use-llm` | Rank alternates using LLM intuition weights when available. |
| `npm run fonoran:optimize-compounds -- --length-only` | Demote only when flat length > 4 and a shorter seed exists. |
| `npm run fonoran:compound-audit` | Compound quality audit (includes LLM split / promotion findings). |

**Authority tiers for preferred forms:** `human` / `playtest` (locked) → `llm_consensus` → `heuristic`.

---

## LLM evaluation

Requires `ANTHROPIC_API_KEY` in `.env`. LLMs evaluate seed candidates; they do not invent compositions.

| Command | What it does |
| --- | --- |
| `npm run fonoran:llm-intuition` | v3 intuition battery — ranks compound alternates. |
| `npm run fonoran:llm-intuition -- --pilot` | Smoke test (~80 calls). |
| `npm run fonoran:llm-intuition -- --calibration` | Calibration batch (~320 calls). |
| `npm run fonoran:llm-intuition -- --dry-run` | Cost estimate only. |
| `npm run fonoran:llm-playtest` | Run LLM playtest rounds. |
| `npm run fonoran:playtest:baseline` | Record playtest baseline metrics. |

Typical optimization after intuition batch:

```bash
npm run fonoran:llm-intuition -- --calibration
npm run fonoran:optimize-compounds -- --use-llm
npm run fonoran:build:approved
```

---

## English lexicon & roots

| Command | What it does |
| --- | --- |
| `npm run fonoran:roots` | Build English root mapping data. |
| `npm run fonoran:lexicon` | Write English lexicon file. |
| `npm run fonoran:lexicon:audit` | Audit lexicon coverage and consistency. |
| `npm run fonoran:lexicon:hygiene` | Apply lexicon hygiene fixes. |

---

## Data management

External vocabulary data lives in the `fonora-data` submodule.

| Command | What it does |
| --- | --- |
| `npm run fonoran:data:init` | Initialize git submodules (`fonora-data`). |
| `npm run fonoran:data:fetch` | Fetch latest pinned data from remote. |
| `npm run fonoran:data:status` | Show submodule commit vs manifest pin. |
| `npm run fonoran:snapshot:export -- --to=data/` | Export Postgres lab state → seed JSON (commit milestones). |
| `npm run fonoran:snapshot:import -- --from=data/` | Import seed JSON → Postgres (local bootstrap). |
| `npm run fonoran:import` | Import JSON bundle into runtime store. |
| `npm run fonoran:export` | Export runtime store to JSON. |

---

## Testing & diagnostics

| Command | What it does |
| --- | --- |
| `npm run fonoran:stress-test` | Stress-test build pipeline edge cases. |
| `npm test` | Unit tests + translator golden regression. |

---

## Web UI equivalents

| CLI workflow | Web UI |
| --- | --- |
| Approve roots & compounds | **Words** — [`/tools#word-manager`](/tools#word-manager) |
| Review LLM proposals | **Review** — [`/tools#gap-workshop`](/tools#gap-workshop) |
| Regenerate dictionary, snapshots, lab reset | **Advanced** — [`/tools#advanced`](/tools#advanced) |
| Puzzle playtests | **Puzzle** — [`/language#puzzle`](/language#puzzle) |
| Translation gap visualization | **Translation Test** — [`/tools#translation-test`](/tools#translation-test) |

---

## Environment

| Variable | Purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | Required for vocab survey, gap analysis, LLM intuition, refine loop |
| `ANTHROPIC_MODEL` | Override default model (default: `claude-sonnet-4-6`) |
| `DATABASE_URL` | PostgreSQL for production lab state |
| `PORT` | Dev server port (default `8000`) |

See also: [Fonoran guide](fonoran.md) · [Compound workflow](fonoran-compound-workflow.md) · [Deploy](deploy.md)
