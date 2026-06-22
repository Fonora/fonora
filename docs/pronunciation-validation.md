# Pronunciation Validation Mode

Pronunciation Validation Mode is a **testing tool** that checks whether Fonora preserves pronunciation through the full encode/decode pipeline. It does not modify symbol mappings, vowels, diphthongs, derived sounds, or language rules.

## Pipeline under test

```
English source
    ↓  eSpeak NG
Source IPA
    ↓  ipa-normalize.js
Source Fonora phoneme keys
    ↓  encodeSounds()
Fonora symbols
    ↓  decodeToPhonemeKeys() (longest-match, space boundaries preserved)
Recovered Fonora phoneme keys
    ↓  cell IPA metadata from language-rules.md
Recovered IPA
    ↓  compare
Match / mismatch
```

Every word uses the eSpeak IPA pipeline. There is no dictionary or glossary override in the app.

## Success metric

The primary metric is:

**Source IPA == Recovered IPA** (after stress-mark normalization)

Secondary checks:

- Source phoneme keys vs recovered phoneme keys
- Pipeline encode → decode phoneme key round-trip
- Known collision-class warnings from `collision-audit.js`

## Recovered IPA

When recovered phoneme keys match the source keys, recovered IPA is rebuilt from the **same IPA segments** eSpeak produced (tracked during `normalizeIpa`). This avoids false mismatches from vowel cells that list multiple IPA variants (e.g. `o` → `/ɑ, ɒ, ɔ, ɑː, ɔː/`).

When phoneme keys differ after decode, recovered IPA is assembled from rule cell metadata, preferring variants that appear in the source IPA string.

The decoder path still shows per-symbol cell IPA (including variant lists) for mismatch investigation.

## UI (More → Pronunciation Validation)

### Single word

For each word:

| Section | Contents |
|---------|----------|
| Input | Original English word |
| Source Analysis | eSpeak IPA, Fonora phoneme keys, Fonora symbols |
| Recovery Analysis | Recovered phoneme keys, recovered IPA, decoder path |
| Comparison | Source IPA, recovered IPA, match/mismatch indicator |

**▶ Original** — browser speech synthesis speaks the English word (expected pronunciation).

**▶ Fonora Readback** — speaks recovered phoneme keys joined as a pseudo-word (what the Fonora writing system encodes). Browser TTS cannot speak IPA directly; this exposes raw encoded behavior without compensation.

### Batch testing

Paste one word per line (default list includes bar/boy/bor minimal pairs, vowel contrasts, etc.). Results table:

| Word | Source IPA | Recovered IPA | Match |

Summary statistics: words tested, exact IPA matches, mismatches, collision warnings, recovery success rate.

### V3 vowel architecture validation

Dedicated test set (`cat`, `bed`, `sit`, `see`, `cup`, `father`, `go`, `book`, `boot`, `pie`, `now`, `boy`, `say`) runs through the same pipeline and displays:

| Word | IPA | Phonemes | Fonora symbols | Decoded | Grammar |

Grammar pass requires every vowel chunk to match v3 shape (`⚬X` or `⚬X⌣Y`) and forbids the legacy `⚬⚬` marker. Logic lives in `js/vowel-architecture-validation.js` and `js/vowel-grammar.js`.

### Mismatch investigation

When IPA or phoneme keys mismatch, the UI shows:

- Original vs recovered phoneme keys
- Original symbols
- Decoder path (`symbol→key (ipa) · …`)
- Pipeline decoded keys
- Collision warnings when source keys contain known concatenation patterns (e.g. `o + y ↔ oy`)

## Collision audit integration

Warnings reuse `findConcatenationCollisions()` from `js/collision-audit.js`. If source phoneme keys contain a sequence that participates in a known collision class, an informational warning is shown — for example:

> Contains known vowel+glide collision pattern (o + y ↔ oy)

This does not block validation; it helps diagnose symbol-system ambiguity.

## Code

| File | Role |
|------|------|
| `js/vowel-grammar.js` | V3 vowel symbol grammar validation |
| `js/vowel-architecture-validation.js` | Dedicated v3 vowel word-set validation |
| `js/pronunciation-validation.js` | Core validation logic (browser + Node) |
| `js/pronunciation-validation-ui.js` | Tab UI wiring |
| `scripts/pronunciation-validation-report.js` | CLI batch report |

## Commands

```bash
npm test                              # unit tests including validation helpers
npm run test:pronunciation-validation # batch report via eSpeak (requires npm install)
```

## What this tool does not do

- Change symbol mappings or language rules
- Add spaces, separators, or boundary markers to the language
- Redesign the phoneme inventory

Use **Pronunciation Testing** (More menu) for manual multilingual review, issue tagging, and JSON/CSV export. That tab does not run automated pass/fail assertions.
