---
status: Open
date: 2026-07-20
phase: phase-5
---

# Compound spelling vs phonetic reading

## Research Question

Fonoran is meant to be entirely phonetic: write what you hear. Compounds are also meant to show their roots in the roman spelling (`mo` + `yi` → `moyi`). Those two goals collide when a digraph or diphthong forms across a root boundary.

Observed case: `moyi` (*again* = do + around). Encoded from morphological parts (`mo`|`yi`) the script is `m`+`o`+`y`+`i`. Encoded from the joined spelling as phoneme keys it is `m`+`oy`+`i`. Same roman word, two different Fonora script strings. Keyboard and whole-string encode follow the phonetic reading; the translator and dictionary follow the compound parts.

**When a learner writes or reads a compound, which spelling is canonical: the morphological concatenation, or a rewritten pure-phonetic form?**

## Hypothesis

This may be unavoidable rather than a bug. Natural languages often have morphological spelling and phonetic realization diverge. Fonoran can keep both if it names them:

1. **Compound spelling:** root parts joined for recoverability (`mo` + `yi`).
2. **Phonetic spelling:** longest-match phoneme keys over the whole word (`m oy i`).

The open design question is whether the script layer should prefer one, show both, or rewrite compounds into phonetic form at approval time.

## Approach

Dictionary dual-display implemented (morph headword + phonetic alt when encode diverges). Trigger was the `oy` remap (`oh`+`y` → `⚬⏌ᵔ∪`) plus noticing that translator script for `moyi` stayed `mo`+`yi` (`⚬⊃` then `ᵔ∪`) instead of using the `oy` key. (As of 2026-07-20 the live rules may not expose `oy`; the alt only appears when morph vs whole-word script actually differs.)

Related machinery:

- [`tools/fonoran-fonora-bridge.js`](../../tools/fonoran-fonora-bridge.js) `romanToFonoraScript(parts)` encodes each part separately
- [`language/fonoran-app.js`](../../language/fonoran-app.js) `compoundSpeakParts` expands compounds to root spellings before script
- [`js/encode.js`](../../js/encode.js) longest-match over a whole roman string yields the phonetic reading

## Evaluation

Informal only: `moyi` as one string → `m oy i`; as `['mo','yi']` → `m o` + `y i`. No learner study yet.

## Findings

Provisional:

- The conflict is structural once compounds concatenate roman roots that can form digraphs (`oy`, `ay`, `ch`, `ng`, …) across the seam.
- It is not fixed by updating vowel recipes alone.
- Dual spelling (compound vs phonetic) is a plausible framing; choosing a single canonical script form needs a constitution-level call.
- Informal pronounce pass on free diphthong-shaped slots (`⚬XᵔY` with offglide `w`/`y`): almost none felt like a new vowel. Closest was `a`+`y` (`⚬∪ᵔ∪`), which read as a slightly deeper `ay`.

### Dictionary decision (2026-07-20)

Do **not** ban cross-boundary digraph compounds, and do **not** rewrite preferred compounds into pure-phonetic roman (that would drop lego recoverability in the headword: e.g. `ye` still signals water).

Keep **morphological roman + part-wise script** as the dictionary/translator canonical form. When whole-word longest-match encode diverges (same roman letters, different phoneme keys / glyphs), show the phonetic reading as an **alternate** in the dictionary (phoneme-key line + phonetic script). No seed schema field; compute on the fly via `romanWordToFonoraScript`. Translator/TTS stay part-wise.

## Unused symbol inventory (snapshot 2026-07-20)

Legal Fonora structures and what is still free. Occupied keys are omitted. Refresh against [`docs/language-rules.md`](../language-rules.md) + `npm run audit:collisions` if the inventory changes.

### 1. Simple / long vowels (`⚬X`)

All eight slots filled. **No free `⚬X` combos.**

| Status | Keys |
| --- | --- |
| Taken | `i` ⚬∩, `e` ⚬⌓, `a` ⚬∪, `o` ⚬⊃, `u` ⚬∋, `ee` ⚬⌇, `ae` ⚬⌀, `oh` ⚬⏌ |

### 2. Diphthong-shaped (`⚬XᵔY`), unregistered

Taken: `ay` `eye` `ow` `oy`. Free: **28**.

#### Offglide `w` / `y` (pronounce-first pool)

