# Fonora

**[fonora.org](https://fonora.org)**: an open-source research project exploring phonetic writing systems, constructed language design, and fast cross-linguistic communication.

**Central hypothesis:** can a language designed from first principles be learned quickly enough that two people with no shared native language can achieve practical communication after only a short period of study?

This repository contains the **Fonora script**, the **Fonoran experimental language**, builder tools, a public research notebook, and interactive web apps.

See **[docs/platform-overview.md](docs/platform-overview.md)** for the full platform map.

## Three layers

### 1. Fonora Script

**Fonora** is a phonetic **writing system** built from nine core symbols that represent where and how speech sounds are produced. It is not a spoken language — it is the script used to write pronunciation.

```
Text → eSpeak NG → IPA → ipa-normalize.js → encodeSounds() → Fonora symbols
```

Rules version: **v3** ([`docs/language-rules.md`](docs/language-rules.md), vowel grammar `⚬X`, diphthong `⚬XᵔY`).

| Tool | Route |
| --- | --- |
| [Sound Grid](https://fonora.org/script#grid) | Place × manner reference |
| [Alphabet](https://fonora.org/script#alphabet) | Primary symbols + phoneme inventory |
| [Transliterate](https://fonora.org/script#translator) | Text → IPA → Fonora |
| [Breakdown](https://fonora.org/learn#breakdown) | Per-word phonetic analysis |
| [Samples](https://fonora.org/learn#listening) | Multilingual paragraph demos |
| [Quiz](https://fonora.org/learn#reading) | Decode / construct practice |
| [Spelling practice](https://fonora.org/learn#writing) | Type words in Fonora script |

Docs: [language-rules.md](docs/language-rules.md) · [multilingual-support.md](docs/multilingual-support.md)

### 2. Fonoran

**Fonoran** is an **experimental constructed language** built on Fonora Script. Success is measured by recoverable meaning: can root-knowers understand each other's invented expressions?

| Asset | Route |
| --- | --- |
| [Language app](https://fonora.org/language) | About, Translator, Dictionary, Grammar |
| [Puzzle Conversation](https://fonora.org/language#puzzle) | Guess-the-meaning playtests |
| [fonoran.md](docs/fonoran.md) | Guide, pipeline, API |
| [Constitution](docs/fonoran-constitution.md) | Philosophy and campfire test |

Live vocabulary: `data/fonoran-sound-bucket.json` (local runtime; gitignored).

### 3. Tools and research

| Area | Route |
| --- | --- |
| [Learn](https://fonora.org/learn) | Public script practice |
| [Tools](https://fonora.org/tools) | QA and builder utilities (sign-in when OAuth configured) |
| [Research notebook](https://fonora.org/research) | RN-01 through RN-17 experiment write-ups |

CLI: `npm run fonoran:build`, `fonoran:root-candidates`. See [docs/fonoran.md](docs/fonoran.md#pipeline).

## Live site

- **https://fonora.org** — platform home
- **https://fonora.org/script** — Fonora Script
- **https://fonora.org/language** — Fonoran language app
- **https://fonora.org/learn** — learner exercises
- **https://fonora.org/research** — research notebook

(`/fonoran/` redirects to `/language`.)

## Development

### Run locally

```bash
git clone https://github.com/Fonora/fonora.git
cd fonora
git submodule update --init   # research data → external/fonora-data
npm install
npm start
```

Research datasets (LLM evaluations, playtests, translation snapshots, research notes) live in [Fonora/fonora-data](https://github.com/Fonora/fonora-data). After clone, run `npm run fonoran:data:status` to verify paths.

Open [http://localhost:8000](http://localhost:8000). Browsers block `fetch()` and WASM over `file://` — always use the HTTP server.

### Deploy

See [docs/deploy.md](docs/deploy.md).

### Tests

```bash
npm test
npm run fonoran:build
```

## License

MIT — see [LICENSE](LICENSE).
