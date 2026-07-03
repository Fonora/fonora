---
status: Active
date: 2026-07-03
phase: phase-5
---

# Vowel+Glide Phantom Diphthongs

## Research Question

[RN-22](/research/notes/mouth-intuitive-vowel-glyphs) realigned simple vowel glyphs to tongue **place** (back → front), long vowels to **manner**, and diphthong nuclei to the simple-vowel place recipes. A side effect became visible during manual review: English words like *all* encode as `o + l` → `⚬⊃ᵔ∩`, which **looks** like a diphthong token even though it is not a registered vowel key. The known Category A collisions (`e + y` ↔ `ay`, etc.) were documented in [RN-06](/research/notes/hunting-ambiguity-in-the-script); the audit did not yet enumerate the complementary set — vowel+glide pairs that share diphthong **shape** but are **not** inventory keys.

The question this note addresses:

**How many simple-vowel + glide and long-vowel + glide combinations produce valid v3 diphthong grammar (`⚬XᵔY`) without being registered vowels, which of those are pedagogically misleading, and could any of them plausibly cover collapsed IPA families the current eleven-key inventory merges?**

## Hypothesis

1. **Compositional inevitability:** Because glides use `ᵔY` (same glide token as diphthong offglides) and simple vowels use `⚬X`, every `{vowel} + {w,l,r,y}` pair concatenates to diphthong shape. Phantom diphthongs are a structural feature of the design, not accidental bugs.
2. **Category A stays at four:** Only the four registered diphthongs (`ay`, `eye`, `ow`, `oy`) should equal a decomposed vowel+glide sequence; exact symbol collisions between distinct keys remain zero.
3. **Category B/C are mostly sequences, not missing vowels:** Pairs like `o + l` (*all*) and `o + r` (*car*) should remain vowel + consonant glide in the phoneme model; promoting them to vowel keys would change semantics for /r/ and /l/.
4. **Expansion candidates exist on the centring-diphthong plane:** GB centring vowels (ɪə, eə, ʊə) currently collapse to monophthong keys via [`js/ipa-normalize.js`](../js/ipa-normalize.js); unregistered shapes like `⚬∩ᵔ∪`, `⚬∪ᵔ∪`, and `⚬∋ᵔ⌓` could host them if the inventory grows.

## Approach

### Symbol tiers (post-RN-22)

| Tier | Pattern | Examples |
| --- | --- | --- |
| Simple vowel | `⚬` + place | `a` ⚬∪, `e` ⚬⌓, `i` ⚬∩, `o` ⚬⊃, `u` ⚬∋ |
| Long vowel | `⚬` + manner | `ae` ⚬⌀, `ee` ⚬⌇, `oh` ⚬⏌ |
| Diphthong | `⚬XᵔY` (single key) | `ay` ⚬⌓ᵔ∪, `eye` ⚬⊃ᵔ∪, `ow` ⚬⊃ᵔ∋, `oy` ⚬∋ᵔ∪ |
| Glide consonant | `ᵔ` + place (no ⚬) | `w` ᵔ∋, `l` ᵔ∩, `r` ᵔ⌓, `y` ᵔ∪ |

Glide place alignment matches the consonant grid: lips → back → middle → front for w, y, r, l respectively.

### Audit extension

Added `findUnregisteredVowelShapedSequences()` to [`js/collision-audit.js`](../js/collision-audit.js):

- Scans 5×4 simple-vowel + glide pairs and 3×4 long-vowel + glide pairs
- Validates each concatenated symbol string against [`js/vowel-grammar.js`](../js/vowel-grammar.js)
- Classifies **registered-diphthong** (Category A) vs **unregistered** (Category B simple / Category C long)
- Regenerates [`docs/archive/FONORA_COLLISION_AUDIT.md`](../archive/FONORA_COLLISION_AUDIT.md) §4 via `npm run audit:collisions`

Unit test in [`js/tests-core.js`](../js/tests-core.js): 32 total shapes, 4 registered, 28 unregistered, all grammar-valid.

### Full simple-vowel + glide matrix (5 × 4 = 20)

