# Fonoran compound workflow (local + production)

> Sequential commands for producing and shipping vocabulary from editorial inputs through build, audit, optional LLM ranking, and deploy.
>
> See also: [fonoran.md](fonoran.md) (pipeline overview), [deploy.md](deploy.md) (Heroku), [fonoran-constitution.md](fonoran-constitution.md) (success criteria).

## What gets committed vs what stays runtime-only

| In git (seed / editorial) | Runtime only (not in git) |
| --- | --- |
| `data/fonoran-compounds.json` — preferred forms + alternates | `data/fonoran-sound-bucket.json` — built lab (gitignored) |
| `data/fonoran-concept-inventory.json` | Live PostgreSQL lab rows on Heroku |
| `data/fonoran-approved-roots.json` | |
| `data/fonoran-root-candidates.json` | |
| `data/fonoran-llm-evaluations.json` — intuition rounds | |
| `data/fonoran-compound-proposals.json` — LLM gap proposals (in git) | |
| `tools/fonoran-expression-candidates.js` — `ASSOCIATION_SEEDS` | |

**Build** reads editorial JSON → writes the lab bucket. Production Postgres is seeded once from git; later updates require an explicit import + rebuild (below).

---

## Local: from scratch (full pipeline)

Use when resetting the lab or onboarding a fresh clone.

```bash
npm install
cp .env.example .env          # optional: ANTHROPIC_API_KEY, DATABASE_URL, OAuth

# 1. Blank lab + review queue (optional — destructive)
npm run fonoran:reset

# 2. Assign root spellings + build compounds → local lab
npm run fonoran:build
# or skip review gate for CI / milestone commits:
npm run fonoran:build:approved

# 3. Verify
npm run fonoran:compound-audit
npm test
npm start
# → http://localhost:8000/language#dictionary
```

---

## Local: compound efficiency pass (typical editorial loop)

Use after editing seeds or `compounds.json` — e.g. compressing `world`, fixing length violations.

```bash
# 0. Edit editorial inputs (pick one or more)
#    tools/fonoran-expression-candidates.js  → ASSOCIATION_SEEDS
#    data/fonoran-compounds.json             → preferred / alternates / gloss

# 1. Length-only promotion (safe bulk: only flat > 4 with shorter seed)
npm run fonoran:optimize-compounds -- --length-only

#    Alternatives (use deliberately, not blind bulk):
#    npm run fonoran:optimize-compounds              # heuristic score winners
#    npm run fonoran:optimize-compounds -- --use-llm   # after v4 calibration only

# 2. Rebuild lab from editorial JSON
npm run fonoran:build:approved

# 3. Audit + tests
npm run fonoran:compound-audit -- --out=docs/fonoran-compound-audit-latest.md
npm test

# 4. Optional: LLM intuition on changed concepts only (needs ANTHROPIC_API_KEY)
npm run fonoran:llm-intuition -- world
#    npm run fonoran:llm-intuition -- --calibration   # 10-concept v4 calibration (~$1)

# 5. Human playtest (constitutional authority)
npm start
# → /language#puzzle?concept=world
# Lock winner: set preferred_source to "playtest" in compounds.json

# 6. Commit seed files (see checklist below)
git add data/fonoran-compounds.json tools/fonoran-expression-candidates.js ...
git commit -m "..."
```

### Expected audit after length-only pass

- **Flattened length warnings (>4 roots):** `0`
- Review promotion log: e.g. `world: whole+place+earth+life → earth+all (5→2 roots)`

---

## Local: PostgreSQL mode (matches production storage)

When `DATABASE_URL` is set locally, `readDoc` / `writeDoc` use Postgres instead of JSON files.

```bash
# Bootstrap Postgres from git seeds (first time or full replace)
npm run fonoran:snapshot:import -- --from=data/

# Then run the compound loop above — build writes lab to Postgres

# Export Postgres → git seed paths (for commit)
npm run fonoran:snapshot:export -- --to=data/
```

Without `DATABASE_URL`, storage falls back to JSON under `data/` automatically.

---

## Production (Heroku): ship vocabulary changes

Deploy **does not** auto-run `fonoran:build`. Git seed files update on the dyno filesystem at deploy time, but **existing Postgres rows are not overwritten** on boot.

### Prerequisites (once)

```bash
heroku login
heroku git:remote -a fonora          # if not already linked
heroku config:set FONORAN_SKIP_JSON_MIRROR=1 -a fonora
# DATABASE_URL, OAuth vars — see deploy.md
```

### Sequence after merging to `staging` / `main`

**Step A — deploy code + seed JSON**

```bash
git checkout staging
git pull origin staging
# merge your branch, or commit directly on staging
git push heroku staging:main -a fonora
# or: git push heroku main:main -a fonora
```

Release phase runs `scripts/fonoran-data-fetch.js` (`Procfile` `release:`), which fetches the pinned external data submodule. Vocabulary is **not** rebuilt yet.

**Step B — reload editorial seeds + rebuild lab (GUI or CLI)**

After deploy, regenerate vocabulary from git seeds. **Do not run build alone** — it uses stale Postgres editorial state.

**Advanced UI (recommended on Heroku):**

1. Sign in as admin → `/tools#advanced`
2. Click **Regenerate dictionary from git seeds** → type `REGENERATE`
3. Click **Run translation tests** to verify

**CLI (local or one-off dyno):**

```bash
npm run fonoran:regenerate
# optional — re-promote from llm-evaluations.json (may change compounds.json):
npm run fonoran:regenerate -- --use-llm
```

