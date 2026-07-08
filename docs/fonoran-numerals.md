# Fonoran numerals

> **Status**: Living specification. Cardinal numerals **1–99** only. Zero, 100+, ordinals, and arithmetic are out of scope.
>
> **Read first:** [Fonoran Constitution](fonoran-constitution.md) · [Fonoran grammar](fonoran-grammar.md) · [Language rules (Fonora script)](language-rules.md)

Fonoran cardinal numerals are **phonetic compounds**: speakable CV syllables written in Fonora script by concatenation, the same way lexical compounds (`benba`, `hudi`) are formed. They are not symbolic place-value notation.

## Design constraints

| Rule | Detail |
| --- | --- |
| **Phonetic** | Every numeral is spoken aloud as a chain of digit and decade syllables. |
| **Roman** | Hyphens separate morphemes for readability (`sa-pa` = 11). |
| **Script** | No separator glyphs — morphemes concatenate (`sapa`). |
| **Vowel** | Digit syllables use **a** (CUP / schwa), encoded as simple vowel `⚬∪` per [language-rules.md](language-rules.md). |
| **Forbidden** | Do not use `ᵔ`, `⚬⚬`, or stacked vowel markers as magnitude notation. Those are script grammar, not numerals. |
| **Encoding** | Script uses the same pipeline as other Fonoran text (`romanToFonoraScript` in [../tools/fonoran-fonora-bridge.js](../tools/fonoran-fonora-bridge.js)). |

## Digits 1–10

Each digit is one CV syllable. Digits 1–5 map to the **plain** row of the Fonora sound grid (places 1–5); digits 6–9 map to **manner + lips** (keys 6–9). Digit 10 is the grid overflow: friction at the front tongue (`sa`).

| Value | Roman | IPA (approx.) | Grid basis |
| ---: | --- | --- | --- |
| 1 | pa | /pʌ/ | plain lips (key 1) |
| 2 | ta | /tʌ/ | plain front (key 2) |
| 3 | cha | /tʃʌ/ | plain middle (key 3) |
| 4 | ka | /kʌ/ | plain back (key 4) |
| 5 | ha | /hʌ/ | plain throat (key 5) |
| 6 | ba | /bʌ/ | voice + lips (key 6) |
| 7 | fa | /fʌ/ | friction + lips (key 7) |
| 8 | ma | /mʌ/ | nasal + lips (key 8) |
| 9 | wa | /wʌ/ | glide + lips (key 9) |
| 10 | sa | /sʌ/ | friction + front (overflow) |

