# Fonora / Fonoran — agent instructions

Read this before editing language data, seeds, or documentation.

## Read first

**[docs/fonoran-constitution.md](docs/fonoran-constitution.md)** — hypothesis, four rules, vocabulary tiers, grammar skeleton, seeds-are-truth. One page. When in doubt, the Constitution wins.

## Doc hierarchy

| Doc | Purpose |
| --- | --- |
| [fonoran-constitution.md](docs/fonoran-constitution.md) | Rules everyone follows |
| [fonoran-grammar.md](docs/fonoran-grammar.md) | Full syntax reference |
| [fonoran-philosophy.md](docs/fonoran-philosophy.md) | Why and how we judge (optional deep read) |
| [fonoran-compound-workflow.md](docs/fonoran-compound-workflow.md) | Edit → build → commit → deploy |
| [fonoran-cli-tools.md](docs/fonoran-cli-tools.md) | CLI command reference |
| [fonoran-rulebook.md](docs/fonoran-rulebook.md) | The 13 language rules |
| [fonoran-architecture.md](docs/fonoran-architecture.md) | What each module owns |

## Project identity

- **Fonora** — phonetic script (9 symbols, `docs/language-rules.md`, `fonora_version: v3`)
- **Fonoran** — constructed language built on the script
- **Seeds in `data/`** — canonical editorial state (`fonoran-compounds.json`, `fonoran-concept-inventory.json`, `fonoran-approved-roots.json`)
- **Runtime lab** — `fonoran-sound-bucket.json` or Postgres; rebuilt from seeds, not the source of truth

## Editorial rules

1. **Seeds are truth** — Word Manager saves must update editorial JSON via `tools/fonoran-editorial-sync.js`
2. **Human owns the lexicon** — vocabulary is authored by hand in the seeds, never generated
3. **No models in the language** — model-driven proposal, ranking, and playtest pipelines were deleted in July 2026. Deterministic code may not depend on model code or model output, and `npm run fonoran:verify-quarantine` fails the build if it does. Remaining exceptions are listed in `data/fonoran-llm-quarantine.json` and all belong to Learn
4. **Four constitution rules** — universal phonetics, audible distinction, lego recoverability (≤4 roots), no double consonants — enforced at seed layer

## Version control

| What changed | Bump |
| --- | --- |
| Seed / compound / inventory editorial | `package.json` patch version |
| Grammar particles or sentence template | Constitution skeleton + `fonoran-grammar.md` + `data/fonoran-grammar-particles.json` |
| Script encoding | `docs/language-rules.md` `fonora_version` + tests |
| Seed schema milestone | `version` field in affected `data/fonoran-*.json` |

Document version bumps in the commit message.

## Documentation hygiene

| Change | Update |
| --- | --- |
| Hypothesis, 4 rules, tiers | `fonoran-constitution.md` only |
| Why / playtest authority / campfire rationale | `fonoran-philosophy.md` |
| Grammar syntax detail | `fonoran-grammar.md` |
| Seed workflow / CLI | `fonoran-compound-workflow.md`, `fonoran-cli-tools.md` |
| New doc added | `docs/README.md`, `js/doc-urls.js` |

## Build vs regenerate

| Situation | Command |
| --- | --- |
| Regenerate preferred compounds (deterministic) | `npm run fonoran:regen:four-rules -- --apply` |
| Edited seed JSON locally | `npm run fonoran:build:approved` |
| Accepted proposals / Heroku deploy | `npm run fonoran:regenerate` |

Deploy does **not** auto-rebuild vocabulary. After `git push heroku`, run regenerate on production.

## Do not

- Add a dependency on model code or model output from deterministic code
- Treat lab bucket edits as permanent without syncing to `data/*.json`
- Scatter the four rules across docs — they live only in the Constitution
- Commit secrets (`.env`, API keys)

## Development

```bash
npm install
npm start          # http://localhost:8000
npm test           # REQUIRED before every commit / PR
```

**Agents: never commit or push until `npm test` passes.** Translator/lexicon/seed surface changes usually need golden refresh in the same change set (`node scripts/fonoran-translation-gaps.js --update-golden` or `npm run test:translator:update`). Learn phrase roman is compiled at runtime from the translation cache (`GET /api/fonoran/learn/course-phrases`), so lexicon respells do **not** require a course-phrases rebuild for Learn freshness. Optionally refresh the committed offline snapshot with `node tools/fonoran-course-phrases-build.js --force --cache-only` when you want CI fixtures / static fallback updated. Do not leave CI golden failures for the human to clean up.

Admin tools: `/tools#word-manager` (requires `ADMIN_EMAILS` when OAuth is configured).
