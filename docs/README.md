# Fonora documentation

Index of project docs organized by platform layer. See **[platform-overview.md](platform-overview.md)** for the architecture diagram and audience paths.

**Authoritative symbol rules:** [`language-rules.md`](language-rules.md) (`fonora_version: v3`), loaded at runtime; edit to change symbols, sound grid, and vowel mappings.

---

## Script Layer

The Fonora phonetic writing system, symbols, encoding rules, transliteration, and validation.

| Topic | Document | App tab |
| --- | --- | --- |
| **Encoding rules** (authoritative) | [language-rules.md](language-rules.md) | Docs |
| Sound Grid | - | `#grid` |
| Symbols / Alphabet | - | `#alphabet` |
| Transliteration | [multilingual-support.md](multilingual-support.md) | `#translator`, `#reader`, `#breakdown`, `#samples` |
| Symbol input | - | `#keyboard`, `#reverse` |
| Script learning | - | `#quiz` |
| IPA pipeline architecture | [IPA-PIPELINE-REPORT.md](IPA-PIPELINE-REPORT.md) | Docs |
| Consonant IPA normalization | [ipa-normalize.md](ipa-normalize.md) | Docs |
| eSpeak NG / WASM | [espeak-integration.md](espeak-integration.md) | Docs |
| Pronunciation Validation (automated round-trip) | [pronunciation-validation.md](pronunciation-validation.md) | `#pronunciation-validation` |
| Pronunciation Testing (manual review) | - | `#encoder-testing` |
| Symbol collision analysis | [FONORA_COLLISION_AUDIT.md](FONORA_COLLISION_AUDIT.md) | Docs |
| Vowel normalization audit | [IPA_VOWEL_NORMALIZATION_AUDIT.md](IPA_VOWEL_NORMALIZATION_AUDIT.md) | Docs |
| Historical v2 vowel analysis | [FONORA_VOWEL_DECISION_REPORT.md](FONORA_VOWEL_DECISION_REPORT.md), **superseded by v3** | Docs |

---

## Language Layer

**Fonoran**: the experimental constructed language written in Fonora.

| Topic | Document | App |
| --- | --- | --- |
| Fonoran language overview | [fonoran.md](fonoran.md) | `/fonoran/` |
| Root words | [fonoran.md](fonoran.md#language-model) | `/fonoran/` (Roots) |
| Compounds | [fonoran.md](fonoran.md#language-model) | `/fonoran/` (Word Creator) |
| Dictionary | [fonoran.md](fonoran.md#ui-tabs) | `/fonoran/#dictionary` |
| DDA semantics (Gen 3) | [fonoran-gen3.md](fonoran-gen3.md) | Docs |
| DDA phonetic layer (Gen 3.1) | [fonoran-gen3-1.md](fonoran-gen3-1.md) | Docs |
| Generator history (Gen 1/2 archive) | [fonoran-generator-archive.md](fonoran-generator-archive.md) | Docs |

Live vocabulary: `data/fonoran-sound-bucket.json` (gitignored). Reference Gen 3/3.1 JSON is read-only seed data for DDA and the English meaning picker.

---

## Language Builder Tools

Suite for creating, reviewing, testing, and exploring Fonoran.

| Tool | Document | App |
| --- | --- | --- |
| Root Creator | [fonoran.md](fonoran.md#ui-tabs) | `/fonoran/` (Roots) |
| Word Creator | [fonoran.md](fonoran.md#ui-tabs) | `/fonoran/` |
| Review Tools | [fonoran.md](fonoran.md#ui-tabs) | `/fonoran/` (Review) |
| Language Explorer | [fonoran.md](fonoran.md#ui-tabs) | `/fonoran/` (Dictionary, Roots) |
| Semantic Analysis (Health, Run DDA) | [fonoran.md](fonoran.md#ui-tabs) | `/fonoran/` (Health, Advanced) |
| Story Mode | [fonoran-generator-archive.md](fonoran-generator-archive.md), **planned / archived** | - |

CLI: `npm run fonoran:gen3`, `fonoran:gen3:1`, `fonoran:canonical:init`, `fonoran:stress-test`, etc.

---

## Platform & operations

| Topic | Document | App |
| --- | --- | --- |
| Platform overview | [platform-overview.md](platform-overview.md) | Docs |
| Run locally, tests | [../README.md](../README.md) | - |
| Deploy & PostgreSQL | [deploy.md](deploy.md) | - |
| Fonoran auth & release plan | [fonoran-auth-and-release.md](fonoran-auth-and-release.md) | - |
| Open problems / research | [open-problems.md](open-problems.md) | `#open-problems` |
| Contributing | [../CONTRIBUTING.md](../CONTRIBUTING.md) | Docs |
| Language-system audit (June 2026) | [FONORA_CLEANUP_AUDIT.md](FONORA_CLEANUP_AUDIT.md) | Docs |

---

## App navigation (main script app)

Universal header: context pills **Fonora Script** · **Fonoran** · **Research** · **Docs** (row 1); context-specific tool tabs (row 2).

Primary tabs: **Home**, **Translator**, **Reader**, **Sound Grid**, **Alphabet**.

More menu (grouped): transliteration tools (**Breakdown**, **Samples**, **Keyboard**, **Reverse Lookup**), script QA (**Quiz**, **Pronunciation Testing**, **Pronunciation Validation**), platform (**Open Problems**, **Docs**).

Doc links open the **Docs** viewer (`?path=docs/foo.md#docs`). **View on GitHub ↗** on each page.

Multilingual behavior: [multilingual-support.md](multilingual-support.md).

---

## Tests: CLI vs browser

| Command / entry | What it runs | UI equivalent |
| --- | --- | --- |
| `npm test` | Unit/integration assertions (`js/tests-core.js` + integration) | `?test` in URL → console |
| `npm run test:pronunciation-validation` | Batch IPA round-trip report | Pronunciation Validation tab |
| `npm run test:vowels` | Vowel readability report → `reports/` | - |
| `npm run test:minimal-pairs` | Minimal-pair distinctness report | - |
| `npm run test:v2-collisions` | Deprecated alias for `test:minimal-pairs` | - |
| `npm run audit:collisions` | Full collision audit → `docs/FONORA_COLLISION_AUDIT.md` | Warnings inside Validation results |
| `npm run fonoran:import` | Import JSON bucket → PostgreSQL | - |
| `npm run fonoran:export` | Export PostgreSQL bucket → JSON | - |

Pronunciation **Testing** is manual only (Correct / Wrong / Unsure, export JSON/CSV). Pronunciation **Validation** is automated pass/fail on IPA round-trip.

---

## Known code ↔ markdown gaps

1. **`fonora-config.js`**: `vowelMode` falls back to `'default'` when bundle metadata is missing (markdown always sets `v3`).

Consonant grid/derived IPA is **generated from markdown at load** (`buildConsonantMapFromRules`). Supplemental multilingual variants remain in `SUPPLEMENTAL_CONSONANT_MAP`, see [ipa-normalize.md](ipa-normalize.md).
