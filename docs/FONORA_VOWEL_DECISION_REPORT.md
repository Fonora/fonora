# Fonora Vowel-System Decision Report

> **Superseded by v3 vowel architecture** (see `language-rules.md`, `fonora_version: v3`). This report analyzed the retired v2 double-vowel system (`⚬⚬`). Retained for historical context only.

**Status:** Decision document only — no language redesign, no code changes, no `language-rules.md` edits yet.

**Date:** 2026-06-22  
**Rules version:** v2 (`ipa_vowel_mode: v2`)  
**Source of truth:** `language-rules.md` vowel tables + runtime `ipaVowelMap` built by `buildIpaVowelMapFromVowels()`

---

## Executive summary

The runtime vowel map behaves as documented. The open design question is **intentional merger**: four Fonora vowel keys (`e`, `a`, `o`, `ow`) each absorb multiple Wells-style English vowel families. Nine other keys (`ee`, `i`, `ae`, `oh`, `u`, `oo`, `eye`, `oy`, `ay`) stay within a single family (length/dialect variants only).

Current tests mostly verify **cross-key** distinctions (TRAP vs LOT vs STRUT → `ae` vs `o` vs `a`). They do **not** require **within-key** family separation (DRESS vs NURSE, STRUT vs schwa, LOT vs THOUGHT vs PALM, MOUTH vs GOAT diphthong).

**Recommendation at report level:** defer any mapping change until stakeholders choose a design priority (symbol count vs phonetic precision vs learner readability). If a split is desired later, unused recipe slots exist without adding new base characters.

---

## Full inventory (13 vowel keys)

| Key | Recipe | Symbol | Lexical set (rules) | IPA tokens | Example (rules) |
| --- | --- | --- | --- | --- | --- |
| ee | vowel, front_tongue | ⚬∩ | FLEECE | i, iː | see |
| i | vowel, middle_tongue | ⚬◠ | KIT | ɪ | sit |
| **e** | vowel, vowel, front_tongue | ⚬⚬∩ | DRESS | ɛ, e, eː, **ɜ, ɜː** | bed |
| ae | vowel, vowel, middle_tongue | ⚬⚬◠ | TRAP | æ | cat |
| **a** | vowel, throat | ⚬⊃ | CUP | **ʌ, ə, ɐ** | cup |
| **o** | vowel, vowel, back_tongue | ⚬⚬∪ | LOT / THOUGHT | **ɑ, ɒ, ɔ, ɑː, ɔː** | father |
| oh | vowel, back_tongue | ⚬∪ | GOAT | o, oː | go |
| u | vowel, lips | ⚬∋ | FOOT | ʊ | book |
| oo | vowel, vowel, lips | ⚬⚬∋ | GOOSE | u, uː, ʉ, ɯ | boot |
| eye | vowel, vowel, back_tongue, glide, front_tongue | ⚬⚬∪⌣∩ | PRICE | aɪ | pie |
| **ow** | vowel, vowel, back_tongue, glide, lips | ⚬⚬∪⌣∋ | MOUTH / GOAT diphthong | **aʊ, əʊ, oʊ** | now |
| oy | vowel, vowel, back_tongue, glide, middle_tongue | ⚬⚬∪⌣◠ | CHOICE | ɔɪ | boy |
| ay | vowel, vowel, front_tongue, glide, front_tongue | ⚬⚬∩⌣∩ | FACE | eɪ | say |

**Supplemental (not a vowel key):** `ɚ` → phoneme sequence `a` + `r` (splits rhotic schwa across STRUT-family vowel + /r/).

Multi-family keys are **bolded**. All pipeline data below uses eSpeak **en-us** unless noted.

---

## Multi-family key 1: `e` (DRESS + NURSE)

### 1. Current IPA tokens

| Token | Typical family |
| --- | --- |
| ɛ, e, eː | DRESS |
| ɜ, ɜː | NURSE |

### 2. Current example words (rules)

- **Rules example:** *bed* (DRESS)
- **No NURSE example** in the vowel table; NURSE is only implied by IPA list

### 3. English contrasts that collapse

| Contrast | Families | Fonora result |
| --- | --- | --- |
| DRESS vs NURSE | ɛ/ɛː vs ɜ/ɜː | Same key `e`, same symbol ⚬⚬∩ |

