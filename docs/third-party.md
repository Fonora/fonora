# Third-party software and licenses

Fonora is [MIT-licensed](../LICENSE). The project also bundles or calls these components:

| Component | Used for | License |
| --- | --- | --- |
| **eSpeak NG** | IPA pronunciation (WASM) | [GPL-3.0-or-later](https://github.com/espeak-ng/espeak-ng) — see [espeak-integration.md](espeak-integration.md) |
| **@echogarden/espeak-ng-emscripten**, **espeak-ng** (npm) | Bundled eSpeak engine | Same GPL chain as eSpeak NG |
| **Anthropic Claude** | Fonoran LLM semantic compiler (`tools/fonoran-llm-translate.js`) | Anthropic API terms |
| **WordNet** / **wordpos** | Legacy translator only (`engine=legacy`) | [Princeton WordNet license](https://wordnet.princeton.edu/license-and-commercial-use); wordpos MIT |
| **Piper** / **piper-tts-web** | Neural TTS (“Listen” in the builder) | MIT (library); voice models from [rhasspy/piper-voices](https://huggingface.co/rhasspy/piper-voices) (see each model card) |
| **ONNX Runtime Web** | Piper inference in the browser | Apache-2.0 |
| **Mermaid** | Word-tree diagrams in the language builder | MIT (loaded from jsDelivr in `fonoran/index.html`) |
| **pg** | Optional PostgreSQL storage for the lab bucket | MIT |

## Translator stack

The **live** translator at `/language#translator` uses the LLM semantic compiler ([fonoran-translator.md](fonoran-translator.md)), not WordNet. WordNet remains in the codebase for the legacy English compiler (`engine=legacy`, regression tests).

## WordNet attribution (legacy translator)

WordNet is a lexical database developed at Princeton University. The legacy path uses WordNet synsets and hypernym chains (via **wordpos** and `tools/fonoran-semantic-lookup.js`) to map English input to concept primitives. Results are cached in `data/fonoran-semantic-cache.json`.

WordNet is free for research and non-commercial use with attribution. Read the [full license](https://wordnet.princeton.edu/license-and-commercial-use) before commercial redistribution.

Suggested citation:

> George A. Miller, Christiane Fellbaum, and colleagues. *WordNet*. Princeton University. https://wordnet.princeton.edu

## eSpeak NG (GPL)

If you distribute Fonora with the embedded eSpeak WASM bundle, GPL obligations apply to that component (source offer, etc.). Fonora’s encoder and symbol logic are separate MIT-licensed code. Details: [espeak-integration.md](espeak-integration.md).
