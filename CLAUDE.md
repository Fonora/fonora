# Fonora / Fonoran — agent instructions

Read this before editing language data, running LLM pipelines, or changing documentation.

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

## Project identity

- **Fonora** — phonetic script (9 symbols, `docs/language-rules.md`, `fonora_version: v3`)
- **Fonoran** — constructed language built on the script
- **Seeds in `data/`** — canonical editorial state (`fonoran-compounds.json`, `fonoran-concept-inventory.json`, `fonoran-approved-roots.json`)
- **Runtime lab** — `fonoran-sound-bucket.json` or Postgres; rebuilt from seeds, not the source of truth

## Editorial rules

1. **Seeds are truth** — Word Manager saves must update editorial JSON via `tools/fonoran-editorial-sync.js`
2. **Human owns the lexicon** — never bulk-invent vocabulary via LLM without admin edit + seed write
3. **LLMs advise, not invent** — translation and cross-cultural simulation OK; bulk vocab survey requires explicit approval. Preferred compound forms are chosen by four-rules scoring (`npm run fonoran:regen:four-rules`), not LLM validators
4. **Four constitution rules** — universal phonetics, audible distinction, lego recoverability (≤4 roots), no double consonants — enforced at seed layer
5. **No ancient-tribe framing** in LLM prompts — frame as two strangers with shared roots piecing meaning together

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

- Run expensive LLM pipelines (`fonoran:vocab-survey`, `fonoran:llm-intuition` full run) without verifying seeds or proposals were written
- Treat lab bucket edits as permanent without syncing to `data/*.json`
- Scatter the four rules across research notes — they live only in the Constitution
- Commit secrets (`.env`, API keys)

## Development

```bash
npm install
npm start          # http://localhost:8000
npm test           # REQUIRED before every commit / PR
```

**Agents: never commit or push until `npm test` passes.** `npm test` includes `research:verify-md` (RN-31+: **no em dashes** `—` in research notes; use commas/colons/sentences). Translator/lexicon/seed surface changes usually need golden refresh in the same change set (`node scripts/fonoran-translation-gaps.js --update-golden` or `npm run test:translator:update`). Learn phrase roman is compiled at runtime from the translation cache (`GET /api/fonoran/learn/course-phrases`), so lexicon respells do **not** require a course-phrases rebuild for Learn freshness. Optionally refresh the committed offline snapshot with `node tools/fonoran-course-phrases-build.js --force --cache-only` when you want CI fixtures / static fallback updated. Do not leave CI golden failures for the human to clean up.

Admin tools: `/tools#word-manager` (requires `ADMIN_EMAILS` when OAuth is configured).