Related (not same minimal pair, but same key): FACE monophthong `eː` also maps to `e` while diphthong FACE `eɪ` maps to `ay`.

### 4. Real word examples (en-us pipeline)

| Word | eSpeak IPA | Fonora keys | Fonora symbols |
| --- | --- | --- | --- |
| **bed** | bˈɛd | b **e** d | ⌇∋ ⚬⚬∩ ⌇∩ |
| **bird** | bˈɜːd | b **e** d | ⌇∋ ⚬⚬∩ ⌇∩ |
| turn | tˈɜːn | t **e** n | ∩ ⚬⚬∩ ⏌∩ |

**bed** and **bird** produce **identical** Fonora spellings.

### 5. Merger acceptability

| Criterion | Assessment |
| --- | --- |
| Human readability | **Poor** for English learners — *bed* and *bird* are a classic minimal pair; merged spelling removes a high-frequency contrast. |
| Phonetic precision | **Poor** — NURSE and DRESS are separate standard lexical sets with distinct vowel quality. |
| Cross-dialect tolerance | **Mixed** — NURse vowel quality varies (rhotic vs non-rhotic), but merging with DRESS is not dialect-driven; it is inventory compression. |
| Minimal symbol count | **Strong** — one core front vowel slot (⚬⚬∩) covers two major English classes. |

### 6. Recommended options

| Option | Description | Pros | Cons |
| --- | --- | --- | --- |
| **Keep merged** | Leave `e` = DRESS + NURSE | Smallest inventory; no new symbols | *bed*/*bird* homographs in Fonora |
| **Split: new vowel key** | e.g. `er` or `ur` for ɜ/ɜː with new recipe | Restores major minimal pair | +1 vowel key; must pick recipe + IPA split |
| **Split: testing mode only** | Production map unchanged; validation UI flags DRESS/NURSE collisions | Zero learner impact until decided | Two sources of truth; confusing if left long-term |
| **Dialect-dependent** | NURSE → separate key only in rhotic dialects | Matches some teaching contexts | Complex; non-rhotic still needs NURSE vowel |

**Report lean:** If phonetic precision or learner readability is prioritized, **split** (new key) is the clearest fix. If universal minimal inventory remains the top goal, **keep merged** but document *bed*/*bird* as known homographs.

### 7. Impact on tests and collision reports

| Suite | Impact if split |
| --- | --- |
| `npm test` | Update `normalizeIpa('ɜː')` expectations; add round-trip tests for *bed* vs *bird* distinct symbols |
| `test:v2-collisions` | No current group covers DRESS/NURSE — **new minimal-pair group recommended** |
| `audit:collisions` | `e + y` ↔ `ay` collision unchanged; no direct `e`-family concat collision today |
| Pronunciation validation | Would still round-trip; **new metric**: within-family homograph rate |
| Vowel readability report | Would gain a DRESS/NURSE distinction row |

---

## Multi-family key 2: `a` (STRUT + COMMA/schwa)

### 1. Current IPA tokens

| Token | Typical family |
| --- | --- |
| ʌ | STRUT (rules label: CUP) |
| ə | COMMA / weak schwa |
| ɐ | Near-open central (often weak vowel or STRUT variant in transcription) |

### 2. Current example words (rules)

- **Rules example:** *cup* (STRUT)

### 3. English contrasts that collapse

| Contrast | Families | Fonora result |
| --- | --- | --- |
| STRUT vs unstressed schwa | ʌ vs ə | Same key `a`, symbol ⚬⊃ |
| Stressed vs unstressed syllables | e.g. *cup* vs *about* (final vowel) | Both use `a` when schwa/ʌ-class |
| STRUT vs near-open weak | ʌ vs ɐ | Same key |

**Note:** TRAP (`ae`) and STRUT (`a`) remain **distinct keys** — `cat`/`cut` still contrast.

### 4. Real word examples (en-us pipeline)

| Word | eSpeak IPA | Fonora keys | Notes |
| --- | --- | --- | --- |
| **cup** | kˈʌp | k **a** p | Stressed STRUT |
| **about** | ɐbˈaʊt | **a** b ow t | Initial ɐ → `a`; nucleus aʊ → `ow` |
| hello | həlˈoʊ | h **a** l ow | Medial schwa → `a` |
| sofa | sˈoʊfə | s ow f **a** | Final schwa → `a` |
| cut | kˈʌt | k **a** t | Same key as schwa words |

