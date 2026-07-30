# Architecture: how it is all connected

> **One page. What reads what, where the truth lives, and where the fat is.**
> Everything below is measured from the real import graph, not remembered. Regenerate the counts with `node scripts/fonoran-verify-llm-quarantine.js --map`.
>
> **The five source-of-truth docs:** [rulebook](fonoran-rulebook.md), [roots](fonoran-algorithm-roots.md), [compounds](fonoran-algorithm-compounds.md), [translation](fonoran-algorithm-translation.md), and this page.

## The shape in one diagram

```mermaid
flowchart LR
  subgraph edit [You, editing]
    SEED["data/*.json seeds\nconcept inventory, compounds\napproved roots, config"]
  end

  subgraph algo [Deterministic algorithms]
    A1["root sounds\nfonoran-build.js"]
    A2["compound choice\nregen-four-rules.js"]
    A3["translation\nfonoran-translator.js"]
  end

  subgraph runtime [Runtime inventory]
    LAB["fonoran-sound-bucket.json\nthe lab bucket"]
  end

  OUT["roman + script + gaps"]

  SEED --> A1
  A1 --> LAB
  SEED --> A2
  A2 --> SEED
  LAB --> A3
  A3 --> OUT
```

Read that middle path carefully, because it is the whole problem. Root generation writes the **lab bucket**, and translation reads the **lab bucket**, not the seeds. Editing a seed changes nothing a reader can see until the build runs.

## Where the truth lives, and why that broke

The same document can exist in four places at once.

```mermaid
flowchart TD
  MEM["1. in-process docCache"]
  PG["2. Postgres rows\nactive whenever DATABASE_URL is set"]
  GIT["3. data/*.json in git\ndeclared the source of truth"]
  EXT["external/fonora-data submodule\nphrase corpus, gap reports, test snapshots"]
  READ["readDoc\npicks the first one it finds"]
  ALGOS["every algorithm"]
  BUILD["fonoran-build"]
  LAB["lab bucket\nrebuilt from git, read by the translator"]
  TRANSLATE["translator"]

  MEM -->|"first"| READ
  PG -->|"second"| READ
  GIT -->|"only as fallback"| READ
  EXT --> READ
  READ --> ALGOS
  GIT --> BUILD
  BUILD --> LAB
  LAB --> TRANSLATE
```

`readDoc` returns the memory cache if warm, then Postgres if configured, and only falls back to the git seed file. So on any machine with `DATABASE_URL` set, **the file you just edited is the last place the code looks.**

That is the mechanism behind translations that looked finished while running on the wrong seeds. There is no bug to find. It is the design: eight documents are store-managed and can diverge from git, and a fifth copy of the vocabulary lives in the lab bucket that the translator actually reads.

| Store-managed doc | Seed path |
| --- | --- |
| concept_inventory | `data/fonoran-concept-inventory.json` |
| approved_roots | `data/fonoran-approved-roots.json` |
| compounds | `data/fonoran-compounds.json` |
| root_candidates | `data/fonoran-root-candidates.json` |
| phonetics_config | `data/fonoran-primitive-roots-config.json` |
| localization_en | `data/localizations/en.json` |
| llm_evaluations | external data dir when configured |

## The three pipelines, in detail

