# Fonora documentation

Index of project docs. See **[platform-overview.md](platform-overview.md)** for the section map (Fonora, Script, Language, Research, Tools) and the project's hypothesis.

For the *story* of how the project evolved — each experiment as a research note — see the **[Research notebook](/research)** and its **[timeline](/research/timeline)**. The notebook is the narrative layer; the docs below are the reference layer it links to.

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
| Fonora encoding rules | [language-rules.md](language-rules.md) |
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
| 1 | **Fonoran constitution** | [fonoran-constitution.md](fonoran-constitution.md) |
| 2 | **Fonoran guide** | [fonoran.md](fonoran.md) |
| 3 | Fonoran grammar | [fonoran-grammar.md](fonoran-grammar.md) |
| 4 | Interpretive translator | [fonoran-interpretive-translator.md](fonoran-interpretive-translator.md) |

---

## Research notebook (`/research`)

Narrative research notes (one per major experiment), authored in `docs/research/`. Open the rendered notebook at [/research](/research); each note links back to the reference docs and tools below.

| Era | Notes |
| --- | --- |
| Phase I: Writing sound | the articulation grid, IPA pipeline, vowel v2 → v3, multilingual script, collision audit |
| Phase II: Inventing a language | Gen 1/2 roots, Gen 3 DDA, Gen 3.1 distinctiveness, the 200-primitive allocation |
| Phase III: A usable language | semantic foundation, the Constitution, the editorial pipeline, grammar particles, the translator, typing, puzzle conversation |
| Phase IV: Reconstructing compounds | teaching trees, meaning-attempts, seed expansion, playtest-driven preferred forms |

---

## Archive

Historical experiments and audits, preserved as primary sources for the research notes above. Not the active Fonoran workflow (see [fonoran.md](fonoran.md)).

| Document | Notes |
| --- | --- |
| [fonoran-gen3.md](fonoran-gen3.md) | DDA Gen 3 experiment |
| [fonoran-gen3-1.md](fonoran-gen3-1.md) | Gen 3.1 phonetic layer |
| [fonoran-generator-archive.md](fonoran-generator-archive.md) | Retired bulk generators |
| [fonoran-semantic-foundation.md](fonoran-semantic-foundation.md) | Semantic proposal (reference) |
| [fonoran-primitive-roots-report.md](fonoran-primitive-roots-report.md) | Auto-generated roots report |
| [FONORA_CLEANUP_AUDIT.md](FONORA_CLEANUP_AUDIT.md) | June 2026 cleanup audit |
| [FONORA_COLLISION_AUDIT.md](FONORA_COLLISION_AUDIT.md) | Collision audit |
| [IPA_VOWEL_NORMALIZATION_AUDIT.md](IPA_VOWEL_NORMALIZATION_AUDIT.md) | Vowel normalization audit |
| [FONORA_VOWEL_DECISION_REPORT.md](FONORA_VOWEL_DECISION_REPORT.md) | Vowel decision report (v2) |

**Not in sidebar:** [fonoran-root-workflow.md](fonoran-root-workflow.md) is a stub redirecting to [fonoran.md#pipeline](fonoran.md#pipeline).

---

## Tests (CLI)

| Command | Purpose |
| --- | --- |
| `npm test` | Unit/integration (`?test` in browser) |
| `npm run test:pronunciation-validation` | IPA round-trip report |
| `npm run fonoran:build` | Converged Fonoran pipeline |
| `npm run fonoran:import` / `fonoran:export` | PostgreSQL bucket sync |

See [README.md](../README.md) for the full test list.