These syllables **overlap** with lexical roots and grammar particles in other contexts. See [Disambiguation](#disambiguation).

### Script: digits 1–10

| Roman | Fonora script |
| --- | --- |
| pa | ∋⚬∪ |
| ta | ∩⚬∪ |
| cha | ⌓⚬∪ |
| ka | ∪⚬∪ |
| ha | ⊃⚬∪ |
| ba | ⌇∋⚬∪ |
| fa | ⌀∋⚬∪ |
| ma | ⏌∋⚬∪ |
| wa | ᵔ∋⚬∪ |
| sa | ⌀∩⚬∪ |

## Teens (11–19)

Ten-first composition: **sa** (10) followed by the unit digit.

```
11–19 = sa + [digit 1–9]
```

| Value | Roman | Fonora script |
| ---: | --- | --- |
| 11 | sa-pa | ⌀∩⚬∪∋⚬∪ |
| 12 | sa-ta | ⌀∩⚬∪∩⚬∪ |
| 13 | sa-cha | ⌀∩⚬∪⌓⚬∪ |
| 14 | sa-ka | ⌀∩⚬∪∪⚬∪ |
| 15 | sa-ha | ⌀∩⚬∪⊃⚬∪ |
| 16 | sa-ba | ⌀∩⚬∪⌇∋⚬∪ |
| 17 | sa-fa | ⌀∩⚬∪⌀∋⚬∪ |
| 18 | sa-ma | ⌀∩⚬∪⏌∋⚬∪ |
| 19 | sa-wa | ⌀∩⚬∪ᵔ∋⚬∪ |

## Decades (20–90)

A **decade word** fuses the tens digit syllable with **sa** (10), spoken as one unit. Round decades use the decade word alone.

| Value | Decade word | Formation |
| ---: | --- | --- |
| 20 | sasa | `sa` + `sa` (reduplication; the only decade formed this way) |
| 30 | chasa | cha + sa |
| 40 | kasa | ka + sa |
| 50 | hasa | ha + sa |
| 60 | basa | ba + sa |
| 70 | fasa | fa + sa |
| 80 | masa | ma + sa |
| 90 | wasa | wa + sa |

### Script: decades

| Value | Roman | Fonora script |
| ---: | --- | --- |
| 20 | sasa | ⌀∩⚬∪⌀∩⚬∪ |
| 30 | chasa | ⌓⚬∪⌀∩⚬∪ |
| 40 | kasa | ∪⚬∪⌀∩⚬∪ |
| 50 | hasa | ⊃⚬∪⌀∩⚬∪ |
| 60 | basa | ⌇∋⚬∪⌀∩⚬∪ |
| 70 | fasa | ⌀∋⚬∪⌀∩⚬∪ |
| 80 | masa | ⏌∋⚬∪⌀∩⚬∪ |
| 90 | wasa | ᵔ∋⚬∪⌀∩⚬∪ |

## Compound decades (21–99)

Non-zero units append after the decade word:

```
21–99 = [decade word] + [digit 1–9]
```

Omit the unit when it is zero (e.g. 30 = `chasa`, not `chasa` + unit).

| Value | Roman | Fonora script |
| ---: | --- | --- |
| 21 | sasa-pa | ⌀∩⚬∪⌀∩⚬∪∋⚬∪ |
| 37 | chasa-fa | ⌓⚬∪⌀∩⚬∪⌀∋⚬∪ |
| 73 | fasa-cha | ⌀∋⚬∪⌀∩⚬∪⌓⚬∪ |
| 99 | wasa-wa | ᵔ∋⚬∪⌀∩⚬∪ᵔ∋⚬∪ |

## Full reference (11–99)

| Value | Roman | Fonora script |
| ---: | --- | --- |
| 11 | sa-pa | ⌀∩⚬∪∋⚬∪ |
| 12 | sa-ta | ⌀∩⚬∪∩⚬∪ |
| 13 | sa-cha | ⌀∩⚬∪⌓⚬∪ |
| 14 | sa-ka | ⌀∩⚬∪∪⚬∪ |
| 15 | sa-ha | ⌀∩⚬∪⊃⚬∪ |
| 16 | sa-ba | ⌀∩⚬∪⌇∋⚬∪ |
| 17 | sa-fa | ⌀∩⚬∪⌀∋⚬∪ |
| 18 | sa-ma | ⌀∩⚬∪⏌∋⚬∪ |
| 19 | sa-wa | ⌀∩⚬∪ᵔ∋⚬∪ |
| 20 | sasa | ⌀∩⚬∪⌀∩⚬∪ |
| 21 | sasa-pa | ⌀∩⚬∪⌀∩⚬∪∋⚬∪ |
| 22 | sasa-ta | ⌀∩⚬∪⌀∩⚬∪∩⚬∪ |
| 23 | sasa-cha | ⌀∩⚬∪⌀∩⚬∪⌓⚬∪ |
| 24 | sasa-ka | ⌀∩⚬∪⌀∩⚬∪∪⚬∪ |
| 25 | sasa-ha | ⌀∩⚬∪⌀∩⚬∪⊃⚬∪ |
| 26 | sasa-ba | ⌀∩⚬∪⌀∩⚬∪⌇∋⚬∪ |
| 27 | sasa-fa | ⌀∩⚬∪⌀∩⚬∪⌀∋⚬∪ |
| 28 | sasa-ma | ⌀∩⚬∪⌀∩⚬∪⏌∋⚬∪ |
| 29 | sasa-wa | ⌀∩⚬∪⌀∩⚬∪ᵔ∋⚬∪ |
| 30 | chasa | ⌓⚬∪⌀∩⚬∪ |
| 31 | chasa-pa | ⌓⚬∪⌀∩⚬∪∋⚬∪ |
| 32 | chasa-ta | ⌓⚬∪⌀∩⚬∪∩⚬∪ |
| 33 | chasa-cha | ⌓⚬∪⌀∩⚬∪⌓⚬∪ |
| 34 | chasa-ka | ⌓⚬∪⌀∩⚬∪∪⚬∪ |
| 35 | chasa-ha | ⌓⚬∪⌀∩⚬∪⊃⚬∪ |
| 36 | chasa-ba | ⌓⚬∪⌀∩⚬∪⌇∋⚬∪ |
| 37 | chasa-fa | ⌓⚬∪⌀∩⚬∪⌀∋⚬∪ |
| 38 | chasa-ma | ⌓⚬∪⌀∩⚬∪⏌∋⚬∪ |
| 39 | chasa-wa | ⌓⚬∪⌀∩⚬∪ᵔ∋⚬∪ |
| 40 | kasa | ∪⚬∪⌀∩⚬∪ |
| 41 | kasa-pa | ∪⚬∪⌀∩⚬∪∋⚬∪ |
| 42 | kasa-ta | ∪⚬∪⌀∩⚬∪∩⚬∪ |
| 43 | kasa-cha | ∪⚬∪⌀∩⚬∪⌓⚬∪ |
| 44 | kasa-ka | ∪⚬∪⌀∩⚬∪∪⚬∪ |
| 45 | kasa-ha | ∪⚬∪⌀∩⚬∪⊃⚬∪ |
| 46 | kasa-ba | ∪⚬∪⌀∩⚬∪⌇∋⚬∪ |
| 47 | kasa-fa | ∪⚬∪⌀∩⚬∪⌀∋⚬∪ |
| 48 | kasa-ma | ∪⚬∪⌀∩⚬∪⏌∋⚬∪ |
| 49 | kasa-wa | ∪⚬∪⌀∩⚬∪ᵔ∋⚬∪ |
| 50 | hasa | ⊃⚬∪⌀∩⚬∪ |
| 51 | hasa-pa | ⊃⚬∪⌀∩⚬∪∋⚬∪ |
| 52 | hasa-ta | ⊃⚬∪⌀∩⚬∪∩⚬∪ |
| 53 | hasa-cha | ⊃⚬∪⌀∩⚬∪⌓⚬∪ |
| 54 | hasa-ka | ⊃⚬∪⌀∩⚬∪∪⚬∪ |
| 55 | hasa-ha | ⊃⚬∪⌀∩⚬∪⊃⚬∪ |
| 56 | hasa-ba | ⊃⚬∪⌀∩⚬∪⌇∋⚬∪ |
| 57 | hasa-fa | ⊃⚬∪⌀∩⚬∪⌀∋⚬∪ |
| 58 | hasa-ma | ⊃⚬∪⌀∩⚬∪⏌∋⚬∪ |
| 59 | hasa-wa | ⊃⚬∪⌀∩⚬∪ᵔ∋⚬∪ |
| 60 | basa | ⌇∋⚬∪⌀∩⚬∪ |
| 61 | basa-pa | ⌇∋⚬∪⌀∩⚬∪∋⚬∪ |
| 62 | basa-ta | ⌇∋⚬∪⌀∩⚬∪∩⚬∪ |
| 63 | basa-cha | ⌇∋⚬∪⌀∩⚬∪⌓⚬∪ |
| 64 | basa-ka | ⌇∋⚬∪⌀∩⚬∪∪⚬∪ |
| 65 | basa-ha | ⌇∋⚬∪⌀∩⚬∪⊃⚬∪ |
| 66 | basa-ba | ⌇∋⚬∪⌀∩⚬∪⌇∋⚬∪ |
| 67 | basa-fa | ⌇∋⚬∪⌀∩⚬∪⌀∋⚬∪ |
| 68 | basa-ma | ⌇∋⚬∪⌀∩⚬∪⏌∋⚬∪ |
| 69 | basa-wa | ⌇∋⚬∪⌀∩⚬∪ᵔ∋⚬∪ |
| 70 | fasa | ⌀∋⚬∪⌀∩⚬∪ |
| 71 | fasa-pa | ⌀∋⚬∪⌀∩⚬∪∋⚬∪ |
| 72 | fasa-ta | ⌀∋⚬∪⌀∩⚬∪∩⚬∪ |
| 73 | fasa-cha | ⌀∋⚬∪⌀∩⚬∪⌓⚬∪ |
| 74 | fasa-ka | ⌀∋⚬∪⌀∩⚬∪∪⚬∪ |
| 75 | fasa-ha | ⌀∋⚬∪⌀∩⚬∪⊃⚬∪ |
| 76 | fasa-ba | ⌀∋⚬∪⌀∩⚬∪⌇∋⚬∪ |
| 77 | fasa-fa | ⌀∋⚬∪⌀∩⚬∪⌀∋⚬∪ |
| 78 | fasa-ma | ⌀∋⚬∪⌀∩⚬∪⏌∋⚬∪ |
| 79 | fasa-wa | ⌀∋⚬∪⌀∩⚬∪ᵔ∋⚬∪ |
| 80 | masa | ⏌∋⚬∪⌀∩⚬∪ |
| 81 | masa-pa | ⏌∋⚬∪⌀∩⚬∪∋⚬∪ |
| 82 | masa-ta | ⏌∋⚬∪⌀∩⚬∪∩⚬∪ |
| 83 | masa-cha | ⏌∋⚬∪⌀∩⚬∪⌓⚬∪ |
| 84 | masa-ka | ⏌∋⚬∪⌀∩⚬∪∪⚬∪ |
| 85 | masa-ha | ⏌∋⚬∪⌀∩⚬∪⊃⚬∪ |
| 86 | masa-ba | ⏌∋⚬∪⌀∩⚬∪⌇∋⚬∪ |
| 87 | masa-fa | ⏌∋⚬∪⌀∩⚬∪⌀∋⚬∪ |
| 88 | masa-ma | ⏌∋⚬∪⌀∩⚬∪⏌∋⚬∪ |
| 89 | masa-wa | ⏌∋⚬∪⌀∩⚬∪ᵔ∋⚬∪ |
| 90 | wasa | ᵔ∋⚬∪⌀∩⚬∪ |
| 91 | wasa-pa | ᵔ∋⚬∪⌀∩⚬∪∋⚬∪ |
| 92 | wasa-ta | ᵔ∋⚬∪⌀∩⚬∪∩⚬∪ |
| 93 | wasa-cha | ᵔ∋⚬∪⌀∩⚬∪⌓⚬∪ |
| 94 | wasa-ka | ᵔ∋⚬∪⌀∩⚬∪∪⚬∪ |
| 95 | wasa-ha | ᵔ∋⚬∪⌀∩⚬∪⊃⚬∪ |
| 96 | wasa-ba | ᵔ∋⚬∪⌀∩⚬∪⌇∋⚬∪ |
| 97 | wasa-fa | ᵔ∋⚬∪⌀∩⚬∪⌀∋⚬∪ |
| 98 | wasa-ma | ᵔ∋⚬∪⌀∩⚬∪⏌∋⚬∪ |
| 99 | wasa-wa | ᵔ∋⚬∪⌀∩⚬∪ᵔ∋⚬∪ |

## Disambiguation

> **Numerals are phonetic, not semantic.** Digit syllables were assigned by **sound-grid position** (Fonora keypad order: plain places 1–5, manner + lips 6–9, overflow at 10) — not by dictionary meaning. Several digit sounds **happen to match** approved lexical roots or grammar particles, but that overlap is **coincidental, not planned**. For example, **fa** is digit **7** because friction + lips is keypad key 7, while the lexical root **fa** means *one (quantity)* — a mismatch that would not exist if numerals had been designed from meanings outward.

Several digit syllables double as **grammar particles** or **lexical roots** when not used in a counting context:

| Syllable | As digit | Also |
| --- | --- | --- |
| **ta** | 2 | Past-tense particle ([fonoran-grammar-particles.json](../data/fonoran-grammar-particles.json)) |
| **sa** | 10 | Future-tense particle |
| **pa** | 1 | Lexical root: conflict |
| **cha** | 3 | Lexical root: front |
| **ba** | 6 | Lexical root: person |
| **fa** | 7 | Lexical root: one (quantity) |

In **numeral context**, compounds such as `sa-pa` (11) or `fasa-cha` (73) parse as cardinals, not as tense + concept chains.

**v1 rule:** disambiguation by context and intonation. No dedicated counting particle is required yet. If ambiguity becomes a problem in practice, a future revision may add a numeral-frame marker without changing the syllable inventory.

**Open question (deferred):** Should digit **1** and digit **7** be swapped so the lexical root *one* (**fa**) aligns with numeral 1? That would require redefining the 1–10 grid mapping and is **not** part of this specification. The language is early enough to revisit, but the current numeral inventory is authoritative until a deliberate revision.

## Out of scope

The following are **not** defined in this specification:

- Zero
- 100 and larger magnitudes
- Ordinal numerals (first, second, …)
- Arithmetic operators or number grammar
- Dedicated counting particles or numeral-frame markers

These may be specified in a later revision.