```mermaid
flowchart TD
  INV["concept-inventory.json\n135 concepts + priority class"]
  CFG["primitive-roots-config.json\nonsets, vowels, caps"]
  APPR["approved-roots.json\n135 spellings"]
  COMP["compounds.json\n454 compounds"]
  LEX["lab bucket"]

  subgraph roots [1. Root sounds]
    P1["priority order\nclass x 1000 minus index"]
    POOL["syllable pool\nCV then CVC, cost sorted"]
    PICK["score + hard blocks\nprefix-safe, no r or j, no doubles"]
  end

  subgraph compounds [2. Compound choice]
    POOL2["candidate pool\nseeds + current + alternates"]
    SCORE["6-factor recoverability\ntimes campfire multiplier"]
    GATE["validity gates\nunique segmentation is the big one"]
    PROMOTE["promote only past 0.02 margin"]
  end

  subgraph translate [3. Translation]
    TOK["tokenize + merge phrases"]
    SLOT["assign 5 slots\nActor Action Target Place Time"]
    RES["7-tier resolution\nnever guesses"]
    REND["render roman + script"]
    GAPS["unresolved list\nanything unsayable"]
  end

  INV --> P1
  CFG --> POOL
  P1 --> PICK
  POOL --> PICK
  APPR -->|"locked, never respelled"| PICK
  PICK --> APPR

  COMP --> POOL2
  POOL2 --> SCORE
  SCORE --> GATE
  GATE --> PROMOTE
  PROMOTE --> COMP

  APPR --> LEX
  COMP --> LEX
  EN["English text"] --> TOK
  TOK --> SLOT
  SLOT --> RES
  LEX --> RES
  RES --> REND
  REND --> GAPS
```

## How big it actually is

Each row is the transitive import closure of one entry point, so a module needed by two stages is counted in both.

| Scope | Entry point | JS modules |
| --- | --- | --- |
| Root generation, everything it needs | `tools/fonoran-root-sound-assign.js` | 8 |
| Compound selection, everything it needs | `tools/fonoran-preferred-select.js` | 16 |
| Translation, everything it needs | `tools/fonoran-translate.js` | 48 |
| **The language, all three combined** | | **56** |
| Booting the web server | `server.js` | 72 |
| The whole repo, excluding vendored code | | 236 |

Supporting cast: 112 browser files under `js/`, 75 under `tools/`, 40 under `scripts/`, 38 vendored text-to-speech files, 47 JSON files in `data/`, and 9 more in the external data repo.

**31 of the 75 `tools/` files are not part of the language at any point.**

## So could it be five files?

Not five, but 56 is not defensible either. The honest breakdown of what translation's 48 modules are doing: a large part is English-side machinery rather than Fonoran, namely the tokenizer, lemmatizer, irregular verb tables, phrase merging, interpretation rules, and concept bridges. Fonoran itself is small. Understanding English is what sprawled.

A realistic target is one module per stage, so roughly 10 to 15 for the language, with the English front end isolated in one place instead of threaded through everything.

## The fat, named

Measured, not guessed. Each is a candidate, not a decision.

**Nothing outside `vendor/` is currently unreachable.** Every JS file is imported by another module, named in an npm script, or loaded by a `<script>` tag. The eleven files this section used to list have been deleted, except `scripts/fonoran-word-ownership.js`, which turned out to be a live maintenance CLI: it writes `data/fonoran-word-ownership.json`, which `tools/fonoran-invariants.js` reads on every `npm test`.

**A dead-code sweep must check HTML script tags as well as imports**, or it will propose deleting the main page. No JS file imports these:

| File | Entry point |
| --- | --- |
| `language/fonoran-app.js` | `language/index.html`, the whole `/language` page |
| `showcase/showcase.js` | `showcase/index.html` |

**Structural fat, in the order that would help most:**

1. **Collapse the store to one source.** Delete the Postgres path and the lab bucket, read seeds directly. This removes the class of bug that cost you the most, and it is what the Cursor-based workflow needs: edit seed, regenerate, done.
2. **Isolate the English front end.** The tokenizer, lemmatizer, irregular verb tables, phrase merging, and interpretation rules are why translation needs 48 modules to Fonoran's handful. They are one subsystem threaded through everything rather than one module.
3. **The GUI.** If the workflow is you and me editing seeds directly, then Word Manager and the proposal review screens are surface area maintaining a second way to change the language.

## Where the truth lives

If this page and the code disagree, the code wins, and this page is the bug.

| Thing | Source |
| --- | --- |
| Store layering and doc keys | `tools/fonoran-store.js` |
| External data paths | `tools/fonoran-data-paths.js` |
| Import graph and LLM boundary | `scripts/fonoran-verify-llm-quarantine.js` |
| Build pipeline | `tools/fonoran-build.js` |