*cup* and unstressed vowels in *about* / *hello* / *sofa* all use ⚬⊃ — but **cup** vs **cut** still differ from *cat* via `ae`.

### 5. Merger acceptability

| Criterion | Assessment |
| --- | --- |
| Human readability | **Mixed** — learners may accept one “short central” glyph for schwa + STRUT; linguists expect schwa as separate category. |
| Phonetic precision | **Moderate loss** — stress-neutral schwa is not the same phoneme as stressed STRUT, but merger matches some practical orthographies. |
| Cross-dialect tolerance | **Good** — STRUT vowel quality varies widely; schwa is universal; single central key is defensible for a **phonemic shorthand** system. |
| Minimal symbol count | **Strong** — one throat-place vowel (⚬⊃) for all central lax vowels. |

### 6. Recommended options

| Option | Description | Pros | Cons |
| --- | --- | --- | --- |
| **Keep merged** | Treat `a` as “central lax / weak vowel” | Simple; works for CV demos (`pa` uses same key) | Loses STRUT vs schwa distinction |
| **Split: schwa key** | New key for ə (and maybe ɐ), e.g. recipe `vowel, vowel, throat` → ⚬⚬⊃ | STRUT vs schwa minimal pairs (*but* / *bot* patterns) | +1 key; stress detection needed for encoding |
| **Split: testing mode only** | Flag ə vs ʌ mismatches in validation UI | Safe experiment | Does not fix spelling for learners |
| **Dialect-dependent** | Map ɐ/ə differently by dialect | Rarely worth complexity | STRUT/schwa is not mainly dialectal |

**Report lean:** **Keep merged** is reasonable if Fonora targets a **compact phonemic shorthand** rather than full lexical-set fidelity. Split only if unstressed vowel distinction becomes a product requirement.

### 7. Impact on tests and collision reports

| Suite | Impact if split |
| --- | --- |
| `npm test` | `schwa vowel encodes as ⚬⊃` → would need two central keys; `pa`/`pee` demos unchanged |
| `test:v2-collisions` | Group 1 (*cat/cot/cut*) unaffected — uses `ae`/`o`/`a` as **different keys** |
| `audit:collisions` | No concat collision on `a` alone |
| Pronunciation validation | *hello*, *about* would change symbols if schwa split |
| Supplemental `ɚ` → `a` + `r` | Splitting schwa affects rhotic decomposition policy |

---

## Multi-family key 3: `o` (LOT + THOUGHT + PALM/START)

### 1. Current IPA tokens

| Token | Typical family (en-us) |
| --- | --- |
| ɑ, ɒ | LOT (dialect-dependent; ɒ more GB) |
| ɔ | THOUGHT/CLOT (short o in some systems) |
| ɑː | PALM / START / CAR (en-us: often [ɑɹ]) |
| ɔː | THOUGHT / NORTH / FORCE (en-us: often [ɔɹ]) |

Rules lexical_set: **LOT / THOUGHT** — PALM/START is **not named** but included via ɑː.

### 2. Current example words (rules)

- **Rules example:** *father* (PALM/FATHER — uses ɑː, not LOT short vowel)

The example word documents PALM-class while the lexical_set name says LOT/THOUGHT.

### 3. English contrasts that collapse

| Contrast | Families | Fonora result |
| --- | --- | --- |
| LOT vs THOUGHT (short vs long back) | ɑ vs ɔː | Same key `o` when mapped |
| PALM/START vs LOT | ɑː vs ɑ | Same key `o` |
| THOUGHT vs PALM (en-us) | ɔː vs ɑː | Same key `o` — **hot/caught/father/car** merge |
| PALM vs GOAT (monophthong) | ɑː vs o | **Distinct** — `o` vs `oh` (*car* vs *core*) |

Cross-key contrasts preserved: TRAP `ae` vs `o` (*cat*/*cot*), STRUT `a` vs `o` (*cut*/*cot*).

### 4. Real word examples (en-us pipeline)