Reference: [fonoran-compound-workflow.md](fonoran-compound-workflow.md) · [fonoran-llm-playtest-experiment.md](fonoran-llm-playtest-experiment.md)

**Step C — verify**

```bash
heroku open /language -a fonora
# or
curl -s https://fonora.org/health
# Dictionary: search "world" → should show fenmel (after world compression deploy)
```

**Step D — backup (recommended after milestone vocab changes)**

```bash
heroku run "npm run fonoran:snapshot:export" -a fonora
# download via Advanced → Backup, or periodic zip to backups/
```

### Alternative: zip snapshot from local

If you built and verified locally with Postgres pointing at a staging DB, or exported after local JSON build:

```bash
# Local: after build:approved
npm run fonoran:snapshot:export -- backups/fonoran-milestone.zip

# Upload + import on Heroku (Advanced UI → Import snapshot, type RESTORE)
# or CLI if zip is on dyno:
heroku run "npm run fonoran:snapshot:import -- backups/fonoran-milestone.zip" -a fonora
```

---

## Command reference (ordered)

| Step | Command | Local | Heroku one-off |
| --- | --- | --- | --- |
| Reset lab | `npm run fonoran:reset` | yes | rarely |
| Length-only optimize | `npm run fonoran:optimize-compounds -- --length-only` | yes | yes |
| Heuristic optimize | `npm run fonoran:optimize-compounds` | yes | yes |
| LLM optimize | `npm run fonoran:optimize-compounds -- --use-llm` | after v4 calibration | after v4 calibration |
| Build lab | `npm run fonoran:build:approved` | yes | yes |
| Audit | `npm run fonoran:compound-audit` | yes | optional |
| LLM intuition (one concept) | `npm run fonoran:llm-intuition -- world` | yes (API key) | yes (API key on dyno) |
| Tests | `npm test` | yes | CI / local before push |
| Import editorial seeds → Postgres | `npm run fonoran:editorial:import -- --from=data/` | yes | **required on prod** (or use Advanced GUI) |
| Full generator pipeline | `npm run fonoran:regenerate` | yes | **Advanced GUI on prod** |
| Export Postgres → seeds | `npm run fonoran:snapshot:export -- --to=data/` | yes | optional |
| Start app | `npm start` | yes | automatic (`web` dyno) |

---

## Commit checklist (before push to staging/main)

- [ ] `npm run fonoran:build:approved` — 0 dropped (run `npm run fonoran:compound-audit` for live compound count)
- [ ] `npm run fonoran:compound-audit` — 0 flattened-length warnings (or documented exceptions)
- [ ] `npm test` — unit + golden translator pass
- [ ] Commit: `data/fonoran-compounds.json`, `tools/fonoran-expression-candidates.js`, tool/script changes, audit markdown, LLM eval JSON if re-run
- [ ] Do **not** commit `data/fonoran-sound-bucket.json` (gitignored)
- [ ] After Heroku deploy: Advanced → **Regenerate dictionary from git seeds** → **Run translation tests**

---

## Authority tiers (reminder)

1. **`playtest` / `human`** — locked; optimizer will not demote
2. **Human puzzle conversation** — decides preferred form
3. **`llm_consensus`** — advisory; length gate overrides when flat > 4
4. **Heuristic** — `optimize-compounds`, `--length-only` for safe bulk compression

Preferred-form policy: [fonoran.md](fonoran.md) · LLM protocol: [fonoran-llm-playtest-experiment.md](fonoran-llm-playtest-experiment.md)

---

## LLM-assisted vocabulary growth loop

The **Vocabulary Survey** is the primary way to generate new compound proposals in bulk.
Run it once to populate `data/fonoran-compound-proposals.json`; no second LLM call is
needed on subsequent `fonoran:regenerate` runs.

```bash
# Generate compound proposals across all primitive roots (requires ANTHROPIC_API_KEY)
npm run fonoran:vocab-survey

# Or target a specific batch size
npm run fonoran:vocab-survey -- --limit=50
```

Proposals land in `data/fonoran-compound-proposals.json`. Review them in the
**Review** tab at `/tools#gap-workshop`, or via the API
(`GET /api/fonoran/compound-proposals`).

For each proposal: **accept** (merges the composition into `fonoran-compounds.json` on the
next `fonoran:regenerate` run) or **reject** / **skip**.

`promoteAcceptedProposals` runs automatically as the first step of `fonoran:regenerate`,
so accepted proposals are baked into `fonoran-compounds.json` before the build begins.

```bash
# After accepting proposals, regenerate the full dictionary (promotes + rebuilds)
npm run fonoran:regenerate

# See playtest data suggesting preferred form promotions (no LLM needed)
curl http://localhost:8000/api/fonoran/playtests/promotions
```

Seed integrity — verify `ASSOCIATION_SEEDS` has no phantom component IDs:

```bash
node --input-type=module -e "
import { validateSeedIntegrity } from './tools/fonoran-expression-candidates.js';
import { loadConceptInventory } from './tools/fonoran-concepts.js';
import { readDoc } from './tools/fonoran-store.js';
const inv = await loadConceptInventory();
const c = await readDoc('compounds');
const v = validateSeedIntegrity(inv.concepts.map(x => x.id), c?.compounds ?? []);
console.log(v.length ? v : '✓ No phantom IDs');
"
```

See also: [RN-26 · LLM-assisted word generation](/research/notes/llm-assisted-word-generation)