| Nucleus | + w | + l | + r | + y |
| --- | --- | --- | --- | --- |
| **a** ⚬∪ | ⚬∪ᵔ∋ | ⚬∪ᵔ∩ | ⚬∪ᵔ⌓ | ⚬∪ᵔ∪ |
| **e** ⚬⌓ | ⚬⌓ᵔ∋ | ⚬⌓ᵔ∩ | ⚬⌓ᵔ⌓ | **⚬⌓ᵔ∪ = `ay`** |
| **i** ⚬∩ | ⚬∩ᵔ∋ | ⚬∩ᵔ∩ | ⚬∩ᵔ⌓ | ⚬∩ᵔ∪ |
| **o** ⚬⊃ | **⚬⊃ᵔ∋ = `ow`** | ⚬⊃ᵔ∩ | ⚬⊃ᵔ⌓ | **⚬⊃ᵔ∪ = `eye`** |
| **u** ⚬∋ | ⚬∋ᵔ∋ | ⚬∋ᵔ∩ | ⚬∋ᵔ⌓ | **⚬∋ᵔ∪ = `oy`** |

### Long-vowel + glide matrix (3 × 4 = 12, all unregistered)

| Nucleus | + w | + l | + r | + y |
| --- | --- | --- | --- | --- |
| **ae** ⚬⌀ | ⚬⌀ᵔ∋ | ⚬⌀ᵔ∩ | ⚬⌀ᵔ⌓ | ⚬⌀ᵔ∪ |
| **ee** ⚬⌇ | ⚬⌇ᵔ∋ | ⚬⌇ᵔ∩ | ⚬⌇ᵔ⌓ | ⚬⌇ᵔ∪ |
| **oh** ⚬⏌ | ⚬⏌ᵔ∋ | ⚬⏌ᵔ∩ | **⚬⏌ᵔ⌓** | ⚬⏌ᵔ∪ |

## Evaluation

**Automated audit (Jul 3, 2026):**

- Exact symbol collisions: **0**
- Category A (registered diphthong = decomposed sequence): **4**
- Category B (simple unregistered): **16**
- Category C (long unregistered): **12**
- Greedy decoder mis-recovery on Category A only (spacing fixes decode); Category B/C decode correctly as two phonemes because no single key matches

**Manual spot-check:**

| Word | Phoneme keys | Vowel-shaped substring | Registered? |
| --- | --- | --- | --- |
| *all* | `o l` | ⚬⊃ᵔ∩ | No — phantom diphthong |
| *say* | `ay` | ⚬⌓ᵔ∪ | Yes — equals `e + y` |
| *car* | `a o r` | ⚬⊃ᵔ⌓ in nucleus | No — phantom diphthong |
| *core* | `a oh r` | ⚬⏌ᵔ⌓ | No — phantom diphthong |
| *boy* | `a oy` | ⚬∋ᵔ∪ | Yes — equals `u + y` |

## Findings

### Category A — intentional homographs (4)

These are **features** of the mouth-intuitive design after RN-22: the diphthong glyph visibly composes from its simple-vowel nucleus plus glide target.

| Sequence | Key | IPA | Example |
| --- | --- | --- | --- |
| `e + y` | `ay` | eɪ | say |
| `o + y` | `eye` | aɪ | pie |
| `o + w` | `ow` | aʊ | now |
| `u + y` | `oy` | ɔɪ | boy |

Greedy decode on unsegmented text recovers the diphthong key, not the decomposed sequence. Pipeline spacing mitigates round-trip; visual homography in contiguous script remains.

### Category B/C — phantom diphthongs (28)

High-salience entries (frequent in English, strong misread risk):

| Symbol | Sequence | Example | Verdict |
| --- | --- | --- | --- |
| ⚬⊃ᵔ∩ | `o + l` | *all*, *walk*, *cold* | Stay sequence — /l/ is coda, not offglide |
| ⚬⊃ᵔ⌓ | `o + r` | *car*, *for*, *bar* | Stay sequence unless r-vowels promoted |
| ⚬⏌ᵔ⌓ | `oh + r` | *core*, *bor*, *soar* | Stay sequence (GOAT + /r/) |
| ⚬∪ᵔ⌓ | `a + r` | NURSE/STRUT r-coloring | Stay sequence under current /r/ model |
| ⚬⌓ᵔ⌓ | `e + r` | *her*, *err* | Stay sequence |

### Phonetic expansion analysis (question 2)

**Tier 1 — worth studying if inventory grows (centring diphthongs, GB English):**

| Candidate | Sequence | Collapsed IPA today | Lexical set |
| --- | --- | --- | --- |
| ⚬∩ᵔ∪ | `i + y` | ɪə → `i` | NEAR |
| ⚬∪ᵔ∪ | `a + y` | eə → `a` | SQUARE |
| ⚬∋ᵔ⌓ | `u + r` | ʊə → `u` | CURE (non-rhotic) |

_Full adoption specs for these three keys: see **Proposed inventory additions** below._

**Tier 2 — semantic fork (r-colored vowels as unit keys):**