| Word | eSpeak IPA | Fonora keys | Fonora symbols |
| --- | --- | --- | --- |
| **hot** | hˈɑːt | h **o** t | ⊃ ⚬⚬∪ ∩ |
| **caught** | kˈɔːt | k **o** t | ∪ ⚬⚬∪ ∩ |
| **father** | fˈɑːðɚ | f **o** dh a r | ⌀∋ ⚬⚬∪ ∩⌇ ⚬⊃ ⌣◠ |
| **car** | kˈɑːɹ | k **o** r | ∪ ⚬⚬∪ ⌣◠ |
| cot | kˈɑːt | k **o** t | ∪ ⚬⚬∪ ∩ |
| core | kˈoːɹ | k **oh** r | ∪ ⚬∪ ⌣◠ |
| saw | sˈɔː | s **o** | ⌀∩ ⚬⚬∪ |

**hot**, **caught**, **father**, and **car** all use ⚬⚬∪ — identical vowel symbol regardless of THOUGHT vs PALM class.

### 5. Merger acceptability

| Criterion | Assessment |
| --- | --- |
| Human readability | **Poor for en-us learners** — *hot*/*caught* and *car*/*core* involve distinct vowel classes; only the latter pair is separated (`o` vs `oh`). |
| Phonetic precision | **Poor** — three major back-vowel classes in one key; rules text already acknowledges two (LOT/THOUGHT) and silently adds PALM via IPA. |
| Cross-dialect tolerance | **Mixed** — merger absorbs GB/US differences into one glyph, but hides contrasts that **are** maintained in each dialect internally. |
| Minimal symbol count | **Strong** — one back double-vowel slot (⚬⚬∪) covers most non-GOAT back vowels. |

### 6. Recommended options