| Symbols | Sequence |
| --- | --- |
| ⚬∪ᵔ∋ | `a + w` |
| ⚬∪ᵔ∪ | `a + y` |
| ⚬⌓ᵔ∋ | `e + w` |
| ⚬∩ᵔ∋ | `i + w` |
| ⚬∩ᵔ∪ | `i + y` |
| ⚬∋ᵔ∋ | `u + w` |
| ⚬∋ᵔ∪ | `u + y` |
| ⚬⌀ᵔ∋ | `ae + w` |
| ⚬⌀ᵔ∪ | `ae + y` |
| ⚬⌇ᵔ∋ | `ee + w` |
| ⚬⌇ᵔ∪ | `ee + y` |
| ⚬⏌ᵔ∋ | `oh + w` |

#### Offglide `l` / `r` (usually coda; keep as sequences unless r-vowels are wanted)

| Symbols | Sequence |
| --- | --- |
| ⚬∪ᵔ∩ | `a + l` |
| ⚬∪ᵔ⌓ | `a + r` |
| ⚬⌓ᵔ∩ | `e + l` |
| ⚬⌓ᵔ⌓ | `e + r` |
| ⚬∩ᵔ∩ | `i + l` |
| ⚬∩ᵔ⌓ | `i + r` |
| ⚬⊃ᵔ∩ | `o + l` |
| ⚬⊃ᵔ⌓ | `o + r` |
| ⚬∋ᵔ∩ | `u + l` |
| ⚬∋ᵔ⌓ | `u + r` |
| ⚬⌀ᵔ∩ | `ae + l` |
| ⚬⌀ᵔ⌓ | `ae + r` |
| ⚬⌇ᵔ∩ | `ee + l` |
| ⚬⌇ᵔ⌓ | `ee + r` |
| ⚬⏌ᵔ∩ | `oh + l` |
| ⚬⏌ᵔ⌓ | `oh + r` |

### 3. Sound Grid cells (modifier + place)

| Symbols | Slot | Status |
| --- | --- | --- |
| ⏌⊃ | nasal + throat | reserved (no key) |
| ᵔ⊃ | glide + throat | reserved (IPA candidate `/ʕ/`, no key) |

All other grid cells are defined.

### 4. Derived reverse order (place + modifier)

Taken: `th` ∩⌀, `dh` ∩⌇, `v` ∋⌇, and modifier-pair `z` ⌀⌇.

Unused reverses (not assigned a phoneme key):

| Symbols | Reading |
| --- | --- |
| ∋⌀ | lips + friction |
| ∋⏌ | lips + nasal |
| ∋ᵔ | lips + glide |
| ∩⏌ | front + nasal |
| ∩ᵔ | front + glide |
| ⌓⌇ | middle + voice |
| ⌓⌀ | middle + friction |
| ⌓⏌ | middle + nasal |
| ⌓ᵔ | middle + glide |
| ∪⌇ | back + voice |
| ∪⌀ | back + friction |
| ∪⏌ | back + nasal |
| ∪ᵔ | back + glide |
| ⊃⌇ | throat + voice |
| ⊃⌀ | throat + friction |
| ⊃⏌ | throat + nasal |
| ⊃ᵔ | throat + glide |

### 5. Modifier + modifier pairs

Taken: `z` = friction + voice (`⌀⌇`).

Unused pairs:

| Symbols | Reading |
| --- | --- |
| ⌇⌀ | voice + friction |
| ⌇⏌ | voice + nasal |
| ⌇ᵔ | voice + glide |
| ⌀⏌ | friction + nasal |
| ⌀ᵔ | friction + glide |
| ⏌⌇ | nasal + voice |
| ⏌⌀ | nasal + friction |
| ⏌ᵔ | nasal + glide |
| ᵔ⌇ | glide + voice |
| ᵔ⌀ | glide + friction |
| ᵔ⏌ | glide + nasal |

## IPA vowels (primary map only; rest open)

IPA chart order (front → central → back, then closing diphthongs, then centring).
Only the **most direct** assignment for each Fonora key is filled in (from `language-rules.md` example / lexical head, e.g. `e` = DRESS /ɛ/).
All other IPA qualities are **open**: not claimed by a symbol, even if today's encoder collapses them onto a key.