Promoting ⚬⊃ᵔ⌓ or ⚬∪ᵔ⌓ to vowel keys would unify rhotic nuclei visually but reclassify post-vocalic /r/ from consonant glide to part of the vowel phoneme. *car* would become one vowel token, not `o r`.

**Tier 3 — not monophthong splits:**

Collapsed families under `u` (ʊ, u, uː, ʉ, ɯ), `o` (LOT/THOUGHT/PALM), and `a` (STRUT/schwa/NURSE) require **new `⚬X` simple or long keys**, not vowel+glide composites. All five place slots and three manner long slots are occupied in [`docs/language-rules.md`](../docs/language-rules.md). No unregistered `⚬XᵔY` cleanly separates FOOT from GOOSE — e.g. ⚬∋ᵔ∪ is **`oy`**, not a GOOSE variant.

**RN-22 intuition confirmed:** The `e + y` → `ay` case is pedagogically coherent (DRESS nucleus ⌓ + y-glide to ∪ reads as FACE). Phantom diphthongs like *all* (⚬⊃ᵔ∩) show the same compositional logic applied to coda /l/, which is why they **look** like vowels without **being** vowel phonemes in the current model.

## Headline numbers (audit snapshot)

Summary from `npm run audit:collisions` (Jul 3, 2026, v3 rules):

| Metric | Count | Notes |
| --- | ---: | --- |
| Exact symbol collisions | **0** | No two distinct phoneme keys share one string |
| Category A — registered diphthong = decomposed sequence | **4** | `e+y`↔`ay`, `o+w`↔`ow`, `o+y`↔`eye`, `u+y`↔`oy` |
| Category B — simple unregistered phantom diphthongs | **16** | e.g. `o+l` → ⚬⊃ᵔ∩ (*all*) |
| Category C — long unregistered phantom diphthongs | **12** | e.g. `oh+r` → ⚬⏌ᵔ⌓ (*core*) |
| **Total vowel-shaped `⚬XᵔY` forms scanned** | **32** | 5×4 simple + 3×4 long |
| Greedy decoder hazards (2-phoneme sequences) | **20** | 4 vowel+glide + 16 derived-order |
| Concatenation → sequence collisions | **15** | Mostly th/dh/v reverse orderings (RN-06) |

Phantom diphthongs decode correctly as two phonemes; Category A homographs are the ones where greedy decode prefers the diphthong key.

## Proposed inventory additions (documentation only)

**Status:** Suggestions for a future rules pass. **Not implemented** in `language-rules.md`, encoder, IPA maps, or tests as of this note.

### Recommended priority order