| Option | Description | Pros | Cons |
| --- | --- | --- | --- |
| **Keep merged** | Single back open vowel “o” | Matches current 5-vowel-plane aesthetic; v2 collision groups pass | *hot*/*caught*/*car* homographs |
| **Split: THOUGHT key** | Move ɔ, ɔː to new key (new recipe) | Separates THOUGHT from LOT/PALM partially | Still may need PALM split from LOT |
| **Split: PALM/START key** | Move ɑː to new key; leave ɑ/ɒ/ɔ in `o` | *car* vs *cot* could differ | +1–2 keys; recipe selection needed |
| **Split: testing mode only** | Validation flags THOUGHT vs PALM vs LOT under same symbol | Informs design without breaking users | No spelling fix |
| **Dialect-dependent** | e.g. en-gb vs en-us different ɑː mapping | Handles some cross-dialect IPA | Does not fix within-dialect *hot*/*caught* |

**Report lean:** This is the **highest-impact** merger for en-us. Any serious phonetic-precision goal requires at least **one split** (THOUGHT and/or PALM). Keeping merged is only consistent if Fonora explicitly accepts **back-vowel homographs**.

### 7. Impact on tests and collision reports

| Suite | Impact if split |
| --- | --- |
| `npm test` | `cat/cot/cut`, `encodeFromIpa('kɑt')` assertions; recipe composition tests for `o` |
| `test:v2-collisions` | Groups 1, 2, 4, 5 use `o` — would **still pass** if splits distinguish *cot* vs *caught* vs *car* |
| `audit:collisions` | **`o + r` ↔ `oy`** and **`o + y` ↔ `eye`**, **`o + w` ↔ `ow`** — splits may **reduce** vowel+glide collisions if sequences no longer match composites |
| Pronunciation validation | 5 collision warnings on *bar/car/far/for/farther* — structural; splitting `o` may change collision class membership |
| Vowel test sets | Groups 5–8 (*pan/pawn*, *father/fodder*, *car/core*, *palm/pom*) document contrasts **partially lost** in spelling |

---

## Multi-family key 4: `ow` (MOUTH + GOAT diphthong)

### 1. Current IPA tokens

| Token | Typical family |
| --- | --- |
| aʊ | MOUTH |
| oʊ, əʊ | GOAT (diphthong realizations) |

Rules lexical_set explicitly names **both**: MOUTH / GOAT diphthong.

**Overlap with `oh`:** monophthong GOAT `o`, `oː` maps to **`oh`** (⚬∪), while diphthong GOAT `oʊ` maps to **`ow`**. GOAT is already split across two keys by realization type.

### 2. Current example words (rules)

- **Rules example:** *now* (MOUTH)

### 3. English contrasts that collapse

| Contrast | Families | Fonora result |
| --- | --- | --- |
| MOUTH vs GOAT diphthong | aʊ vs oʊ | Same key `ow`, symbol ⚬⚬∪⌣∋ |
| GOAT monophthong vs diphthong | `oh` vs `ow` | **Distinct keys** — *core* uses `oh`, *go* uses `ow` |

### 4. Real word examples (en-us pipeline)

| Word | eSpeak IPA | Fonora keys | Fonora symbols |
| --- | --- | --- | --- |
| **now** | nˈaʊ | n **ow** | ⏌∩ ⚬⚬∪⌣∋ |
| **go** | ɡˈoʊ | g **ow** | ⌇∪ ⚬⚬∪⌣∋ |
| hello | həlˈoʊ | h a l **ow** | ⊃ ⚬⊃ ⌣∪ ⚬⚬∪⌣∋ |
| sofa | sˈoʊfə | s **ow** f a | ⌀∩ ⚬⚬∪⌣∋ ⚬⊃ |
| core | kˈoːɹ | k **oh** r | ∪ ⚬∪ ⌣◠ |

**now** and **go** share ⚬⚬∪⌣∋ — classic MOUTH/GOAT diphthong collision in spelling.

### 5. Merger acceptability

| Criterion | Assessment |
| --- | --- |
| Human readability | **Poor** — *now* and *go* are a standard minimal pair in teaching materials. |
| Phonetic precision | **Poor** for diphthong classes; **partial** relief via `oh` for monophthong GOAT only. |
| Cross-dialect tolerance | **Mixed** — əʊ (GB) and oʊ (US) both land on `ow`; MOUTH still collides with both. |
| Minimal symbol count | **Strong** — one back+glide+lips composite covers two diphthong families. |

### 6. Recommended options

| Option | Description | Pros | Cons |
| --- | --- | --- | --- |
| **Keep merged** | Single diphthong slot for “back offglide to lips” | Minimal inventory; *core* vs *go* partially saved via `oh` | *now*/*go* homographs |
| **Split: MOUTH key** | New composite for aʊ only (different glide target or place chain) | Restores *now*/*go* | +1 composite key; must avoid `o+w` collision |
| **Split: route oʊ → oh** | Map oʊ/əʊ to `oh`, keep aʊ on `ow` | Uses existing key; no new symbol | `oh` becomes multi-family (mono + diphthong GOAT); may confuse “oh” naming |
| **Split: testing mode only** | Flag MOUTH/GOAT under same `ow` | Safe analysis | No learner fix |
| **Dialect-dependent** | əʊ → `ow`, oʊ → `oh` by dialect | Partial GB/US split | MOUTH still merged with one GOAT realization |

**Report lean:** **Split MOUTH from GOAT diphthong** is the most pedagogically aligned fix. Remapping oʊ → `oh` is a lighter-weight experiment but overloads `oh`.

### 7. Impact on tests and collision reports

| Suite | Impact if split |
| --- | --- |
| `npm test` | `composite diphthongs` test for `ow`; encode/decode round-trips for *hello* |
| `test:v2-collisions` | No *now*/*go* group today — **add recommended** |
| `audit:collisions` | **`o + w` ↔ `ow`** collision — splitting/rerouting may resolve or move collision to different sequence |
| Pronunciation validation | *hello* end vowel uses `ow`; would change under split |
| Homograph note (`language-rules.md`) | Composite recipes for `eye`/`oy`/`ow`/`ay` were chosen to avoid cross-composite clashes — **new composite must be checked against `o+w`, `o+y`, `o+r` sequences** |

---

## Single-family keys (no action required for family merger)

These keys may map multiple IPA **tokens** but stay within one English vowel family (length, rounding, or dialect allophony):

| Key | Families covered | Notes |
| --- | --- | --- |
| ee | FLEECE only | i vs iː |
| i | KIT only | |
| ae | TRAP only | Best-separated short vowel |
| oh | GOAT monophthong only | Distinct from `ow` diphthong GOAT |
| u | FOOT only | |
| oo | GOOSE only | u/uː/ʉ/ɯ variants |
| eye | PRICE only | |
| oy | CHOICE only | |
| ay | FACE only | Distinct from `e` (DRESS/NURSE) for eɪ |

---

## Unused / reserved vowel-like symbol recipes

No new base characters (5 places + 4 manners + ⚬) are required for potential splits. The composer supports recipes built from existing tokens (`vowel`, places, `glide`, manners).

