# Fonora / Fonoran — agent instructions

Read this before editing language data, seeds, or documentation.

## Read first

**[docs/fonoran-rulebook.md](docs/fonoran-rulebook.md)** — the whole language on one page: three layers, thirteen rules. When in doubt, the rulebook wins.

## Doc hierarchy

| Doc | Purpose |
| --- | --- |
| [fonoran-rulebook.md](docs/fonoran-rulebook.md) | The 13 language rules. The authority |
| [fonoran-algorithm-roots.md](docs/fonoran-algorithm-roots.md) | How a concept gets its sound |
| [fonoran-algorithm-compounds.md](docs/fonoran-algorithm-compounds.md) | How a compound is chosen |
| [fonoran-algorithm-translation.md](docs/fonoran-algorithm-translation.md) | How English becomes Fonoran |
| [fonoran-architecture.md](docs/fonoran-architecture.md) | What each module owns |
| [fonoran-grammar.md](docs/fonoran-grammar.md) | Full syntax reference |
| [fonoran-compound-workflow.md](docs/fonoran-compound-workflow.md) | Edit → build → commit → deploy |
| [fonoran-cli-tools.md](docs/fonoran-cli-tools.md) | CLI command reference |

The first five are the living documents. There is no separate philosophy or founding document: the rules are the rules, and the rationale for a rule sits next to it.

## Project identity

- **Fonora** — phonetic script (9 symbols, `docs/language-rules.md`, `fonora_version: v3`)
- **Fonoran** — constructed language built on the script
- **Seeds in `data/`** — canonical editorial state (`fonoran-compounds.json`, `fonoran-concept-inventory.json`, `fonoran-approved-roots.json`)
- **Runtime lab** — `fonoran-sound-bucket.json` or Postgres; rebuilt from seeds, not the source of truth

## Editorial rules

1. **Seeds are truth** — Word Manager saves must update editorial JSON via `tools/fonoran-editorial-sync.js`
2. **Human owns the lexicon** — vocabulary is authored by hand in the seeds, never generated
3. **No models in the language** — model-driven proposal, ranking, playtest, and translation pipelines were deleted in July 2026, and nothing in this repository talks to a model. Deterministic code may not depend on model code or model output, and `npm run fonoran:verify-quarantine` fails the build if it does. `data/fonoran-llm-quarantine.json` is empty and must stay that way; the one declared allowance is model-drafted **English** prompt text, which says what to translate and never what the answer is
4. **The four word rules** (rulebook rules 4 to 7) — universal phonetics, audible distinction, lego recoverability (≤4 roots), no double consonants — enforced at seed layer

## Version control

| What changed | Bump |
| --- | --- |
| Seed / compound / inventory editorial | `package.json` patch version |
| Grammar particles or sentence template | `fonoran-rulebook.md` + `fonoran-grammar.md` + `data/fonoran-grammar-particles.json` |
| Script encoding | `docs/language-rules.md` `fonora_version` + tests |
| Seed schema milestone | `version` field in affected `data/fonoran-*.json` |

Document version bumps in the commit message.

## Documentation hygiene

| Change | Update |
| --- | --- |
| Any of the 13 rules, rings, caps | `fonoran-rulebook.md` only |
| How an algorithm decides | the matching `fonoran-algorithm-*.md` |
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
- Scatter the rules across docs — they live only in the rulebook
- Commit secrets (`.env`, API keys)

## Development

```bash
npm install
npm start          # http://localhost:8000
npm test           # REQUIRED before every commit / PR
```

**Agents: never commit or push until `npm test` passes.** Translator/lexicon/seed surface changes usually need golden refresh in the same change set (`node scripts/fonoran-translation-gaps.js --update-golden` or `npm run test:translator:update`). Learn phrase roman is compiled at runtime by the deterministic translator (`GET /api/fonoran/learn/course-phrases`), so lexicon respells do **not** require a course-phrases rebuild for Learn freshness. Optionally refresh the committed offline snapshot with `node tools/fonoran-course-phrases-build.js` when you want CI fixtures / static fallback updated. Do not leave CI golden failures for the human to clean up.

Admin tools: `/tools#word-manager` (requires `ADMIN_EMAILS` when OAuth is configured).
