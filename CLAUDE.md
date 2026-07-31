# Fonora / Fonoran — agent instructions

## The architecture. Read this first, and re-read it before you add a file

```
source language  ──►  third-party parser  ──►  language-neutral meaning  ──►  Fonoran
   (any)               (owns the language)         (roles + concepts)        (dictionary
                                                                              + grammar
                                                                              rules)
```

Four rules follow from that picture. They are not aspirations; they are the shape of
the system, and work that violates them is wrong even when it passes the tests.

**1. We do not implement any human language.** A third-party library owns the source
language: how English inflects, what part of speech a word is, where a clause ends.
If you are writing a lemmatizer, a word list, an irregular table, a suffix rule, or a
pattern that matches a particular English construction, stop. That knowledge is
someone else's maintained dependency and ours will always be a worse copy of it. A
different source language must be a different parser, not a second pipeline.

**2. There are exactly two sources of truth, and they are data.** The dictionary
(`data/fonoran-concept-inventory.json`, `fonoran-approved-roots.json`,
`fonoran-compounds.json`) and the grammar rules (`fonoran-rulebook.md` with
`data/fonoran-grammar-*.json`). Every answer comes from those. A fact hardcoded in
code is a copy that will rot, and it has: English "not" once pointed at `ko`, the
live root for *to drink*.

**3. One engine, no exceptions.** Translator, Learn, and the alignment view are the
same call with the same input and the same output. A surface that needs something
different needs the engine to return more, never its own logic. If two surfaces can
disagree, that is a bug in the architecture, not a difference in features.

**4. Say it once.** Two copies of a rule means one of them is already wrong. Before
adding a constant, a list, or a helper, search for it: it usually exists. This
codebase has had three separate English lemmatizers at once, all with the same bug.

**The honest gap.** The boundary in the diagram now exists in code:
`tools/fonoran-source-parsers.js` is the parser registry, `sourceLang` selects a
parser from it (an uninstalled language is refused honestly, never silently read as
English), and a parser hands the engine a language-neutral slot structure that names
grammar facts by particle id and concepts by concept id — never a Fonoran spelling.
English is the one installed parser (`tools/fonoran-source-english.js` plus the
wink-nlp-backed parse/morphology modules, ~1,200 lines), and `wink-nlp` owns part of
speech, lemma, and clause shape. Resolution is parameterized too: the parser supplies
its language code and morphology hooks, and `buildResolveContext` loads
`localizations/<lang>.json` and lemmatizes through those hooks — a stub non-English
parser in the test suite proves the engine side of the contract end to end. What
remains: only an English localization seed exists, the curated interpretation rules
(`data/fonoran-interpretation-rules.json` and the word lists in
`fonoran-interpretation.js`) are English data with no per-language equivalent yet,
and no real second parser has been installed. Adding a language means adding a parser
module and a localization seed, never adding rules to the engine. That is the
standing priority; every change should move toward the diagram, and none should move
away from it. When you are unsure whether something is an exception worth making, it
is not. Ask.

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

**Agents: never commit or push until `npm test` passes.** Translator/lexicon/seed surface changes usually need golden refresh in the same change set (`node scripts/fonoran-translation-gaps.js --update-golden` or `npm run test:translator:update`). Learn phrase roman is compiled at runtime by the deterministic translator (`GET /api/fonoran/learn/course-phrases`), but the committed offline snapshot is freshness-gated: `npm run fonoran:course-phrases:check` runs in `npm test`, so a surface change also needs `node tools/fonoran-course-phrases-build.js` in the same change set. Do not leave CI golden failures for the human to clean up.

Admin tools: `/tools#word-manager` (requires `ADMIN_EMAILS` when OAuth is configured).
