# Fonoran compound workflow (local + production)

> **Read first:** [fonoran-constitution.md](fonoran-constitution.md) (one page) · Agent rules: [CLAUDE.md](../CLAUDE.md)

> Sequential commands for producing and shipping vocabulary from editorial inputs through **deterministic four-rules regeneration**, build, audit, and deploy. Every command here is deterministic, and no step calls a model.
>
> See also: [fonoran.md](fonoran.md) (pipeline overview), [deploy.md](deploy.md) (Heroku), [fonoran-constitution.md](fonoran-constitution.md) (success criteria).

## Build vs regenerate — which command?

```mermaid
flowchart TD
  Q{"What changed?"}
  Q -->|"Editorial JSON only\n(compounds.json, seeds)"| Build["npm run fonoran:build:approved\nrebuilds lab from git seeds"]
  Q -->|"Heroku deploy\nor accepted proposals"| Regen["npm run fonoran:regenerate\nimport seeds → promote proposals → build"]
  Q -->|"Fresh clone / reset lab"| Reset["npm run fonoran:reset\nthen build"]
  Build --> Local["Local: JSON bucket or Postgres"]
  Regen --> Prod["Production: Advanced UI\nor heroku run regenerate"]
```

| Situation | Command | Why |
| --- | --- | --- |
| Edited `compounds.json` locally | `fonoran:build:approved` | Rebuilds lab from editorial JSON |
| Merged to Heroku | **`fonoran:regenerate`** (not build alone) | Postgres still has old editorial state until import + full pipeline |
| Accepted proposals in Review | `fonoran:regenerate` | Promotes queue → compounds.json → build |
| Destructive fresh start | `fonoran:reset` then `build` | Wipes lab |

---

## Storage paths (local vs production)

```mermaid
flowchart TB
  subgraph git [Git seeds — committed]
    Compounds["fonoran-compounds.json"]
    Inventory["fonoran-concept-inventory.json"]
    Roots["fonoran-approved-roots.json"]
  end
  subgraph local [Local dev — no DATABASE_URL]
    JSONLab["fonoran-sound-bucket.json\ngitignored"]
    JSONProp["fonoran-compound-proposals.json"]
  end
  subgraph prod [Production — DATABASE_URL set]
    PGLab["PostgreSQL lab rows"]
    PGProp["PostgreSQL proposal queue"]
  end
  git -->|"fonoran:build"| JSONLab
  git -->|"fonoran:regenerate"| PGLab
  git -->|"editorial:import"| PGLab
```

---

## What gets committed vs what stays runtime-only

| In git (seed / editorial) | Runtime only (not in git) |
| --- | --- |
| `data/fonoran-compounds.json` — preferred forms + alternates | `data/fonoran-sound-bucket.json` — built lab (gitignored) |
| `data/fonoran-concept-inventory.json` | Live PostgreSQL lab rows on Heroku |
| `data/fonoran-approved-roots.json` | |
| `data/fonoran-root-candidates.json` | |
| `data/fonoran-compound-proposals.json` — proposal queue (JSON mirror; **Postgres on Heroku**) | |
| `tools/fonoran-expression-candidates.js` — `ASSOCIATION_SEEDS` | |

**Build** reads editorial JSON → writes the lab bucket. Production Postgres is seeded once from git; later updates require an explicit import + rebuild (below).

---

## Local: from scratch (full pipeline)

Use when resetting the lab or onboarding a fresh clone.

```bash
npm install
cp .env.example .env          # optional: DATABASE_URL, OAuth

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

# 1. Deterministic four-rules regeneration (the only path)
npm run fonoran:regen:four-rules -- --dry-run
npm run fonoran:regen:four-rules -- --apply
#    Skips playtest/human/locked rows; ranks by campfire + four rules.

# 2. Rebuild lab from editorial JSON
npm run fonoran:build:approved

# 3. Audit + tests
npm run fonoran:seed-quality-audit
npm run fonoran:compound-confusability
npm run fonoran:compound-audit -- --out=reports/fonoran-compound-audit.md
npm test

# 4. Lock a human decision
# Set preferred_source to "human" in compounds.json so the scorer cannot demote it

# 5. Commit seed files (see checklist below)
git add data/fonoran-compounds.json tools/fonoran-expression-candidates.js ...
git commit -m "..."
```

### Expected audit after four-rules pass

- **Flattened length warnings (>4 roots):** `0`
- **Seed-quality gate:** ≥92% pass, 0 hard failures
- Tree mismatches vs old semantic-demo trees are informational (preferred forms follow ASSOCIATION_SEEDS + four rules)

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
```

**Step C — verify**

```bash
heroku open /language -a fonora
# or
curl -s https://fonora.org/health
# Dictionary: search "world" → should show fenfo (earth + life)
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
| Rank preferred forms | `npm run fonoran:regen:four-rules -- --apply` | yes | yes |
| Build lab | `npm run fonoran:build:approved` | yes | yes |
| Audit | `npm run fonoran:compound-audit` | yes | optional |
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
- [ ] Commit: `data/fonoran-compounds.json`, `tools/fonoran-expression-candidates.js`, tool/script changes
- [ ] Do **not** commit `data/fonoran-sound-bucket.json` (gitignored)
- [ ] After Heroku deploy: Advanced → **Regenerate dictionary from git seeds** → **Run translation tests**

---

## Authority tiers (reminder)

```mermaid
flowchart TB
  subgraph locked [Locked — optimizer will not demote]
    Playtest["human / playtest\nhuman decision, locked"]
  end
  subgraph scored [Scored]
    Rules["four_rules\ncampfire + four rules"]
  end
  Playtest -->|"constitutional authority"| Preferred["preferred form\nin compounds.json"]
  Rules --> Preferred
```

1. **`human`** — a person chose this form; locked, the scorer will not demote it
2. **`playtest`** — historical provenance from the retired guess-the-meaning game; also human, also locked
3. **`four_rules`** — deterministic scoring for everything not locked, with the length gate overriding when flat > 4

Preferred-form policy: [fonoran.md](fonoran.md)

---

## Vocabulary growth (model paths deleted)

Vocabulary is no longer generated or judged by models. New words are added by editing the
seeds (`data/fonoran-concept-inventory.json`, `data/fonoran-compounds.json`) and rerunning
the deterministic pipeline described in
[fonoran-algorithm-roots.md](fonoran-algorithm-roots.md) and
[fonoran-algorithm-compounds.md](fonoran-algorithm-compounds.md).

The survey, refine loop, model playtest, and intuition scripts were **deleted** in July 2026.
`data/fonoran-llm-quarantine.json` lists what remains reachable, and
`npm run fonoran:verify-quarantine` fails the build if deterministic code gains a new
dependency on model code or model output. The proposal store and Review UI remain usable for
human-authored proposals.

### Storage reminder

| Environment | Editorial + proposal queue | Gap artifacts |
|-------------|---------------------------|-------------------------|
| Local dev (default) | `FONORAN_STORAGE=json` — `data/fonoran-*.json` | `data/` + fonora-data submodule |
| Heroku production | `FONORAN_STORAGE=postgres` + `DATABASE_URL` | fonora-data submodule (not Postgres) |

Promote → build → gap report **must** use the same storage backend. Mixing a JSON promote with
a Postgres build silently drops coverage gains.

### Seed integrity

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

See also:

- [fonoran-algorithm-compounds.md](fonoran-algorithm-compounds.md) — how a preferred compound is chosen
- [fonoran-architecture.md](fonoran-architecture.md) — what reads what
