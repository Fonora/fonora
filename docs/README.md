# Fonora documentation

Index of project docs. See **[platform-overview.md](platform-overview.md)** for the section map (Fonora, Script, Language, Tools) and the project's hypothesis.

The language is described by five living documents: the [rulebook](fonoran-rulebook.md), the three algorithm pages ([roots](fonoran-algorithm-roots.md), [compounds](fonoran-algorithm-compounds.md), [translation](fonoran-algorithm-translation.md)), and the [architecture map](fonoran-architecture.md). Everything else here is reference material or history.

The **Docs viewer** sidebar in the app mirrors this index (see `js/doc-urls.js`).

**Authoritative symbol rules:** [language-rules.md](language-rules.md) (`fonora_version: v3`).

---

## Essential

| Topic | Document |
| --- | --- |
| Platform overview | [platform-overview.md](platform-overview.md) |
| Documentation index | [README.md](README.md) |
| Project README | [../README.md](../README.md) |
| Third-party licenses | [third-party.md](third-party.md) |
| Deploy & PostgreSQL | [deploy.md](deploy.md) |
| Fonoran auth & release | [fonoran-auth-and-release.md](fonoran-auth-and-release.md) |
| Security | [../SECURITY.md](../SECURITY.md) |
| Contributing | [../CONTRIBUTING.md](../CONTRIBUTING.md) |

---

## Script layer

| Topic | Document |
| --- | --- |
| Language rules (script encoding) | [language-rules.md](language-rules.md) |
| Transliteration | [multilingual-support.md](multilingual-support.md) |
| IPA pipeline | [IPA-PIPELINE-REPORT.md](IPA-PIPELINE-REPORT.md) |
| eSpeak NG / WASM | [espeak-integration.md](espeak-integration.md) |
| Pronunciation validation | [pronunciation-validation.md](pronunciation-validation.md) |
| IPA normalization | [ipa-normalize.md](ipa-normalize.md) |

---

## Language layer (Fonoran, `/language`)

Read in this order for a new contributor:

| # | Topic | Document |
| --- | --- | --- |
| 0 | **Rulebook** (all three layers, 13 rules, plain language) | [fonoran-rulebook.md](fonoran-rulebook.md) |
| 0a | **Algorithm: how a concept gets its sound** (one page) | [fonoran-algorithm-roots.md](fonoran-algorithm-roots.md) |
| 0b | **Algorithm: how a compound is chosen** (one page) | [fonoran-algorithm-compounds.md](fonoran-algorithm-compounds.md) |
| 0c | **Algorithm: how English becomes Fonoran** (one page) | [fonoran-algorithm-translation.md](fonoran-algorithm-translation.md) |
| 0d | **Architecture map** (what reads what, where the fat is) | [fonoran-architecture.md](fonoran-architecture.md) |
| 1 | **Fonoran constitution** (read first — one page) | [fonoran-constitution.md](fonoran-constitution.md) |
| 2 | **Fonoran grammar** | [fonoran-grammar.md](fonoran-grammar.md) |
| 3 | **Philosophy & rationale** (optional deep read) | [fonoran-philosophy.md](fonoran-philosophy.md) |
| 4 | **Fonoran guide** (builder pipeline) | [fonoran.md](fonoran.md) |
| 4b | **Compound workflow (local + Heroku)** | [fonoran-compound-workflow.md](fonoran-compound-workflow.md) |
| 4c | **CLI tools reference** | [fonoran-cli-tools.md](fonoran-cli-tools.md) |
| 4d | **Prefix-safe CV / CVC roots** | [fonoran-prefix-safe-roots.md](fonoran-prefix-safe-roots.md) |
| 5 | **Fonoran numerals** (1–99) | [fonoran-numerals.md](fonoran-numerals.md) |
| 6 | **Fonoran Learn** (`/learn`) | [fonoran-learn.md](fonoran-learn.md) |
| 7 | **Translator (live)** | [fonoran-translator.md](fonoran-translator.md) |
| 8 | Interpretive translator (legacy) | [fonoran-interpretive-translator.md](fonoran-interpretive-translator.md) |

---

## Archive

Historical experiments, audits, and the retired research notebook. Not the active Fonoran workflow (see [fonoran.md](fonoran.md)).

| Document | Notes |
| --- | --- |
| [fonoran-gen3.md](archive/fonoran-gen3.md) | DDA Gen 3 experiment |
| [fonoran-gen3-1.md](archive/fonoran-gen3-1.md) | Gen 3.1 phonetic layer |
| [fonoran-generator-archive.md](archive/fonoran-generator-archive.md) | Retired bulk generators |
| [fonoran-semantic-foundation.md](archive/fonoran-semantic-foundation.md) | Semantic proposal (reference) |
| [fonoran-primitive-roots-report.md](archive/fonoran-primitive-roots-report.md) | Auto-generated roots report |
| [FONORA_CLEANUP_AUDIT.md](archive/FONORA_CLEANUP_AUDIT.md) | June 2026 cleanup audit |
| [FONORA_COLLISION_AUDIT.md](archive/FONORA_COLLISION_AUDIT.md) | Collision audit |
| [IPA_VOWEL_NORMALIZATION_AUDIT.md](archive/IPA_VOWEL_NORMALIZATION_AUDIT.md) | Vowel normalization audit |
| [FONORA_VOWEL_DECISION_REPORT.md](archive/FONORA_VOWEL_DECISION_REPORT.md) | Vowel decision report (v2) |
| [fonoran-gap-assessment.md](archive/fonoran-gap-assessment.md) | Gap audit, superseded by the rulebook |
| [fonoran-generation-2.md](archive/fonoran-generation-2.md) | Generation 2 pipeline |
| [fonoran-grammar-constitutional-audit.md](archive/fonoran-grammar-constitutional-audit.md) | Grammar audit snapshot |
| [fonoran-grammar-redesign-proposal.md](archive/fonoran-grammar-redesign-proposal.md) | Grammar proposal, not adopted as written |
| [fonoran-learning-sessions-log.md](archive/fonoran-learning-sessions-log.md) | Learnability session log |
| [fonoran-llm-playtest-experiment.md](archive/fonoran-llm-playtest-experiment.md) | LLM playtest protocol and results |
| [research-notes/](archive/research-notes/README.md) | 38 research notes, retired July 2026 |

**Generated (not committed):** `npm run fonoran:compound-audit` writes a live compound report to `reports/`.

---

## Tests (CLI)

| Command | Purpose |
| --- | --- |
| `npm test` | Unit/integration + golden translator regression |
| `npm run test:pronunciation-validation` | IPA round-trip report |
| `npm run fonoran:build` | Converged Fonoran pipeline |
| `npm run fonoran:compound-audit` | Live compound count and quality report |
| `npm run fonoran:translation-gaps` | What the corpus cannot say yet |
| `npm run fonoran:verify-quarantine` | Fail if deterministic code depends on model output |
| `npm run fonoran:import` / `fonoran:export` | PostgreSQL bucket sync |

See [fonoran-cli-tools.md](fonoran-cli-tools.md) for the full operator command reference.