| Priority | Addition | Rationale | Cost |
| --- | --- | --- | --- |
| **1** | Three centring diphthongs (below) | Fills a real GB English gap; symbols already exist as unregistered shapes; compositional recipes match RN-22 tier logic | +3 vowel keys; +3 Category A homographs; IPA routing changes |
| **2** | Glottal stop on `⏌⊃` (below) | Fills reserved throat-column slot; removes `ʔ` → `?` fallback for English and Arabic | +1 grid key; collision audit; keyboard assignment |
| **3** | FOOT / GOOSE split | High learner value for *book*/*boot* | Requires new `⚬X` simple or long slot (all occupied today) |
| **4** | LOT / THOUGHT / PALM split | High en-us learner value | Same — no free place/manner vowel slot |
| **Defer** | Promote `o+r`, `o+l` phantom shapes to vowel keys | Changes /r/ and /l/ from glides to offglides inside vowel phonemes | Semantic fork; not recommended without r-vowel policy |

---

### Suggested vowel additions (3 centring diphthongs)

GB English centring diphthongs (NEAR, SQUARE, CURE) currently collapse in [`js/ipa-normalize.js`](../js/ipa-normalize.js): `ɪə`/`iə` → `i`, `eə` → `a`, `ʊə` → `u`. Registering three new diphthong keys on **existing unregistered shapes** restores them without new base characters.

| Proposed key | Proposed symbol | Proposed recipe | IPA | Lexical set | Example | Phantom / collision if adopted |
| --- | --- | --- | --- | --- | --- | --- |
| `ear` | ⚬∩ᵔ∪ | vowel, front_tongue, glide, back_tongue | ɪə, iə | NEAR | *near*, *deer* | **`i + y` ↔ `ear`** (new Category A, same class as `e + y` ↔ `ay`) |
| `air` | ⚬∪ᵔ∪ | vowel, back_tongue, glide, back_tongue | eə | SQUARE | *square*, *hair* (non-rhotic) | **`a + y` ↔ `air`** (distinct from `eye` ⚬⊃ᵔ∪ — different nucleus) |
| `ure` | ⚬∋ᵔ⌓ | vowel, lips, glide, middle_tongue | ʊə | CURE | *cure*, *pure* (non-rhotic) | **`u + r` ↔ `ure`** (also affects rhotic *poor* sequences; dialect policy needed) |

**Teaching read (mouth-intuitive):**

- **`ear`:** KIT-class front nucleus ∩ + y-glide to back ∪ — “front vowel glides toward back,” parallel to `ay` (middle → back).
- **`air`:** CUP-class back nucleus ∪ + y-glide to ∪ — schwa-like centering written as back + y (same offglide target as FACE/PRICE diphthongs).
- **`ure`:** FOOT-class lips nucleus ∋ + r-colouring ⌓ — matches non-rhotic *cure* with an /r/-coloured offglide; weaker fit for rhotic dialects where CURE merges with FORCE.

**Sound Grid tier:** Diphthong group (fourth row becomes seven keys: `ay`, `eye`, `ow`, `oy`, `ear`, `air`, `ure`).

**Before adoption checklist:**

1. Re-run `npm run audit:collisions` — expect +3 sequence-equals-single rows.
2. Update `ENGLISH_IPA_VOWEL_NORMALIZATION` and vowel tables (remove centring collapse for targeted dialects, or gate behind `en-gb` profile per [RN-05](/research/notes/one-script-for-every-language)).
3. Extend greedy-decoder / spacing tests for `i y`, `a y`, `u r`.
4. Confirm no exact symbol collision with existing keys (audit expects **0**).

**Example encode change (if adopted, illustrative only):**

| Word | Today | Proposed |
| --- | --- | --- |
| *near* | `n i r` (ɪə → `i`) | `n ear` |
| *square* | `s k w a r` (eə → `a`) | `s k w air` |
| *cure* | `k y u r` (ʊə → `u`) | `k y ure` |

---

### Suggested consonant addition: glottal stop `⏌⊃`

The throat column has two **reserved** grid cells ([`docs/language-rules.md`](../docs/language-rules.md)):

| Slot | Symbol | Status today |
| --- | --- | --- |
| nasal + throat | **`⏌⊃`** | reserved (`?`) |
| glide + throat | `ᵔ⊃` | reserved (`?`) |

**Proposal:** Assign **`⏌⊃`** to the glottal stop /ʔ/, phoneme key e.g. `q` or `glottal` or `'` (exact key TBD at adoption).

**Articulatory rationale (imperfect but usable):**

- Place is throat/glottis (⊃), matching the locus of /ʔ/.
- The nasal manner glyph ⏌ is not ideal for a stop — a true “plain stop at throat” would collide with **`h`** (`⊃` alone). The reserved **`⏌⊃`** slot is the only unused **composed** throat consonant that reads as “modified glottal articulation.”
- Alternative **`ᵔ⊃`** (glide + throat) is less intuitive for a hard closure; **`⏌⊃`** is the user-preferred candidate for documentation.

**English use cases:**

| Word | Phenomenon | IPA (approx.) | Today | Proposed segment |
| --- | --- | --- | --- | --- |
| *better* | Intervocalic /t/ → glottal stop (many dialects) | ˈbɛʔə | `b e t a` or flap routing | `b e ⏌⊃ a` |
| *button* | Glottalized /t/ | ˈbʌʔn | `b a t n` | `b a ⏌⊃ n` |
| *uh-oh* | Glottal onset | ʔʌ | `? a` (fallback) | `⏌⊃ a` |

**Multilingual:** Arabic hamza /ʔ/ and other languages map `ʔ` → `?` today ([`js/ipa-normalize.js`](../js/ipa-normalize.js) `SUPPLEMENTAL_CONSONANT_MAP`). Assigning `⏌⊃` would remove a common `?` fallback ([RN-05](/research/notes/one-script-for-every-language)).

**Before adoption checklist:**

1. Pick phoneme key and keyboard binding (throat column key **5** + manner **j**? — conflicts with nasal modifier semantics; may need teaching note).
2. Confirm **`⏌⊃`** does not concatenate-collide with **`oh`** vowel ⚬⏌ + **`h`** ⊃ in unsegmented text (vowel + consonant boundary policy).
3. Distinguish from **`h`** (/h/ fricative at same place) in learner docs — closure vs friction at glottis.
4. Re-run collision audit and pronunciation validation word list with *better*, *button*, *beater* minimal pairs.

**Not proposed:** Repurposing plain **`⊃`** for /ʔ/ — already **`h`**. Not proposing **`ᵔ⊃`** in this note unless glottal is analyzed as a zero-duration glide (weaker story).

---

### Best expansion options — summary matrix

| Option | Symbol / key | Type | Implement? | Why |
| --- | --- | --- | --- | --- |
| NEAR diphthong | `ear` ⚬∩ᵔ∪ | vowel | **Yes — top vowel pick** | Clear GB gap; compositional; symbol free |
| SQUARE diphthong | `air` ⚬∪ᵔ∪ | vowel | **Yes — top vowel pick** | Same |
| CURE diphthong | `ure` ⚬∋ᵔ⌓ | vowel | **Yes — with dialect caveat** | Non-rhotic fit; rhotic policy needed |
| Glottal stop | `⏌⊃` (key TBD) | consonant | **Yes — top consonant pick** | Reserved slot; fixes `ʔ` fallback |
| R-vowel unit (`o+r` → key) | ⚬⊃ᵔ⌓ | vowel | **Defer** | Breaks glide model for /r/ |
| Dark-L phantom (`o+l`) | ⚬⊃ᵔ∩ | — | **No** | Coda /l/, not a vowel phoneme |
| FOOT vs GOOSE split | new ⚬X | vowel | **Later** | No free simple/long slot |
| LOT / THOUGHT / PALM split | new ⚬X | vowel | **Later** | Same |
| Schwa vs STRUT split | new ⚬X | vowel | **Later** | Same |
| MOUTH vs GOAT (if ever re-merged) | — | — | **N/A** | Already split `ow` / `oh` in v3 |

**Net suggested growth (this note only):** **+3 vowel keys** + **+1 consonant key** → fourteen vowels and a complete throat column, still without new base Unicode symbols.


**Live (audit tooling):**

- [`js/collision-audit.js`](../js/collision-audit.js) — `findUnregisteredVowelShapedSequences()`, executive summary counts, audit report §4
- [`js/tests-core.js`](../js/tests-core.js) — matrix cardinality test
- [`docs/archive/FONORA_COLLISION_AUDIT.md`](../archive/FONORA_COLLISION_AUDIT.md) — regenerated §4 tables

**Documentation only (no inventory change):**

- This note (RN-23), including **proposed** vowel and consonant additions (not implemented)

**Not changed:** Phoneme keys, IPA routing, [`docs/language-rules.md`](../docs/language-rules.md) vowel tables, Sound Grid UI, encoder, or tests beyond the audit matrix cardinality check.

## Open Questions

- Should phantom diphthongs (⚬⊃ᵔ∩, ⚬⊃ᵔ⌓, …) get explicit UI labeling in Pronunciation Validation or the Sound Grid glossary?
- **`ear` / `air` / `ure`:** adopt as a GB bundle only, or globally replace centring collapse in `ENGLISH_IPA_VOWEL_NORMALIZATION`?
- **`ure` vs rhotic English:** map ʊə to `ure` only non-rhotically; keep `u r` for rhotic *poor*?
- **`⏌⊃` glottal stop:** is nasal+throat the right teaching story, or should documentation stress “reserved throat slot” over manner literalism?
- Does promoting r-colored sequences to vowel keys align with Fonora’s consonant-glide model for /r/, or require a rhotic dialect profile?
- Should boundary markers (RN-06 open question) distinguish Category A homographs from Category B phantom shapes in learner-facing copy?

## References

**Documentation:** [`docs/language-rules.md`](../docs/language-rules.md), [`docs/archive/FONORA_COLLISION_AUDIT.md`](../archive/FONORA_COLLISION_AUDIT.md), [`docs/FONORA_VOWEL_DECISION_REPORT.md`](../docs/FONORA_VOWEL_DECISION_REPORT.md)

**Interactive demo:** [Sound Grid](/script#grid), [Pronunciation Validation](/script#validate)

**Source:** [`js/collision-audit.js`](../js/collision-audit.js), [`js/vowel-grammar.js`](../js/vowel-grammar.js), [`js/vowel-display.js`](../js/vowel-display.js), [`js/ipa-normalize.js`](../js/ipa-normalize.js)

**Prior notes:** [RN-04 · Vowels as grammar](/research/notes/vowels-as-grammar-the-v3-rebuild), [RN-06 · Collision audit](/research/notes/hunting-ambiguity-in-the-script), [RN-22 · Mouth-intuitive vowel glyphs](/research/notes/mouth-intuitive-vowel-glyphs)

**Future research notes:** Adoption PR for `ear`/`air`/`ure` + `⏌⊃`; en-gb dialect profile; r-vowel promotion policy; learner study on phantom-diphthong readability
