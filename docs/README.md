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
| 1 | **Rulebook** — the whole language, three layers, 13 rules. Start here | [fonoran-rulebook.md](fonoran-rulebook.md) |
| 2 | **Algorithm: how a concept gets its sound** | [fonoran-algorithm-roots.md](fonoran-algorithm-roots.md) |
| 3 | **Algorithm: how a compound is chosen** | [fonoran-algorithm-compounds.md](fonoran-algorithm-compounds.md) |
| 4 | **Algorithm: how English becomes Fonoran** | [fonoran-algorithm-translation.md](fonoran-algorithm-translation.md) |
| 5 | **Architecture map** — what reads what, where the fat is | [fonoran-architecture.md](fonoran-architecture.md) |
| 6 | Fonoran grammar (full syntax reference) | [fonoran-grammar.md](fonoran-grammar.md) |
| 7 | Fonoran guide (builder pipeline) | [fonoran.md](fonoran.md) |
| 8 | Compound workflow (local + Heroku) | [fonoran-compound-workflow.md](fonoran-compound-workflow.md) |
| 9 | CLI tools reference | [fonoran-cli-tools.md](fonoran-cli-tools.md) |
| 10 | Prefix-safe CV / CVC roots | [fonoran-prefix-safe-roots.md](fonoran-prefix-safe-roots.md) |
| 11 | Fonoran numerals (1–99) | [fonoran-numerals.md](fonoran-numerals.md) |
| 12 | Fonoran Learn (`/learn`) | [fonoran-learn.md](fonoran-learn.md) |
| 13 | Translator (live) | [fonoran-translator.md](fonoran-translator.md) |
| 14 | Interpretive translator (legacy) | [fonoran-interpretive-translator.md](fonoran-interpretive-translator.md) |

The first five are the living documents. Everything else is reference or workflow detail.

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
| [fonoran-constitution.md](archive/fonoran-constitution.md) | Retired July 2026. Its rules are rulebook rules 4 to 7; its hypothesis about two strangers is a claim the project no longer makes |
| [fonoran-philosophy.md](archive/fonoran-philosophy.md) | Retired July 2026. Rationale written around human playtesting and the campfire test, and it described Fonoran as explicitly *not* a deterministic compound generator, which is what it now is |
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

See [fonoran-cli-tools.md](fonoran-cli-tools.md) for the full operator command reference.