| IPA | Lexical / role | Example words | Fonora key | Symbols |
| --- | --- | --- | --- | --- |
| i | close front | *happy, city (varies)* | open | |
| iː | FLEECE | *see* | `ee` | ⚬⌇ |
| ɪ | KIT | *sit* | `i` | ⚬∩ |
| ᵻ | reduced close | *roses (varies)* | open | |
| e | close-mid front | *cafe (loan)* | open | |
| eː | long mid front | *bed (lengthened)* | open | |
| ɛ | DRESS | *bed* | `e` | ⚬⌓ |
| æ | TRAP | *cat* | `ae` | ⚬⌀ |
| a | open front/central | *pasta (loan)* | open | |
| ɐ | near-open central | *comma (some)* | open | |
| ə | schwa | *about, sofa* | open | |
| ɚ | r-colored schwa | *butter (rhotic)* | open | |
| ɜ | NURSE short | *nurse (some)* | open | |
| ɜː | NURSE | *bird, nurse* | open | |
| ʌ | STRUT / CUP | *cup* | `a` | ⚬∪ |
| ɑ | PALM / open back | *father* | `o` | ⚬⊃ |
| ɑː | PALM long | *father, car (non-rhotic)* | open | |
| ɒ | LOT (GB) | *lot, not* | open | |
| ɔ | THOUGHT | *thought, law* | open | |
| ɔː | THOUGHT long | *caught, north* | open | |
| o | close-mid back | *go (monophthong)* | open | |
| oː | long close-mid back | *go (lengthened)* | open | |
| ʊ | FOOT | *book* | `u` | ⚬∋ |
| u | GOOSE short token | *boot (some)* | open | |
| uː | GOOSE | *goose, boot* | open | |
| ʉ | GOOSE fronted | *goose (AU/NZ)* | open | |
| ɯ | close back unrounded | *loan / other langs* | open | |
| eɪ | FACE | *say* | `ay` | ⚬⌓ᵔ∪ |
| aɪ | PRICE | *pie* | `eye` | ⚬⊃ᵔ∪ |
| ɔɪ | CHOICE | *boy* | `oy` | ⚬⏌ᵔ∪ |
| aʊ | MOUTH | *now* | `ow` | ⚬⊃ᵔ∋ |
| oʊ | GOAT | *go* | `oh` | ⚬⏌ |
| əʊ | GOAT (GB) | *go, boat* | open | |
| ɪə | NEAR | *near, deer* | open | |
| iə | NEAR variant | *near* | open | |
| eə | SQUARE | *square, hair* | open | |
| ʊə | CURE | *cure, pure* | open | |

Primary map (12 keys): `ɪ`→`i`, `ɛ`→`e`, `ʌ`→`a`, `ɑ`→`o`, `ʊ`→`u`, `æ`→`ae`, `iː`→`ee`, `oʊ`→`oh`, `eɪ`→`ay`, `aɪ`→`eye`, `aʊ`→`ow`, `ɔɪ`→`oy`.
Open rows are candidates if the inventory grows with less collapsing.


## What Changed

Dictionary shows phonetic reading as an alternate when morph vs whole-word encode diverges (search indexes both scripts). Encoder, translator canonical path, and seeds unchanged. This note still inventories unused symbol structures for a later vowel-expansion pass.

## Open Questions

- At compound approval, should editors be required to record a phonetic rewrite distinct from the morphological spelling?
- ~~Should dictionary/translator script use full-spelling encode, part-wise encode, or both?~~ **Dictionary:** morph canonical + phonetic alt when they diverge. **Translator/TTS:** still part-wise; constitution-level script canonicity remains open.
- How often do cross-boundary digraphs occur in the approved lexicon beyond `moyi`?
- Does the campfire test care about recoverable roots in the *script*, or only in the roman analysis?
- If diphthong-shaped free slots do not yield new vowels by ear, should expansion look at unused **reverse** or **modifier-pair** consonants instead, or invent a new vowel grammar beyond `⚬X` / `⚬XᵔY`?

## References

- [RN-06 · Hunting ambiguity in the script](/research/notes/hunting-ambiguity-in-the-script)
- [RN-18 · Reconstructing compounds under the constitution](/research/notes/reconstructing-compounds-under-the-constitution)
- [RN-22 · Mouth-intuitive vowel glyphs](/research/notes/mouth-intuitive-vowel-glyphs)
- [RN-23 · Vowel+glide phantom diphthongs](/research/notes/vowel-glide-phantom-diphthongs)
- [fonoran-constitution.md](../fonoran-constitution.md)
- [`docs/language-rules.md`](../language-rules.md)
- [`js/ipa-normalize.js`](../../js/ipa-normalize.js) `ENGLISH_IPA_VOWEL_NORMALIZATION`
- Example compound: `cmp-moyi` in sound bucket / compounds (`mo` + `yi`)
