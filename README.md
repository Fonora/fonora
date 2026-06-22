# Fonora

**[fonora.org](https://fonora.org)** — an open-source phonetic oral script language.

Fonora is an experimental writing system built from nine core symbols that represent where and how speech sounds are produced. This repository contains the language rules, research documentation, and the interactive web app used to test translation, reading, and validation.

```
Text → eSpeak NG → IPA → ipa-normalize.js → encodeSounds() → Fonora symbols
```

Rules version: **v3** ([`docs/language-rules.md`](docs/language-rules.md) — vowel grammar `⚬X`, diphthong `⚬XᵔY`).

## Live site

**https://fonora.org**

## Features

- Project homepage with live symbol reference
- **Translator** — text → IPA → Fonora (multilingual)
- **Reader** — neural Piper TTS from Fonora IPA
- **Sound Grid** — place × manner reference
- **Alphabet** — primary symbol experiments + phoneme inventory
- **Quiz** — decode or construct practice
- Pronunciation testing and automated IPA round-trip validation

See [docs/README.md](docs/README.md) for the full documentation index.

## App navigation

| Section | Location | Purpose |
| --- | --- | --- |
| Home | Primary nav | Project introduction |
| Translator | Primary nav | Text → IPA → Fonora; editable output |
| Reader | Primary nav | Neural TTS playback |
| Sound Grid | Primary nav | Place × manner reference |
| Alphabet | Primary nav | Primary symbol overrides + phoneme inventory |
| Quiz | More | Decode or construct encodable sounds |
| Keyboard | More | Symbol input + mapping table |
| Reverse Lookup | More | Sound → symbol |
| Pronunciation Testing | More | Manual review + export |
| Pronunciation Validation | More | Automated IPA round-trip |

## Run locally

```bash
git clone https://github.com/jamesc137/fonora.git
cd fonora
npm install
npm start
```

Open [http://localhost:8000](http://localhost:8000).

Browsers block `fetch()` and WASM when opening HTML directly (`file://`). Always use the HTTP server.

## Deploy

Production uses the included Node static server (`npm start`). See **[docs/deploy.md](docs/deploy.md)** for Heroku setup, custom domain (`fonora.org`), and hosting notes.

Quick Heroku deploy:

```bash
heroku create
git push heroku main
```

## Contributing

Contributions welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

## Editing rules

Edit [`docs/language-rules.md`](docs/language-rules.md) and reload the browser. Changes to symbols, keyboard mappings, sounds, and grid cells update automatically.

## Tests

```bash
npm test                              # 61 unit/integration assertions
npm run test:vowels                   # vowel readability report → reports/
npm run test:minimal-pairs            # minimal-pair distinctness report → reports/
npm run audit:collisions              # collision audit → docs/FONORA_COLLISION_AUDIT.md
npm run test:pronunciation-validation # IPA round-trip batch report → reports/
```

| Command | UI equivalent |
| --- | --- |
| `npm test` | Append `?test` to the app URL (browser console) |
| `npm run test:pronunciation-validation` | Pronunciation Validation tab |

## License

[MIT](LICENSE) — Copyright (c) 2026 James Calhoun.

eSpeak NG is GPL-licensed; see [docs/espeak-integration.md](docs/espeak-integration.md).

## Links

- Website: https://fonora.org
- Repository: https://github.com/jamesc137/fonora
- Issues: https://github.com/jamesc137/fonora/issues
