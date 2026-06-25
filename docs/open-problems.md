# Open Problems

**Help solve the hard parts of building a compact phonetic writing system.**

Fonora is an experimental, open-source research project. This page documents known linguistic, readability, encoding, and multilingual limitations, and invites contributors to help close them.

**Live page:** More → **Open Problems** on [fonora.org](https://fonora.org/#open-problems)

Rendered docs: More → **Docs** on [fonora.org](https://fonora.org/?path=docs%2FREADME.md#docs), or [view on GitHub](https://github.com/jamesc137/fonora/tree/main/docs).

## Introduction

Fonora is a compact phonetic writing system built from nine core symbols. Limitations are expected and documented openly. The project offers broad phonetic approximation through an eSpeak-driven IPA pipeline, not a finished universal script. Human readability still needs testing.

We invite linguists, language speakers, typographers, engineers, educators, and curious users to contribute.

## Problem categories

| Area | Status | Summary |
| --- | --- | --- |
| Readability & human testing | Needs Testing | Automated tests exist; large-scale human decode/read studies do not |
| Symbol collisions / decoding ambiguity | Partially Solved | Spacing fixes greedy decode; concatenation hazards remain, see [FONORA_COLLISION_AUDIT.md](FONORA_COLLISION_AUDIT.md) |
| Vowel architecture | Partially Solved | v3 grammar active; English engineering overlay collapses some contrasts |
| Multilingual phoneme gaps | Open | Shared vowel inventory; global supplemental consonant map; unmapped IPA → `?` or `a` |
| Tone languages | Research Needed | No tone notation in symbol inventory |
| Arabic / Semitic | Open | Pharyngeals, emphatics, glottal stop; eSpeak خ often → `x` not `χ` |
| Hindi / Indo-Aryan | Research Needed | Not a UI language yet; dental/retroflex contrasts need scoped mappings |
| Mandarin / tonal | Partially Solved | In UI; tones not encoded; CJK clause splitting |
| French / German / European | Open | No per-language vowel overlays; shared inventory edge cases |
| Handwriting & typography | Research Needed | Composed Unicode symbols; handwriting conventions undocumented |
| TTS / IPA round-trip | Partially Solved | eSpeak dependency; Validation tab checks round-trip; Japanese no Piper voice |
| Documentation & examples | Partially Solved | Research docs spread across `docs/`; non-English samples experimental |

## By language

See the **Open Problems** page in the app for per-language topic lists (English, Spanish, French, German, Arabic, Mandarin, Hindi, Japanese).

## How to help

1. [Open a GitHub issue](https://github.com/jamesc137/fonora/issues/new/choose), use a template when possible
2. Submit a language test set (see [multilingual-support.md](multilingual-support.md))
3. Submit minimal pairs for collision or merger cases
4. Review mappings as a native speaker via the Translator
5. Propose symbol grammar changes in [language-rules.md](language-rules.md)
6. Improve documentation in `docs/`
7. Test readability with real users (Quiz, Pronunciation Testing)

## Source documents

| Topic | Document |
| --- | --- |
| Multilingual limitations | [multilingual-support.md](multilingual-support.md) |
| Collision audit | [FONORA_COLLISION_AUDIT.md](FONORA_COLLISION_AUDIT.md) |
| IPA normalization | [ipa-normalize.md](ipa-normalize.md) |
| IPA pipeline | [IPA-PIPELINE-REPORT.md](IPA-PIPELINE-REPORT.md) |
| Pronunciation validation | [pronunciation-validation.md](pronunciation-validation.md) |
| Language rules | [language-rules.md](language-rules.md) |
| Contributing | [../CONTRIBUTING.md](../CONTRIBUTING.md) |

## Issue templates

GitHub issue templates (`.github/ISSUE_TEMPLATE/`) cover:

- Language support gap
- Symbol collision
- Readability problem
- Mapping proposal
- Native speaker feedback