### Currently unused core-style recipes (distinct from existing keys)

| Candidate recipe | Symbol | Could support (hypothetical) |
| --- | --- | --- |
| `vowel, vowel, throat` | ⚬⚬⊃ | Schwa / COMMA split from STRUT `a` (⚬⊃) |
| `vowel, voice` | ⚬⌇ | Voiced vowel marker / alternate tier |
| `vowel, friction` | ⚬⌀ | Fricative-colored vowel (research) |
| `vowel, nasal` | ⚬⏌ | Nasalized vowel (research) |
| `vowel, glide` | ⚬⌣ | Glide-colored monophthong (research) |

### Unused composite glide recipes (place permutations not assigned)

Existing composites use: back+glide+{front,lips,middle}. **Unused** permutations with distinct symbols include:

| Recipe pattern | Example symbol | Notes |
| --- | --- | --- |
| vowel, vowel, **front_tongue**, glide, **lips** | ⚬⚬∩⌣∋ | MOUTH-like with front anchor (distinct from ⚬⚬∪⌣∋) |
| vowel, vowel, **front_tongue**, glide, **middle_tongue** | ⚬⚬∩⌣◠ | Unused PRICE/CHOICE variant plane |
| vowel, vowel, **middle_tongue**, glide, **lips** | ⚬⚬◠⌣∋ | Unused |
| vowel, vowel, **throat**, glide, **{place}** | ⚬⚬⊃⌣∩ … | Central-vowel diphthong plane |
| vowel, vowel, **{place}**, glide, **{manner}** | e.g. ⚬⚬∪⌣⌇ | Manner-terminated composites (42 unused candidates scanned) |

**Collision check required before any adoption:** `audit:collisions` documents that sequences `o + w`, `o + y`, `o + r`, `e + y` match composite symbols for `ow`, `eye`, `oy`, `ay`. New recipes must be validated against concatenation hazards.

### Reserved non-vowel grid slots (throat column)

Four throat-column grid cells are **reserved** (`?`): voice+throat, friction+throat, nasal+throat, glide+throat. These are not vowel recipes but could host future consonants without expanding the alphabet.

---

## Cross-cutting test and report impact summary

| Artifact | What it validates today | Sensitivity to vowel splits |
| --- | --- | --- |
| `npm test` (43 tests) | Recipe composition, `ae`/`o`/`a` cross-key distinction, schwa→`a`, composites | **High** — normalization assertions hard-coded to current map |
| `npm run test:v2-collisions` | 5 groups, 13 words — **distinct symbols per group** | **Low for cross-key splits**; passes today even with within-key mergers |
| `npm run test:vowels` | Readability across minimal-pair groups | **Medium** — documents expected contrasts |
| `npm run audit:collisions` | Concat hazards, `o+r`/`o+w`/`e+y` | **High** — any new composite or key changes hazard table |
| `npm run test:pronunciation-validation` | 22-word IPA round-trip (100% today) | **Low** — round-trip succeeds; splits change symbols not pipeline integrity |
| Pronunciation Validation UI | Collision warnings on `o+r` words | **Medium** — warnings shift if `o` splits or recipes change |

**Important:** v2 collision “0 groups with collision” means **minimal-pair groups produce different symbol strings from each other** — not that English vowel families are faithfully preserved **within** a key.

---

## Decision matrix (for stakeholders)

| Priority | Suggested direction |
| --- | --- |
| **Minimal symbol inventory** | Keep all four mergers; document homograph pairs explicitly |
| **Learner readability (en-us)** | Split `o` (PALM/THOUGHT) and `ow` (MOUTH/GOAT) first; then `e` (NURSE) |
| **Phonetic / lexical-set fidelity** | Split all four; use unused recipes above |
| **Research / reversible experiments** | Testing-mode overlays or dialect profiles before committing markdown |
| **Collision reduction** | Splitting `o` may reduce `o+r` vs `oy` ambiguity for some words — requires re-run `audit:collisions` after any change |

---

## Explicit non-goals (this report)

- No IPA remapping performed
- No `language-rules.md` edits
- No encoder/decoder code changes
- No new separators or boundary markers proposed here

**Next step when approved:** pick one multi-family key, prototype a split recipe from the unused inventory, re-run `npm test`, `audit:collisions`, and `test:pronunciation-validation`, then update markdown.
